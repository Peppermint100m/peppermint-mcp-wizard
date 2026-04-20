import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredCredentials {
  api_key: string;
  email?: string;
  server: string;
  client_id: string;
  created_at: number;
}

function getCredentialsPath(): string {
  return join(homedir(), ".config", "peppermint", "credentials.json");
}

export function loadCredentials(server: string): StoredCredentials | null {
  const path = getCredentialsPath();
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");
    const creds: StoredCredentials = JSON.parse(content);
    if (creds.server !== server) return null;
    if (!creds.api_key || !creds.api_key.startsWith("pep_")) return null;
    return creds;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  const path = getCredentialsPath();
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(path, JSON.stringify(creds, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  const path = getCredentialsPath();
  if (existsSync(path)) {
    writeFileSync(path, "{}", { encoding: "utf-8", mode: 0o600 });
  }
}
