# Parse claims from host memory files

Given the content of a user's memory file (CLAUDE.md, project memory, etc.), extract structured claims about the user.

## Input

The raw text content of one or more memory files.

## Output

A JSON array of claims:
```json
[
  {
    "content": "Prefers TypeScript over JavaScript for new projects",
    "inferred_family": "preference",
    "confidence": "high"
  },
  {
    "content": "Currently working on Peppermint MCP server architecture",
    "inferred_family": "current_work",
    "confidence": "medium"
  }
]
```

## Rules

1. **Extract only durable claims** — skip ephemeral task notes, debugging context, and conversation-specific instructions.

2. **Map to fact families:**
   - `identity` — who the user is (name, background, education)
   - `preference` — how they like things done (tools, patterns, styles, rules)
   - `routine` — recurring patterns (daily standup time, review process)
   - `current_work` — what they're actively building/fixing
   - `current_employer` — company name
   - `current_role` — job title
   - `current_blocker` — things blocking progress
   - `team_membership` — direct collaborators
   - `reporting_structure` — who reports to whom
   - `department` — organizational unit
   - `expertise` — skills and domain knowledge
   - `project_assignments` — projects they're on

3. **Confidence levels:**
   - `high` — explicitly stated ("I prefer X", "Always use Y")
   - `medium` — strongly implied by context (listed in preferences section)
   - `low` — weakly implied (mentioned once in passing)

4. **Skip these:**
   - Code snippets and command examples (these are documentation, not claims)
   - Tool configuration details (file paths, API endpoints)
   - Instructions to the AI that aren't about the user ("don't use emojis" is a preference; "respond in JSON" is a formatting instruction)

5. **Normalize:** Write claims as standalone sentences that make sense without the source file context.

6. **Deduplicate:** If the same fact appears multiple times across files, emit it once with the highest confidence.

7. **Work-relevance filter:** Would knowing this change the agent's advice on a work task? If no, skip it. Family, hobbies, entertainment, health, and personal life are always excluded.
