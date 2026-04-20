# @peppermint/mcp-wizard

One-command installer for [Peppermint](https://peppermint.com) MCP across AI coding hosts.

```bash
npx @peppermint/mcp-wizard
```

Detects your installed AI tools, authenticates with Peppermint, and writes the correct MCP config for each host. No manual JSON editing.

## Supported Hosts

| Host | Install method | Auth handled by |
|---|---|---|
| Claude Code | `claude mcp add` (CLI) | Claude Code (built-in MCP OAuth) |
| Claude Desktop | Config file + `mcp-remote` shim | Wizard (browser OAuth → API key) |
| Cursor | Config file (native HTTP) | Wizard (browser OAuth → API key) |
| Codex CLI | `codex mcp add` (CLI) | Codex (built-in MCP OAuth) |

## Usage

### Install Peppermint MCP

```bash
npx @peppermint/mcp-wizard
```

The wizard will:
1. Detect which AI hosts are installed on your machine
2. Let you choose which ones to configure
3. Open your browser to sign in (only for hosts that need it)
4. Write the MCP config for each selected host
5. Verify the installation

### Other commands

```bash
# List detected hosts and their status
npx @peppermint/mcp-wizard list

# Health check on existing installation
npx @peppermint/mcp-wizard doctor

# Remove Peppermint from selected hosts
npx @peppermint/mcp-wizard remove
```

### Flags

| Flag | Description |
|---|---|
| `--server <url>` | MCP server URL (default: `https://api.peppermint.com/mcp/`) |
| `--dry-run` | Print what would change without writing anything |
| `--no-verify` | Skip post-install health check |

### Using staging

```bash
npx @peppermint/mcp-wizard --server https://dev-api.peppermint.com/mcp/
```

## How it works

**CLI hosts (Claude Code, Codex):** The wizard runs the host's built-in `mcp add` command. Auth is handled by the host itself through the MCP protocol's browser OAuth flow — no token management needed.

**File-based hosts (Claude Desktop, Cursor):** The wizard performs a localhost OAuth flow:
1. Opens your browser to Peppermint's sign-in page
2. Catches the auth callback on a temporary localhost server
3. Creates a long-lived API key (`pep_...`) that doesn't expire
4. Writes the API key into the host's config JSON

Credentials are stored in `~/.config/peppermint/credentials.json`. On subsequent runs, the wizard reuses the existing API key without re-authenticating.

## Development

```bash
npm install
npm run build     # Build with tsup
npm run dev       # Watch mode
npm test          # Run tests
```
