/**
 * Lightweight Sentry error reporting via HTTP envelope API.
 * Zero dependencies — uses native fetch to POST events directly.
 */

// DSN format: https://<public_key>@<host>/<project_id>
const SENTRY_DSN = process.env.PEPPERMINT_WIZARD_SENTRY_DSN
  || "https://ee35ace1116aadd55a0ac5dc2226f5b2@o4510957452197888.ingest.us.sentry.io/4511341954203648";

let parsed: { publicKey: string; host: string; projectId: string } | null = null;

function parseDSN(): typeof parsed {
  if (parsed) return parsed;
  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace(/\//g, "");
    if (!url.username || !projectId) return null;
    parsed = { publicKey: url.username, host: `${url.protocol}//${url.host}`, projectId };
    return parsed;
  } catch {
    return null;
  }
}

// Read version once at import time
let wizardVersion = "unknown";
try {
  // Avoid fs import at top level — resolve lazily from package.json
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  wizardVersion = pkg.version ?? "unknown";
} catch {
  // Fine — version stays "unknown"
}

interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: "node";
  level: "error" | "warning" | "info";
  release?: string;
  environment?: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; lineno?: number; function?: string }> };
    }>;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
}

function uuid4(): string {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Report an error to Sentry. Fire-and-forget — never throws, never blocks exit.
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  const dsn = parseDSN();
  if (!dsn) return; // DSN not configured — silently skip

  const err = error instanceof Error ? error : new Error(String(error));
  const stack = err.stack;

  const frames = (stack?.split("\n").slice(1) ?? [])
    .map((line) => {
      const m = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/) ??
                line.match(/at\s+(.+?):(\d+):\d+/);
      if (!m) return null;
      return m.length === 4
        ? { function: m[1], filename: m[2], lineno: Number(m[3]) }
        : { filename: m[1], lineno: Number(m[2]) };
    })
    .filter(Boolean) as Array<{ filename: string; lineno?: number; function?: string }>;

  const event: SentryEvent = {
    event_id: uuid4(),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    release: `peppermint-mcp-wizard@${wizardVersion}`,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: frames.length > 0 ? { frames: frames.reverse() } : undefined,
        },
      ],
    },
    tags: context?.tags,
    extra: context?.extra,
    contexts: {
      runtime: { name: "node", version: process.version },
      os: { name: process.platform, version: process.arch },
    },
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, dsn: SENTRY_DSN, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event", length: 0 }),
    JSON.stringify(event),
  ].join("\n");

  const envelopeUrl = `${dsn.host}/api/${dsn.projectId}/envelope/`;

  // Fire-and-forget — don't await, don't catch
  fetch(envelopeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_key=${dsn.publicKey}, sentry_version=7` },
    body: envelope,
  }).catch(() => {});
}

/**
 * Wait briefly for in-flight Sentry requests to drain before exit.
 * Call this before process.exit() in error paths.
 */
export async function flush(timeoutMs = 2000): Promise<void> {
  // Give any in-flight fetch a moment to complete
  await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 2000)));
}
