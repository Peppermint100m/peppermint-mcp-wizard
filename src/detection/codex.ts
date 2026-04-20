import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DetectedHost } from "./index.js";

const exec = promisify(execFile);

export async function detectCodex(): Promise<DetectedHost | null> {
  let version: string | undefined;
  const warnings: string[] = [];

  try {
    const { stdout } = await exec("codex", ["--version"], { timeout: 5000 });
    version = stdout.trim().split("\n")[0];
  } catch {
    return null;
  }

  let alreadyInstalled = false;
  try {
    const { stdout } = await exec("codex", ["mcp", "list"], { timeout: 10000 });
    alreadyInstalled =
      stdout.includes("peppermint-memory") || stdout.includes("peppermint");
  } catch {
    warnings.push("Could not check existing MCP config");
  }

  return {
    id: "codex",
    name: "Codex CLI",
    version,
    installMethod: "cli",
    alreadyInstalled,
    needsRestart: false,
    warnings,
  };
}
