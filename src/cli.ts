import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectHosts, type DetectedHost, type HostId } from "./detection/index.js";
import { loadCredentials, clearCredentials } from "./auth/token-store.js";
import { authenticateWithBrowser } from "./auth/localhost-oauth.js";
import { installClaudeCode, removeClaudeCode } from "./hosts/claude-code.js";
import { installClaudeDesktop, removeClaudeDesktop } from "./hosts/claude-desktop.js";
import { installCursor, removeCursor } from "./hosts/cursor.js";
import { installCodex, removeCodex } from "./hosts/codex.js";
import { checkServerReachable } from "./verify/server.js";
import { checkHostConfig } from "./verify/host.js";
import { installSkills, removeLegacySkills } from "./skills/index.js";
import { installPermissions } from "./skills/permissions.js";

const DEFAULT_SERVER = "https://api.peppermint.com/mcp/";

function serverBase(serverUrl: string): string {
  // Strip /mcp/ suffix to get the base URL for OAuth endpoints
  return serverUrl.replace(/\/mcp\/?$/, "");
}

function needsAuth(_hosts: DetectedHost[]): boolean {
  // Always auth — CLI hosts (Claude Code, Codex) also benefit from having
  // the API key passed as a header to avoid a second browser OAuth prompt.
  return true;
}

async function installHost(
  host: DetectedHost,
  serverUrl: string,
  apiKey: string | undefined,
  dryRun: boolean,
) {
  switch (host.id) {
    case "claude-code":
      return installClaudeCode(serverUrl, apiKey, dryRun);
    case "claude-desktop":
      if (!apiKey) throw new Error("API key required for Claude Desktop");
      return installClaudeDesktop(serverUrl, apiKey, dryRun);
    case "cursor":
      if (!apiKey) throw new Error("API key required for Cursor");
      return installCursor(serverUrl, apiKey, dryRun);
    case "codex":
      return installCodex(serverUrl, apiKey, dryRun);
  }
}

async function removeHost(host: DetectedHost, dryRun: boolean) {
  switch (host.id) {
    case "claude-code":
      return removeClaudeCode(dryRun);
    case "claude-desktop":
      return removeClaudeDesktop(dryRun);
    case "cursor":
      return removeCursor(dryRun);
    case "codex":
      return removeCodex(dryRun);
  }
}

// ── Subcommands ──────────────────────────────────────────────────────────

