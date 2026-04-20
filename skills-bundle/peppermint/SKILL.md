---
name: peppermint
description: Peppermint memory companion — onboarding, @pep queries, passive capture.
when_to_trigger: |
  - User types `@pep <...>` or `/peppermint <...>`
  - User states a durable preference, rule, or identity claim
  - User asks about prior work, past decisions, or historical context
  - User references a teammate's work or asks what someone else is doing
allowed-tools:
  - mcp__peppermint-memory__search
  - mcp__peppermint-memory__get
  - mcp__peppermint-memory__discover_tools
  - mcp__peppermint-memory__create_memory
  - mcp__peppermint-memory__create_fact
  - mcp__peppermint-memory__update_memory
  - mcp__peppermint-memory__ask_twin
  - mcp__peppermint-memory__query_integration
  - Read
  - Write
  - Edit
---

# Peppermint companion skill

You are an assistant with access to Peppermint — a persistent memory system that captures what the user sees, hears, reads, and works on across their devices. Peppermint stores memories, facts, daily summaries, and integration data (Linear, Asana, Slack, Google Workspace, GitHub).

This skill handles three modes: **onboarding** (first run), **@pep queries** (daily use), and **passive capture** (background).

## 0. Host detection

Detect the host environment:
- If the user has `~/.claude/CLAUDE.md` or you're running inside Claude Code → **claude-code**
- If you detect Codex CLI markers → **codex**
- If you detect Gemini markers → **gemini**
- Otherwise → **unknown**

For v1, only **claude-code** gets the full onboarding flow. All hosts get `@pep` queries and passive capture.

---

## 1. Onboarding (claude-code only)

### 1.1 Detection — should onboarding run?

Check two signals:
1. **Server signal:** `search(query="onboarded claude-code", scope="facts", limit=1)` — look for a `skill_state` fact with subject `claude-code`
2. **File signal:** Check if `~/.claude/CLAUDE.md` contains `<!-- peppermint:onboarded`

| Server fact | File exists | Action |
|---|---|---|
| Missing | Missing | Run full onboarding |
| Present | Present | Skip — print "Peppermint is connected. Use @pep to query your memory." |
| One missing | One present | Warn about inconsistent state, run onboarding |

### 1.2 Onboarding flow

1. **Greet:** "Setting up Peppermint memory sync for Claude Code."

2. **Parse host memory files:**
   - Read `~/.claude/CLAUDE.md` (global)
   - Glob `~/.claude/projects/*/memory/*.md` (project memories)
   - Extract structured claims using the parse-claims sub-prompt (see `prompts/parse-claims.md`)
   - Each claim becomes: `{content, inferred_family, confidence}`

3. **Diff against Peppermint graph:**
   - For each batch of 10 claims, call `search(query=<claim>, scope="facts", limit=3)` in parallel
   - Categorize each claim using the diff-categorize sub-prompt (see `prompts/diff-categorize.md`)
   - Categories: ADD (new to Peppermint), UPDATE (refines existing), ADD-to-host (exists in Peppermint but not host), CONFLICT (contradicts), SKIP (trivial/duplicate)

4. **Present summary with top-3 examples per category:**
   ```
   Found 23 claims in your Claude Code memory.

   New to Peppermint (8):
   - "Prefers mental-model-first explanations"
   - "Uses uv for Python package management"
   - "Working on Peppermint MCP server architecture"
   ... and 5 more

   Already in Peppermint (12): synced
   Conflicts (1): "Role: CTO" vs Peppermint fact "Role: Co-founder & CTO"
   To add to Claude Code (2): ...
   ```

5. **Confirm:** Ask "Want me to sync these? I'll save the new claims to Peppermint and update your identity core." Accept freeform confirmation.

6. **Commit:**
   - Save ADD claims as facts: `create_fact(content=..., fact_family=..., fact_subject=...)`
   - Save UPDATE claims as facts (upsert behavior)
   - Resolve CONFLICTs per user instruction
   - Append the identity core to `~/.claude/CLAUDE.md` inside a marker fence (see identity-core template). If a previous `<!-- peppermint:onboarded` block exists, replace it in-place. This ensures the identity is always in Claude Code's context window.
   - Save onboarding marker: `create_fact(content="onboarded v=1 date=<today>", fact_family="skill_state", fact_subject="claude-code")`

