# Identity core template

This template is used by the Peppermint skill to generate the identity core block
appended to `~/.claude/CLAUDE.md`. The skill fills in each section from the user's
Peppermint fact graph, wraps it in marker fences, and appends it to CLAUDE.md
(or replaces an existing block on refresh).

## Output format

```markdown
<!-- peppermint:onboarded v=1 date=YYYY-MM-DD -->
## Peppermint identity core

### Who you are at work
- Role: {current_role fact}
- Company: {current_employer fact}
- Department: {department fact}
- Expertise: {expertise facts, comma-separated}

### How you work
- {preference facts — tools, languages, workflows}
- {routine facts — daily patterns, work hours}

### Who you work with
- {team_membership facts — direct collaborators, max 5}
- {reporting_structure facts}

### What you're working on
- {current_work facts, max 5 most recent}
- {project_assignments facts}
- {current_blocker facts if any}

### Rules and preferences
- {preference facts that are rules — "always do X", "never do Y"}
- {identity facts that constrain behavior}
<!-- peppermint:end -->
```

## Token budget

Target: 500-800 tokens. Hard cap: 800 tokens.

### Priority cuts (when over budget)

1. Cut oldest "What you're working on" items (keep max 5)
2. Cut collaborators beyond top 5
3. Cut lowest-frequency rules/preferences
4. Cut department/reporting_structure if space is tight

### Work-relevance test

For each fact, ask: "Would knowing this change the agent's advice on a coding task?"

**Include:** role, tools, languages, frameworks, team, active projects, coding preferences, communication style
**Exclude:** family, hobbies, entertainment, health, food preferences, personal life
