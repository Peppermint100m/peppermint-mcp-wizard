import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import open from "open";
import { saveCredentials, type StoredCredentials } from "./token-store.js";

const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function registerClient(
  serverBase: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch(`${serverBase}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Peppermint MCP Wizard",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Client registration failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.client_id;
}

async function exchangeCodeForTokens(
  serverBase: string,
  code: string,
  redirectUri: string,
  clientId: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number; email?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const res = await fetch(`${serverBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function createApiKey(
  serverBase: string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${serverBase}/auth/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: "mcp-wizard",
      scopes: ["read:own", "write:own", "read:team"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API key creation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  // Backend returns { raw_key: "pep_...", id, name, scopes, ... }
  return data.raw_key;
}

function waitForCallback(
  port: number,
  expectedState: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out (5 minutes). Please try again."));
    }, AUTH_TIMEOUT_MS);

    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authorization denied.</h2><p>You can close this tab.</p></body></html>");
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400);
        res.end("Missing authorization code");
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400);
        res.end("State mismatch");
        clearTimeout(timeout);
        server.close();
        reject(new Error("OAuth state mismatch — possible CSRF"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h2>Authenticated!</h2><p>You can close this tab and return to the terminal.</p></body></html>",
      );
      clearTimeout(timeout);
      server.close();
      resolve({ code });
    });

    server.listen(port, "127.0.0.1");
  });
}

export async function authenticateWithBrowser(
  serverBase: string,
): Promise<StoredCredentials> {
  // 1. Start localhost server on random port
  const tempServer = createServer();
  await new Promise<void>((resolve) => {
    tempServer.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (tempServer.address() as { port: number }).port;
  tempServer.close();

  const redirectUri = `http://127.0.0.1:${port}/callback`;

  // 2. Register OAuth client
  const clientId = await registerClient(serverBase, redirectUri);

  // 3. Generate PKCE
  const { verifier, challenge } = generatePKCE();

  // 4. Generate state for CSRF protection
  const state = randomBytes(16).toString("hex");

  // 5. Start callback server
  const callbackPromise = waitForCallback(port, state);

  // 6. Open browser
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  const authorizeUrl = `${serverBase}/oauth/authorize?${params}`;
  await open(authorizeUrl);

  // 7. Wait for callback
  const { code } = await callbackPromise;

  // 8. Exchange code for tokens
  const tokens = await exchangeCodeForTokens(
    serverBase,
    code,
    redirectUri,
    clientId,
    verifier,
  );

  // 9. Create API key (long-lived, doesn't expire)
  const rawKey = await createApiKey(serverBase, tokens.access_token);

  // 10. Store credentials
  const creds: StoredCredentials = {
    api_key: rawKey,
    email: tokens.email,
    server: serverBase,
    client_id: clientId,
    created_at: Date.now(),
  };

  saveCredentials(creds);

  return creds;
}
