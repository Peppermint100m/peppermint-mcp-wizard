import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DetectedHost } from "./index.js";

const exec = promisify(execFile);

export async function detectCodex(): Promise<DetectedHost | null> {
  let version: string | undefined;

  try {
    const { stdout } = await exec("codex", ["--version"], { timeout: 5000 });
    version = stdout.trim().split("\n")[0];
  } catch {
    return null;
  }

  return {
    id: "codex",
    name: "Codex CLI",
    version,
    installMethod: "cli",
    alreadyInstalled: false,
    needsRestart: false,
    warnings: [],
  };
}
