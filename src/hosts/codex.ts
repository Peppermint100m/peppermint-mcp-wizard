import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { InstallResult } from "./claude-code.js";

const exec = promisify(execFile);

export async function installCodex(
  serverUrl: string,
  apiKey: string | undefined,
  dryRun: boolean,
): Promise<InstallResult> {
  const addArgs = ["mcp", "add", "peppermint-memory", "--url", serverUrl];

  // Pass API key so Codex doesn't trigger its own OAuth flow
  if (apiKey) {
    addArgs.push("--header", `Authorization: Bearer ${apiKey}`);
  }

  if (dryRun) {
    return {
      success: true,
      message: `Would run: codex ${addArgs.join(" ")}`,
      needsRestart: false,
    };
  }

  try {
    await exec("codex", addArgs, { timeout: 15000 });
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
