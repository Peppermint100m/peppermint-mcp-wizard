import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as jsonc from "jsonc-parser";
import type { DetectedHost } from "./index.js";

function getConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

export async function detectCursor(): Promise<DetectedHost | null> {
  const configPath = getConfigPath();
  const appExists = existsSync("/Applications/Cursor.app");
  const configExists = existsSync(configPath);

  if (!appExists && !configExists) {
    return null;
  }

  const warnings: string[] = [];
  let alreadyInstalled = false;

  if (configExists) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const parsed = jsonc.parse(content);
      alreadyInstalled = !!parsed?.mcpServers?.peppermint;
    } catch {
      warnings.push("Config file exists but could not be parsed");
    }
  }

  return {
    id: "cursor",
    name: "Cursor",
    installMethod: "file-native-http",
    configPath,
    alreadyInstalled,
    needsRestart: true,
    warnings,
  };
}