7. **Post-onboarding training block:**
   ```
   ## How to use Peppermint from here on

   **@pep <question>** — Pull memory into a decision in flight. This is the daily driver.
   Examples: "@pep what was decided about the auth middleware?", "@pep what's PEP-371 status?"

   **@pep ask <teammate> <question>** — Ask a teammate's digital twin.
   Their twin answers from their memories. They're notified when their twin is queried.
   Example: "@pep ask Sabrina what's the status of the PII layer fix?"

   **@pep refresh** — Re-sync your identity core when things drift.

   Peppermint also runs passively — it captures durable preferences and decisions
   you state during normal work, without you having to invoke it.
   ```

8. **5-section reinforcement summary:** Generate using `prompts/reinforcement.md` and display as a sanity check. Ask "Does this look right?"

---

## 2. @pep handler

Users invoke this via `@pep <question>`, `/peppermint <question>`, or natural language that references prior work/decisions.

### 2.1 Self-query (default): route through ask_twin

For any `@pep <question>` that isn't a sub-command:

1. Call `ask_twin(person="me", question="<the question>", context="<last 3-5 conversation turns if available>")`
2. This routes through the **exact same pipeline** as the Slack twin:
   - 7 parallel backend queries (memories, facts, summaries, integrations, routines)
   - 8-turn agentic Gemini tool loop with 11 tools
   - Privacy domain filtering
   - All attribution/commitment/identity rules
3. Strip the `[<name>'s Twin]` header from the response (self-queries don't need it)
4. Present the response directly to the user

**Context passing:** When the user has been in a multi-turn conversation before invoking `@pep`, include the last 3-5 turns as the `context` parameter. This helps the twin understand references like "tell me more about that" or "what about the other option?"

### 2.2 Sub-commands

**`@pep ask <person> <question>`**
1. Call `ask_twin(person="<person>", question="<question>", context="<conversation context>")`
2. Present with `[<person>'s Twin]` header
3. **Pass through near-verbatim** — the twin's response already follows attribution/commitment rules. Do NOT:
   - Add commitments ("they'll get back to you")
   - Re-attribute ("the team confirmed" when the twin said "Sabrina confirmed")
   - Re-synthesize or editorialize
4. On error (twin declined, user not found, no context), show the specific error message from the tool

**`@pep refresh`**
1. Re-run the onboarding flow (§1.2) without the detection step
2. Replace the `<!-- peppermint:onboarded ... -->` block in `~/.claude/CLAUDE.md` with the new identity core
3. Update the `skill_state` fact with new date

**`@pep status`**
1. Call `get(kind="stats")` for memory stats
2. Call `search(query="connected", scope="facts", limit=5)` for integration status
3. Report: memory count, date range, connected integrations, last sync time

---

## 3. Passive capture

During normal conversation (not `@pep` invocations), watch for signals that the user stated something durable. Capture it silently.

### 3.1 Four-signal detection

A statement is worth capturing when ALL of these are true:
1. **Durable:** Would still be true next week (not "I'm debugging this right now")
2. **First-person:** The user is stating their own preference/decision/rule (not quoting someone)
3. **New or contradictory:** Not already captured in Peppermint (quick `search` check)
4. **Non-trivial:** Would change how an agent assists them ("I prefer TypeScript" yes; "I like coffee" no)

### 3.2 Don't capture list

Never capture:
- One-off debugging statements ("this variable is null")
- Emotional reactions ("this is frustrating")
- Questions the user is asking (they're seeking info, not stating facts)
- Code snippets or terminal output
- Anything about family, hobbies, entertainment, health, or personal life

### 3.3 Capture action

When a capturable signal is detected:
1. Activate the capture pack: `discover_tools(activate=["capture"])`
2. Determine if it's a new fact or memory:
   - **Facts** (durable identity/preference/role): `create_fact(content=..., fact_family=..., fact_subject=...)`
   - **Memories** (decisions, commitments, project context): `create_memory(content=..., tags=[...], importance=0.7)`
3. If contradicting an existing fact: note inline — "Updated your preference from X to Y in Peppermint."
4. If new: capture silently (no notification to user)

### 3.4 Budget

- Max 1 capture per conversation turn
- Max 15 captures per session
- If budget exhausted, stop watching (don't queue)

---

## 4. Error handling

| Error | Action |
|---|---|
| MCP server unreachable | Print "Peppermint is offline — memory features unavailable this session." Disable capture for the session. |
| `ask_twin` returns decline | Print "[person]'s twin doesn't have enough context to answer that right now." |
| `ask_twin` user not found | Print "No one matching '[person]' found in your organization." |
| `ask_twin` no org | Print "You need to be part of an organization to query teammates' twins." |
| `search` returns empty | Answer from conversation context alone, note "No relevant memories found in Peppermint." |
| Onboarding — < 10 facts | Run onboarding but note: "Your Peppermint memory is still building up. The more you use your devices with Peppermint running, the richer your memory gets." |
