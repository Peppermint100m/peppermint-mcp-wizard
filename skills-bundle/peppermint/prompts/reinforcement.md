# Generate 5-section reinforcement summary

After onboarding, generate a human-readable summary of what Peppermint knows about the user. This serves as a sanity check — the user reviews it and corrects anything wrong.

## Input

The user's Peppermint facts, organized by family. Fetched via:
- `search(query="identity role employer", scope="facts", limit=20)`
- `search(query="preference routine workflow", scope="facts", limit=20)`
- `search(query="team collaborator manager", scope="facts", limit=20)`
- `search(query="current work project blocker", scope="facts", limit=20)`

## Output format

```
Here's what Peppermint knows about you:

**Who you are at work**
[Role, company, department, expertise — 2-4 bullets]

**How you work**
[Tools, languages, workflows, patterns — 3-5 bullets]

**Who you work with**
[Key collaborators, team, reporting — 2-4 bullets]

**What you're working on**
[Active projects, current focus — 2-5 bullets]

**Rules and preferences**
[Coding style, communication preferences, hard rules — 2-5 bullets]

Does this look right? Tell me if anything is wrong or missing.
```

## Rules

1. **Natural language, not raw facts.** Don't say "fact_family: preference, content: uses uv". Say "You use uv for Python package management."

2. **Group related facts.** If there are 3 facts about Python tooling, combine them into one bullet.

3. **Prioritize by work relevance.** Lead each section with the most impactful facts.

4. **Cap each section at 5 bullets.** If more facts exist, pick the highest-value ones.

5. **Work-relevance filter.** Exclude family, hobbies, entertainment, health. If a fact slipped through, drop it silently.

6. **Acknowledge gaps.** If a section is empty (e.g., no team_membership facts), say "Not enough data yet — this section will fill in as Peppermint learns more."

7. **Tone:** Direct, professional, second-person ("You work at...", "Your team includes..."). Not formal, not casual.
