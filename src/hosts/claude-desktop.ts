import { homedir } from "node:os";
import { join } from "node:path";
import type { InstallResult } from "./claude-code.js";
import { removeServerFromConfig, writeServerToConfig } from "./json-config.js";

function getConfigPath(): string {
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
}

export async function installClaudeDesktop(
  serverUrl: string,
  apiKey: string,
  dryRun: boolean,
): Promise<InstallResult> {
  const configPath = getConfigPath();

  // Native HTTP MCP — Claude Desktop supports this since ~v0.10
  const serverConfig = {
    url: serverUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  try {
    // Remove legacy "peppermint" entry if it exists (Bug 8)
    removeServerFromConfig(configPath, "mcpServers", "peppermint", dryRun);

    const result = writeServerToConfig({
      filePath: configPath,
      serverProperty: "mcpServers",
      serverName: "peppermint-memory",
      serverConfig,
      dryRun,
    });

    if (result === null) {
      return { success: true, message: "Already up to date", needsRestart: false };
    }
    return {
      success: true,
      message: dryRun ? result : `Wrote config to ${configPath}`,
      needsRestart: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Config write failed";
    return { success: false, message, needsRestart: false };
  }
}

export async function removeClaudeDesktop(
  dryRun: boolean,
): Promise<InstallResult> {
  const configPath = getConfigPath();
  const removed = removeServerFromConfig(
    configPath,
    "mcpServers",
    "peppermint-memory",
    dryRun,
  );

  return {
    success: true,
    message: removed
      ? "Removed peppermint from Claude Desktop config"
      : "peppermint not found in Claude Desktop config",
    needsRestart: true,
  };
}
