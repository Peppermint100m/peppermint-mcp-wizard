import { detectClaudeCode } from "./claude-code.js";
import { detectClaudeDesktop } from "./claude-desktop.js";
import { detectCursor } from "./cursor.js";
import { detectCodex } from "./codex.js";

export type HostId = "claude-code" | "claude-desktop" | "cursor" | "codex";

export interface DetectedHost {
  id: HostId;
  name: string;
  version?: string;
  installMethod: "cli" | "file-native-http" | "file-stdio-shim";
  configPath?: string;
  alreadyInstalled: boolean;
  needsRestart: boolean;
  warnings: string[];
}

export async function detectHosts(): Promise<DetectedHost[]> {
  const results = await Promise.allSettled([
    detectClaudeCode(),
    detectClaudeDesktop(),
    detectCursor(),
    detectCodex(),
  ]);

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DetectedHost | null> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value!);
}