async function addCommand(options: {
  server: string;
  dryRun: boolean;
  verify: boolean;
  host?: string[];
  yes: boolean;
  authToken?: string;
}) {
  const nonInteractive = options.yes || options.host?.length || options.authToken || !process.stdin.isTTY;

  if (!process.stdin.isTTY && !nonInteractive) {
    console.error("Error: peppermint-mcp-wizard requires an interactive terminal.");
    console.error("For non-interactive installs, use: --host claude-code --yes");
    process.exit(1);
  }

  if (!nonInteractive) {
    p.intro(pc.green("🌿 Peppermint MCP Wizard"));
  }

  // 1. Detect hosts
  const hosts = await detectHosts();

  if (!nonInteractive) {
    const s = p.spinner();
    s.start("Detecting AI hosts...");
    // Already detected above, just show spinner briefly
    s.stop("Detection complete");

    if (hosts.length === 0) {
      p.log.error(
        "No supported AI hosts detected. Install Claude Code, Claude Desktop, Cursor, or Codex CLI and try again.",
      );
      process.exit(6);
    }

    // Display detected hosts
    for (const host of hosts) {
      const status = host.alreadyInstalled
        ? pc.yellow("already configured")
        : pc.dim("not configured");
      const version = host.version ? pc.dim(` (${host.version})`) : "";
      p.log.info(`${host.alreadyInstalled ? "⚠" : "✓"} ${host.name}${version}  ${status}`);
    }
  } else if (hosts.length === 0) {
    console.error("No supported AI hosts detected.");
    process.exit(6);
  }

  // 2. Select hosts
  let selectedHosts: DetectedHost[];

  if (options.host?.length) {
    // Non-interactive: use specified hosts
    const requestedIds = options.host as HostId[];
    selectedHosts = hosts.filter((h) => requestedIds.includes(h.id));
    const missing = requestedIds.filter((id) => !hosts.find((h) => h.id === id));
    if (missing.length > 0) {
      const msg = `Host(s) not detected: ${missing.join(", ")}`;
      nonInteractive ? console.error(msg) : p.log.error(msg);
      process.exit(6);
    }
  } else if (nonInteractive) {
    // --yes without --host: install to all detected hosts
    selectedHosts = hosts;
  } else {
    // Interactive: prompt
    const unconfigured = hosts.filter((h) => !h.alreadyInstalled);
    const toInstall = unconfigured.length > 0 ? unconfigured : hosts;

    const selected = await p.multiselect({
      message: "Install Peppermint MCP into which hosts?",
      options: toInstall.map((h) => ({
        value: h.id,
        label: h.name,
        hint: h.alreadyInstalled ? "will reinstall" : undefined,
      })),
      initialValues: toInstall.map((h) => h.id),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    selectedHosts = hosts.filter((h) =>
      (selected as HostId[]).includes(h.id),
    );
  }

  // 3. Check server reachability
  const serverCheck = await checkServerReachable(options.server);
  if (!serverCheck.reachable) {
    const msg = `Cannot reach ${options.server}: ${serverCheck.error}`;
    nonInteractive ? console.error(msg) : p.log.error(msg);
    process.exit(4);
  }
  if (!nonInteractive) {
    p.log.success(`Server reachable ${pc.dim(`(${serverCheck.latencyMs}ms)`)}`);
  }

  // 4. Authenticate
  let apiKey: string | undefined;

  // --auth-token flag or PEPPERMINT_AUTH_TOKEN env var
  const tokenFromFlag = options.authToken || process.env.PEPPERMINT_AUTH_TOKEN;
  if (tokenFromFlag) {
    apiKey = tokenFromFlag;
    const msg = "Using provided auth token";
    nonInteractive ? console.log(msg) : p.log.success(msg);
  } else if (needsAuth(selectedHosts)) {
    const base = serverBase(options.server);
    const existing = loadCredentials(base);
    if (existing) {
      apiKey = existing.api_key;
      const msg = `Authenticated as ${existing.email || "user"} (cached)`;
      nonInteractive ? console.log(msg) : p.log.success(pc.bold(msg));
    } else if (nonInteractive) {
      console.error("Error: non-interactive mode requires --auth-token or PEPPERMINT_AUTH_TOKEN, or cached credentials.");
      process.exit(3);
    } else {
      p.log.info("Opening browser for authentication...");
      try {
        const creds = await authenticateWithBrowser(base);
        apiKey = creds.api_key;
        p.log.success(`Authenticated as ${pc.bold(creds.email || "user")}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Authentication failed";
        p.log.error(msg);
        process.exit(3);
      }
    }
  }

  // 5. Install to each host
  p.log.step("Installing...");
  const results = [];
  for (const host of selectedHosts) {
    const result = await installHost(host, options.server, apiKey, options.dryRun);
    const icon = result.success ? pc.green("✓") : pc.red("✗");
    p.log.info(`  ${icon} ${host.name}  ${pc.dim(result.message)}`);
    results.push({ host, result });
  }

  // 6. Install companion skill + permissions (if Claude Code/Desktop detected, even if not selected)
  const hasClaudeHost = hosts.some(
    (h) => h.id === "claude-code" || h.id === "claude-desktop",
  );
  if (hasClaudeHost) {
    // Remove legacy skills
    const removed = removeLegacySkills(options.dryRun);
    if (removed.length > 0) {
      p.log.info(`  ${pc.green("✓")} Removed legacy skills: ${pc.dim(removed.join(", "))}`);
    }

    // Install unified skill (always overwrites to pick up updates)
    const skillResult = installSkills(options.dryRun);
    if (skillResult.skipped) {
      p.log.info(`  ${pc.green("✓")} Peppermint skill  ${pc.dim("up to date")}`);
    } else if (skillResult.installed) {
      const verb = skillResult.updated ? "Updated" : "Installed";
      const backup = skillResult.backedUp ? pc.dim(" (previous version backed up)") : "";
      p.log.info(`  ${pc.green("✓")} ${verb} Peppermint skill${backup}  ${pc.dim(skillResult.targetPath)}`);
    } else if (skillResult.error) {
      p.log.info(`  ${pc.red("✗")} Skill install failed: ${pc.dim(skillResult.error)}`);
    }

    // Add tool permissions to Claude Code settings
    const permsResult = installPermissions(options.dryRun);
    if (permsResult.error) {
      p.log.info(`  ${pc.red("✗")} Permissions: ${pc.dim(permsResult.error)}`);
    } else if (permsResult.added.length > 0) {
      p.log.info(`  ${pc.green("✓")} Added ${permsResult.added.length} tool permissions to Claude Code settings`);
    }
  }

  // 7. Verify
  if (options.verify && !options.dryRun) {
    p.log.step("Verifying...");
    for (const { host } of results) {
      const check = checkHostConfig(host.id, host.configPath);
      const icon =
        check.status === "pass"
          ? pc.green("✓")
          : check.status === "warn"
            ? pc.yellow("⚠")
            : pc.red("✗");
      p.log.info(`  ${icon} ${host.name}  ${pc.dim(check.message)}`);
    }
  }

  // 8. Summary
  const needRestart = results.filter((r) => r.result.needsRestart);
  const failed = results.filter((r) => !r.result.success);

  p.outro(
    failed.length > 0
      ? pc.red(`${failed.length} host(s) failed. Check the output above.`)
      : hasClaudeHost
        ? pc.green("Done!") +
          (needRestart.length > 0
            ? pc.dim(` Restart ${needRestart.map((r) => r.host.name).join(", ")} to finish.`)
            : "") +
          "\n\n  " + pc.cyan("Peppermint skill installed. Start a new Claude Code session and type") +
          "\n  " + pc.cyan("@pep or /peppermint to begin onboarding.")
        : needRestart.length > 0
          ? pc.green("Done!") +
            pc.dim(` Restart ${needRestart.map((r) => r.host.name).join(", ")} to finish.`)
          : pc.green("Done! Peppermint MCP is ready."),
  );

  if (failed.length > 0) process.exit(2);
}

async function listCommand(options: { server: string }) {
  p.intro(pc.green("🌿 Peppermint MCP Wizard — List"));

  const hosts = await detectHosts();
  if (hosts.length === 0) {
    p.log.warn("No supported AI hosts detected.");
    process.exit(6);
  }

  for (const host of hosts) {
    const status = host.alreadyInstalled
      ? pc.green("configured")
      : pc.dim("not configured");
    const version = host.version ? pc.dim(` (${host.version})`) : "";
    p.log.info(`${host.name}${version}  ${status}`);
  }

  p.outro(`${hosts.length} host(s) detected`);
}

async function doctorCommand(options: { server: string }) {
  p.intro(pc.green("🌿 Peppermint MCP Wizard — Doctor"));

  // Server check
  const serverCheck = await checkServerReachable(options.server);
  const serverIcon = serverCheck.reachable ? pc.green("✓") : pc.red("✗");
  p.log.info(
    `${serverIcon} Server  ${serverCheck.reachable ? pc.dim(`(${serverCheck.latencyMs}ms)`) : pc.red(serverCheck.error || "unreachable")}`,
  );

  // Credentials check
  const base = serverBase(options.server);
  const creds = loadCredentials(base);
  const credsIcon = creds ? pc.green("✓") : pc.yellow("⚠");
  p.log.info(
    `${credsIcon} Credentials  ${creds ? pc.dim(creds.email || "API key stored") : pc.yellow("no stored credentials")}`,
  );

  // Per-host checks
  const hosts = await detectHosts();
  for (const host of hosts) {
    const check = checkHostConfig(host.id, host.configPath);
    const icon =
      check.status === "pass"
        ? pc.green("✓")
        : check.status === "warn"
          ? pc.yellow("⚠")
          : pc.red("✗");
    p.log.info(`${icon} ${host.name}  ${pc.dim(check.message)}`);
  }

  p.outro("Health check complete");
}

async function removeCommand(options: { server: string; dryRun: boolean; yes: boolean; revokeToken: boolean }) {
  const nonInteractive = options.yes || !process.stdin.isTTY;

  if (!process.stdin.isTTY && !nonInteractive) {
    console.error("Error: peppermint-mcp-wizard requires an interactive terminal.");
    console.error("For non-interactive removes, use: --yes");
    process.exit(1);
  }

  if (!nonInteractive) {
    p.intro(pc.green("🌿 Peppermint MCP Wizard — Remove"));
  }

  const hosts = await detectHosts();
  const installed = hosts.filter((h) => h.alreadyInstalled);

  if (installed.length === 0) {
    const msg = "Peppermint is not installed in any detected hosts.";
    nonInteractive ? console.log(msg) : p.log.info(msg);
    process.exit(0);
  }

  let selectedHosts: DetectedHost[];

  if (nonInteractive) {
    // Remove from all installed hosts
    selectedHosts = installed;
  } else {
    const selected = await p.multiselect({
      message: "Remove Peppermint MCP from which hosts?",
      options: installed.map((h) => ({
        value: h.id,
        label: h.name,
      })),
      initialValues: installed.map((h) => h.id),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    selectedHosts = hosts.filter((h) =>
      (selected as HostId[]).includes(h.id),
    );
  }

  for (const host of selectedHosts) {
    const result = await removeHost(host, options.dryRun);
    const icon = result.success ? pc.green("✓") : pc.red("✗");
    nonInteractive
      ? console.log(`${result.success ? "✓" : "✗"} ${host.name}  ${result.message}`)
      : p.log.info(`${icon} ${host.name}  ${pc.dim(result.message)}`);
  }

  // Revoke API key on the server (Bug 18)
  if (options.revokeToken) {
    const base = serverBase(options.server);
    const creds = loadCredentials(base);
    if (creds && !options.dryRun) {
      try {
        // Revoke by listing keys and deleting the mcp-wizard ones
        const res = await fetch(`${base}/auth/api-keys`, {
          headers: { Authorization: `Bearer ${creds.api_key}` },
        });
        if (res.ok) {
          const keys = await res.json() as Array<{ id: string; name: string }>;
          for (const key of keys) {
            if (key.name === "mcp-wizard") {
              await fetch(`${base}/auth/api-keys/${key.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${creds.api_key}` },
              });
            }
          }
        }
        clearCredentials();
        const msg = "Revoked API key and cleared credentials";
        nonInteractive ? console.log(`✓ ${msg}`) : p.log.info(`${pc.green("✓")} ${msg}`);
      } catch {
        const msg = "Failed to revoke API key (credentials cleared locally)";
        clearCredentials();
        nonInteractive ? console.log(`⚠ ${msg}`) : p.log.info(`${pc.yellow("⚠")} ${msg}`);
      }
    } else if (creds && options.dryRun) {
      const msg = "Would revoke API key and clear credentials";
      nonInteractive ? console.log(msg) : p.log.info(msg);
    }
  }

  if (!nonInteractive) {
    p.outro("Removal complete");
  }
}

// ── Program ──────────────────────────────────────────────────────────────

const program = new Command()
  .name("peppermint-mcp-wizard")
  .description("One-command installer for Peppermint MCP")
  .version("0.1.0");

program
  .command("add", { isDefault: true })
  .description("Detect hosts, authenticate, install MCP config")
  .option("--server <url>", "MCP server URL", DEFAULT_SERVER)
  .option("--dry-run", "Print changes without writing", false)
  .option("--no-verify", "Skip post-install verification")
  .option("--host <id...>", "Install to specific hosts (claude-code, claude-desktop, cursor, codex)")
  .option("--yes", "Skip all prompts (non-interactive)", false)
  .option("--auth-token <token>", "API key or token for auth (skips browser OAuth)")
  .action((opts) => addCommand({
    server: opts.server,
    dryRun: opts.dryRun,
    verify: opts.verify,
    host: opts.host,
    yes: opts.yes,
    authToken: opts.authToken,
  }));

program
  .command("list")
  .description("List detected AI hosts and their Peppermint status")
  .option("--server <url>", "MCP server URL", DEFAULT_SERVER)
  .action((opts) => listCommand({ server: opts.server }));

program
  .command("doctor")
  .description("Run health checks on existing installation")
  .option("--server <url>", "MCP server URL", DEFAULT_SERVER)
  .action((opts) => doctorCommand({ server: opts.server }));

program
  .command("remove")
  .description("Remove Peppermint MCP from selected hosts")
  .option("--server <url>", "MCP server URL", DEFAULT_SERVER)
  .option("--dry-run", "Print changes without writing", false)
  .option("--yes", "Skip all prompts (non-interactive)", false)
  .option("--revoke-token", "Revoke API key on the server", true)
  .option("--no-revoke-token", "Keep API key for future re-installs")
  .action((opts) => removeCommand({ server: opts.server, dryRun: opts.dryRun, yes: opts.yes, revokeToken: opts.revokeToken }));

program.parse();
