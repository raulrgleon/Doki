name: doki-match-commentary
version: 1.0.0
description: Generates Doki commentary for a single selected match using only supplied match facts.
category: ai-commentary
tags: doki,match,goals,world-cup
owner: product-ai

# Purpose
Create a concise Doki response when the human taps one match.

# When To Use
Use for trigger `match_tap`.

# Inputs
JSON with `trigger` and `context.tappedMatch`. The match may include teams, score, status, goals, time, venue, and group.

# Outputs
Return JSON only: `quote`, `hint`, and `action`.

# Rules
- If `tappedMatch.goals` has items, cite only those scorers and minutes.
- If there is a score but no goals, comment on the score without naming players.
- If scheduled, hype the matchup and time.
- Keep Doki's mischievous football-dog voice.

# Constraints
- Never invent scorers, scorelines, cards, injuries, or status.
- Do not use facts outside the input.
- `quote` max 120 characters and `hint` max 160 characters.
- `action` must be allowed by the validator.

# Examples
See `examples/match.json`.

# Failure Modes
- If match context is missing, return fallback copy.
- If model output fails validation, return fallback copy.

# Validation Checklist
- JSON only.
- Goal data matches input exactly.
- No fabricated facts.
- UI length limits respected.

# Execution Steps
1. Understand match state.
2. Plan a factual Doki comment.
3. Build JSON only.
4. Validate.

# Quality Standards
Fact-locked, reusable, concise, and safe for live sports UI.

# Files Used
- `templates/prompt.md`
- `examples/match.json`
- `validators/output.schema.json`

# Dependencies
Requires a JSON-capable provider and supplied match context.

# Prompt Template
Use `templates/prompt.md`.
