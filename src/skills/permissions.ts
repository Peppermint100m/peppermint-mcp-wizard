import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as jsonc from "jsonc-parser";

const REQUIRED_PERMISSIONS = [
  "mcp__peppermint-memory__search",
  "mcp__peppermint-memory__get",
  "mcp__peppermint-memory__discover_tools",
  "mcp__peppermint-memory__ask_twin",
  "mcp__peppermint-memory__query_integration",
  "mcp__peppermint-memory__create_memory",
  "mcp__peppermint-memory__create_fact",
  "mcp__peppermint-memory__update_memory",
];

function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function installPermissions(dryRun: boolean): { added: string[]; error?: string } {
  const settingsPath = getSettingsPath();

  try {
    let content = "";
    if (existsSync(settingsPath)) {
      content = readFileSync(settingsPath, "utf-8");
    }

    // Parse existing settings
    const parsed = content ? jsonc.parse(content) : {};
    const existingAllow: string[] = parsed?.permissions?.allow || [];

    // Find permissions that need to be added
    const toAdd = REQUIRED_PERMISSIONS.filter((p) => !existingAllow.includes(p));

    if (toAdd.length === 0) {
      return { added: [] };
    }

    if (dryRun) {
      return { added: toAdd };
    }

    // Merge: add our permissions to existing allow list
    const newAllow = [...existingAllow, ...toAdd];

    const edits = jsonc.modify(content, ["permissions", "allow"], newAllow, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    });
    const updated = jsonc.applyEdits(content, edits);

    // Ensure directory exists
    const dir = dirname(settingsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(settingsPath, updated, "utf-8");
    return { added: toAdd };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update permissions";
    return { added: [], error: message };
  }
}
