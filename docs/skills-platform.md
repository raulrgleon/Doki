# Skills Platform

Doki is now organized as a Skills-driven AI platform. Source code routes requests,
loads context, validates output, records execution, and delegates model calls. AI
behavior lives in `/skills`, not in application source files.

## Add a Skill

Create:

```text
skills/new-feature/
  SKILL.md
  metadata.json
  templates/prompt.md
  examples/example.json
  validators/output.schema.json
```

The `SkillEngine` discovers the new directory automatically through
`discoverSkills()` and `listSkills()`. No route or source-code change is required.

## Required SKILL.md Sections

Each `SKILL.md` must include:

- name, version, description, category, tags, owner
- Purpose
- When To Use
- Inputs
- Outputs
- Rules
- Constraints
- Examples
- Failure Modes
- Validation Checklist
- Execution Steps
- Quality Standards
- Files Used
- Dependencies
- Prompt Template

## Runtime Flow

1. Load Skill.
2. Load examples.
3. Load templates.
4. Load validators.
5. Build context.
6. Execute through provider adapter.
7. Validate output schema.
8. Apply fallback if needed.
9. Log execution, usage, cost, cache, and latency.
10. Return output.

## Providers

Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY` for production. The provider
adapter is isolated under `backend/providers`, so other model providers can
implement the same `generate()` contract.

## Admin Dashboard

Open `/admin` and provide `ADMIN_TOKEN`. The dashboard supports viewing,
enabling/disabling, editing, duplicating, exporting, testing Skills, and viewing
execution logs and usage analytics.

## Development Workflow

For every request:

1. Understand the requirement.
2. Search existing Skills.
3. Reuse or compose if possible.
4. Create a new Skill only when needed.
5. Generate code only after the Skill contract is clear.
6. Validate.
7. Test.
8. Update documentation.
