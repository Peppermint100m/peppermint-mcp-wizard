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

  const serverConfig = {
    command: "npx",
    args: [
      "-y",
      "mcp-remote@latest",
      serverUrl,
      "--header",
      "Authorization:${PEPPERMINT_AUTH_HEADER}",
    ],
    env: {
      PEPPERMINT_AUTH_HEADER: `Bearer ${apiKey}`,
    },
  };

  try {
    const result = writeServerToConfig({
      filePath: configPath,
      serverProperty: "mcpServers",
      serverName: "peppermint",
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

export async function removeClaudeDesktop(
  dryRun: boolean,
): Promise<InstallResult> {
  const configPath = getConfigPath();
  const removed = removeServerFromConfig(
    configPath,
    "mcpServers",
    "peppermint",
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
