import { homedir } from "node:os";
import { join } from "node:path";
import type { InstallResult } from "./claude-code.js";
import { removeServerFromConfig, writeServerToConfig } from "./json-config.js";

function getConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

export async function installCursor(
  serverUrl: string,
  apiKey: string,
  dryRun: boolean,
): Promise<InstallResult> {
  const configPath = getConfigPath();

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

export async function removeCursor(dryRun: boolean): Promise<InstallResult> {
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
      ? "Removed peppermint from Cursor config"
      : "peppermint not found in Cursor config",
    needsRestart: true,
  };
}
