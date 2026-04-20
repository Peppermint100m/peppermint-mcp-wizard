import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DetectedHost } from "./index.js";

const exec = promisify(execFile);

export async function detectClaudeCode(): Promise<DetectedHost | null> {
  const warnings: string[] = [];
  let version: string | undefined;

  try {
    const { stdout } = await exec("claude", ["--version"], { timeout: 5000 });
    version = stdout.trim().split("\n")[0];
  } catch {
    return null;
  }

  // Check if peppermint is already installed
  let alreadyInstalled = false;
  try {
    const { stdout } = await exec("claude", ["mcp", "list"], {
      timeout: 10000,
    });
    alreadyInstalled =
      stdout.includes("peppermint-memory") || stdout.includes("peppermint");
  } catch {
    warnings.push("Could not check existing MCP config");
  }

  return {
    id: "claude-code",
    name: "Claude Code",
    version,
    installMethod: "cli",
    alreadyInstalled,
    needsRestart: false,
    warnings,
  };
}
