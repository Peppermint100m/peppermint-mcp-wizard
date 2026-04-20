import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as jsonc from "jsonc-parser";
import type { DetectedHost } from "./index.js";

function getConfigPath(): string {
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
}

function getConfigDir(): string {
  return join(homedir(), "Library", "Application Support", "Claude");
}

export async function detectClaudeDesktop(): Promise<DetectedHost | null> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();
  const appExists = existsSync("/Applications/Claude.app");
  const configDirExists = existsSync(configDir);

  if (!appExists && !configDirExists) {
    return null;
  }

  const warnings: string[] = [];
  let alreadyInstalled = false;

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const parsed = jsonc.parse(content);
      alreadyInstalled = !!parsed?.mcpServers?.peppermint;
    } catch {
      warnings.push("Config file exists but could not be parsed");
    }
  }

  return {
    id: "claude-desktop",
    name: "Claude Desktop",
    installMethod: "file-stdio-shim",
    configPath,
    alreadyInstalled,
    needsRestart: true,
    warnings,
  };
}
