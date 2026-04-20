import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import * as jsonc from "jsonc-parser";

export interface WriteConfigOptions {
  filePath: string;
  serverProperty: string; // 'mcpServers'
  serverName: string; // 'peppermint'
  serverConfig: Record<string, unknown>;
  dryRun: boolean;
}

export function writeServerToConfig(options: WriteConfigOptions): string {
  const { filePath, serverProperty, serverName, serverConfig, dryRun } =
    options;

  // Ensure parent directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    if (dryRun) {
      return `Would create directory: ${dir}\nWould create: ${filePath}`;
    }
    mkdirSync(dir, { recursive: true });
  }

  // Read existing content
  let content = "";
  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf-8");
  }

  // Apply the edit using jsonc-parser (preserves comments + formatting)
  const edits = jsonc.modify(content, [serverProperty, serverName], serverConfig, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  const updated = jsonc.applyEdits(content, edits);

  // Validate the result parses
  const errors: jsonc.ParseError[] = [];
  jsonc.parse(updated, errors);
  if (errors.length > 0) {
    throw new Error(
      `Config merge produced invalid JSON: ${errors.map((e) => jsonc.printParseErrorCode(e.error)).join(", ")}`,
    );
  }

  if (dryRun) {
    return `Would write to ${filePath}:\n${updated}`;
  }

  // Backup existing file
  if (existsSync(filePath)) {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    copyFileSync(filePath, backupPath);
  }

  // Atomic write: write to temp, then rename
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, updated, "utf-8");
  renameSync(tmpPath, filePath);

  return filePath;
}

export function removeServerFromConfig(
  filePath: string,
  serverProperty: string,
  serverName: string,
  dryRun: boolean,
): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  const edits = jsonc.modify(content, [serverProperty, serverName], undefined, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });

  if (edits.length === 0) {
    return false;
  }

  const updated = jsonc.applyEdits(content, edits);

  if (dryRun) {
    return true;
  }

  const backupPath = `${filePath}.bak.${Date.now()}`;
  copyFileSync(filePath, backupPath);

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, updated, "utf-8");
  renameSync(tmpPath, filePath);

  return true;
}
