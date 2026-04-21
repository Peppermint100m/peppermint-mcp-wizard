import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { InstallResult } from "./claude-code.js";

const exec = promisify(execFile);

/**
 * Write PEPPERMINT_TOKEN to ~/.codex/.env so Codex can read it at runtime.
 */
function persistCodexEnvVar(apiKey: string): void {
  const codexDir = join(homedir(), ".codex");
  const envPath = join(codexDir, ".env");

  if (!existsSync(codexDir)) {
    mkdirSync(codexDir, { recursive: true });
  }

  // Read existing .env and update/add the PEPPERMINT_TOKEN line
  let content = "";
  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
  }

  const lines = content.split("\n").filter((l) => !l.startsWith("PEPPERMINT_TOKEN="));
  lines.push(`PEPPERMINT_TOKEN=${apiKey}`);
  writeFileSync(envPath, lines.filter(Boolean).join("\n") + "\n", { mode: 0o600 });
}

export async function installCodex(
  serverUrl: string,
  apiKey: string | undefined,
  dryRun: boolean,
): Promise<InstallResult> {
  const addArgs = ["mcp", "add", "peppermint-memory", "--url", serverUrl];

  if (apiKey) {
    addArgs.push("--bearer-token-env-var", "PEPPERMINT_TOKEN");
  }

  if (dryRun) {
    return {
      success: true,
      message: `Would run: codex ${addArgs.join(" ")}`,
      needsRestart: false,
    };
  }

  try {
    // Persist the token so Codex can read it at runtime
    if (apiKey) {
      persistCodexEnvVar(apiKey);
    }

    // Remove existing entry first to ensure URL + headers are updated
    try {
      await exec("codex", ["mcp", "remove", "peppermint-memory"], { timeout: 15000 });
    } catch {
      // Ignore — may not exist
    }

    const env = { ...process.env };
    if (apiKey) {
      env.PEPPERMINT_TOKEN = apiKey;
    }
    await exec("codex", addArgs, { timeout: 15000, env });
    return {
      success: true,
      message: "Added peppermint-memory via codex mcp add",
      needsRestart: false,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "codex mcp add failed";
    return { success: false, message, needsRestart: false };
  }
}

export async function removeCodex(dryRun: boolean): Promise<InstallResult> {
  const args = ["mcp", "remove", "peppermint-memory"];

  if (dryRun) {
    return {
      success: true,
      message: `Would run: codex ${args.join(" ")}`,
      needsRestart: false,
    };
  }

  try {
    await exec("codex", args, { timeout: 15000 });
    return {
      success: true,
      message: "Removed peppermint-memory via codex mcp remove",
      needsRestart: false,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "codex mcp remove failed";
    return { success: false, message, needsRestart: false };
  }
}
