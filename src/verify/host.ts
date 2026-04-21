import { existsSync, readFileSync } from "node:fs";
import * as jsonc from "jsonc-parser";
import type { HostId } from "../detection/index.js";

export interface HostCheckResult {
  hostId: HostId;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function checkHostConfig(
  hostId: HostId,
  configPath: string | undefined,
): HostCheckResult {
  if (!configPath) {
    // CLI hosts (claude-code, codex) — no config file to check
    return {
      hostId,
      status: "pass",
      message: "Installed via CLI",
    };
  }

  if (!existsSync(configPath)) {
    return {
      hostId,
      status: "fail",
      message: `Config file not found: ${configPath}`,
    };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = jsonc.parse(content);
    const hasPeppermint = !!parsed?.mcpServers?.["peppermint-memory"] || !!parsed?.mcpServers?.peppermint;

    if (!hasPeppermint) {
      return {
        hostId,
        status: "fail",
        message: "peppermint-memory entry not found in config",
      };
    }

    return {
      hostId,
      status: "warn",
      message: "Config written; restart required to verify",
    };
  } catch {
    return {
      hostId,
      status: "fail",
      message: `Config file could not be parsed: ${configPath}`,
    };
  }
}
