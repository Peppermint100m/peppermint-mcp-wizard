import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface InstallResult {
  success: boolean;
  message: string;
  needsRestart: boolean;
}

export async function installClaudeCode(
  serverUrl: string,
  dryRun: boolean,
): Promise<InstallResult> {
  const args = [
    "mcp",
    "add",
    "--scope",
    "user",
    "--transport",
    "http",
    "peppermint-memory",
    serverUrl,
  ];

  if (dryRun) {
    return {
      success: true,
      message: `Would run: claude ${args.join(" ")}`,
      needsRestart: false,
    };
  }

  try {
    await exec("claude", args, { timeout: 15000 });
    return {
      success: true,
      message: "Added peppermint-memory via claude mcp add",
      needsRestart: false,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "claude mcp add failed";
    return { success: false, message, needsRestart: false };
  }
}

export async function removeClaudeCode(
  dryRun: boolean,
): Promise<InstallResult> {
  const args = ["mcp", "remove", "--scope", "user", "peppermint-memory"];

  if (dryRun) {
    return {
      success: true,
      message: `Would run: claude ${args.join(" ")}`,
      needsRestart: false,
    };
  }

  try {
    await exec("claude", args, { timeout: 15000 });
    return {
      success: true,
      message: "Removed peppermint-memory via claude mcp remove",
      needsRestart: false,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "claude mcp remove failed";
    return { success: false, message, needsRestart: false };
  }
}
