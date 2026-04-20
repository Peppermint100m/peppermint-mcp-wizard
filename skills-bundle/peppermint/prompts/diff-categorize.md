# Diff and categorize claims against Peppermint graph

Given a set of claims extracted from host memory files and the Peppermint search results for each, categorize what action to take.

## Input

For each claim, you receive:
- The claim: `{content, inferred_family, confidence}`
- Search results from Peppermint: 0-3 matching facts with content and similarity

## Categories

- **ADD** — Claim is new. No matching fact in Peppermint. Save it.
- **UPDATE** — Claim refines or updates an existing Peppermint fact (same topic, newer/more specific info). Save as update.
- **ADD-to-host** — Peppermint has this fact but the host memory file doesn't. Note for the user (don't auto-write to host files).
- **CONFLICT** — Claim contradicts a Peppermint fact (e.g., different role, different preference). Flag for user resolution.
- **SKIP** — Claim is a near-duplicate of an existing fact, or too low-confidence to act on.

## Rules

1. **Semantic matching, not string matching.** "Uses TypeScript" and "Prefers TypeScript for new projects" are the same fact (SKIP or UPDATE depending on specificity).

2. **Recency wins for current_work, current_blocker, project_assignments.** If the claim is more recent than the Peppermint fact, categorize as UPDATE.

3. **CONFLICTs require genuine contradiction.** "CTO" vs "Co-founder & CTO" is not a conflict — it's an UPDATE (more specific). "CTO" vs "VP Engineering" IS a conflict.

4. **Low-confidence claims:** If `confidence=low` and there's no matching Peppermint fact, categorize as SKIP (don't pollute the graph with weak signals).

5. **ADD-to-host is informational only.** The skill doesn't auto-write to CLAUDE.md or project memory files. It just tells the user "Peppermint knows X that your Claude Code memory doesn't."

## Output

For each claim, output:
```json
{
  "claim": "...",
  "category": "ADD | UPDATE | ADD-to-host | CONFLICT | SKIP",
  "reason": "one-line explanation",
  "matching_fact_id": "uuid or null"
}
```
