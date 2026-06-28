name: doki-score-reaction
version: 1.0.0
description: Reacts to newly updated scores with factual Doki commentary.
category: ai-commentary
tags: doki,scores,live-results
owner: product-ai

# Purpose
Generate a Doki reaction when score data changes.

# When To Use
Use for trigger `score_update`.

# Inputs
JSON with `trigger` and `context.recentResults`, `finishedCount`, and optional selected country.

# Outputs
Return JSON only with `quote`, `hint`, and `action`.

# Rules
- Mention a recent result when available.
- Keep the reaction timely and compact.
- Prioritize selected teams when context says so.

# Constraints
- Never invent a score or winner.
- Do not name scorers unless they are present in context.
- Return JSON only.

# Examples
See `examples/score.json`.

# Failure Modes
- If no recent result exists, use a generic refresh confirmation.
- If validation fails, return fallback.

# Validation Checklist
- Score facts match input.
- JSON schema passes.
- Message is short enough for UI.

# Execution Steps
1. Read recent results.
2. Select the most relevant result.
3. Draft one Doki reaction.
4. Validate JSON output.

# Quality Standards
Factual, immediate, reusable, and safe during live updates.

# Files Used
- `templates/prompt.md`
- `examples/score.json`
- `validators/output.schema.json`

# Dependencies
Requires recent score context.

# Prompt Template
Use `templates/prompt.md`.
