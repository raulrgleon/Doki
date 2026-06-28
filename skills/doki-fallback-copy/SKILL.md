name: doki-fallback-copy
version: 1.0.0
description: Provides deterministic Doki fallback copy when AI execution is unavailable or invalid.
category: fallback
tags: doki,fallback,resilience
owner: product-ai

# Purpose
Define reusable non-provider fallback behavior for Doki UI states.

# When To Use
Use when provider execution fails, output validation fails, or offline-safe copy is needed.

# Inputs
Trigger and UI context.

# Outputs
JSON with `quote`, `hint`, and `action`.

# Rules
- Keep copy factual and generic enough to avoid hallucination.
- Prefer safe calendar or waiting messages.
- Preserve Doki voice.

# Constraints
- No generated sports facts.
- No secret or internal details.
- JSON only.

# Examples
See `examples/fallback.json`.

# Failure Modes
This Skill is itself the fallback; if unavailable, use `DEFAULT_DOKI_FALLBACK`.

# Validation Checklist
- Schema-valid JSON.
- No fabricated facts.
- Useful public UI copy.

# Execution Steps
1. Identify failed trigger.
2. Select safe fallback message.
3. Validate response.

# Quality Standards
Reliable, deterministic, and safe by default.

# Files Used
- `templates/prompt.md`
- `examples/fallback.json`
- `validators/output.schema.json`

# Dependencies
None.

# Prompt Template
Use `templates/prompt.md`.
