export interface ServerCheckResult {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}

export async function checkServerReachable(
  serverUrl: string,
): Promise<ServerCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // Any response (even 401) means the server is reachable
    return { reachable: true, latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Server unreachable";
    return { reachable: false, error: message };
  }
}
