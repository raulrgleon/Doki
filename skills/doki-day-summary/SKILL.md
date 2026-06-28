name: doki-day-summary
version: 1.0.0
description: Summarizes a selected World Cup calendar day in Doki's voice.
category: ai-commentary
tags: doki,calendar,day-summary
owner: product-ai

# Purpose
Create Doki commentary for a selected calendar day.

# When To Use
Use for trigger `day_select`.

# Inputs
JSON with `trigger` and `context.selectedDay`, including matches, scores, times, and selected date.

# Outputs
Return JSON only with `quote`, `hint`, and `action`.

# Rules
- Mention concrete teams from `selectedDay`.
- Use scores only when they are present.
- If all matches are scheduled, focus on times and anticipation.
- Keep the tone playful and useful.

# Constraints
- Do not invent teams, scores, or scorers.
- Do not exceed UI length limits.
- Return JSON only.

# Examples
See `examples/day.json`.

# Failure Modes
- If the selected day has no matches, return the fallback.
- If validation fails, return the fallback.

# Validation Checklist
- JSON only.
- Facts come from `selectedDay`.
- Doki voice is present.

# Execution Steps
1. Understand the selected day.
2. Separate finished, live, and scheduled matches.
3. Plan a short useful message.
4. Return validated JSON.

# Quality Standards
Accurate, reusable, concise, and calendar-aware.

# Files Used
- `templates/prompt.md`
- `examples/day.json`
- `validators/output.schema.json`

# Dependencies
Requires selected day context.

# Prompt Template
Use `templates/prompt.md`.
