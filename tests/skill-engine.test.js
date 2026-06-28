import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { SkillEngine } from '../backend/skills/SkillEngine.js';

class FakeProvider {
  name = 'fake';
  async generate() {
    return {
      provider: this.name,
      model: 'fake-json',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      costUsd: 0,
      output: { quote: 'Doki prueba Skills', hint: 'Discovery sin tocar código.', action: 'wiggle' },
    };
  }
}

async function writeTestSkill(root, name = 'test-skill') {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
  await fs.mkdir(path.join(dir, 'examples'), { recursive: true });
  await fs.mkdir(path.join(dir, 'validators'), { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `name: ${name}
version: 1.0.0
description: Test skill
category: test
tags: test
owner: tests

# Purpose
Test purpose.
# When To Use
During tests.
# Inputs
Any JSON.
# Outputs
Doki JSON.
# Rules
Return safe JSON.
# Constraints
No hidden prompts.
# Examples
See examples.
# Failure Modes
Fallback.
# Validation Checklist
Schema passes.
# Execution Steps
Understand, plan, build, validate.
# Quality Standards
Reliable.
# Files Used
All local files.
# Dependencies
None.
# Prompt Template
Use template.
`);
  await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify({
    name,
    version: '1.0.0',
    description: 'Test skill',
    category: 'test',
    tags: ['test'],
    owner: 'tests',
    enabled: true,
  }));
  await fs.writeFile(path.join(dir, 'templates', 'prompt.md'), 'Return JSON.');
  await fs.writeFile(path.join(dir, 'examples', 'example.json'), '{"input":{},"output":{}}');
  await fs.writeFile(path.join(dir, 'validators', 'output.schema.json'), JSON.stringify({
    type: 'object',
    required: ['quote', 'hint', 'action'],
    properties: {
      quote: { type: 'string', maxLength: 120 },
      hint: { type: 'string', maxLength: 160 },
      action: { enum: ['wiggle', 'spin', 'jump', 'bark', 'zoom', null] },
    },
  }));
}

test('discovers newly added skills without code changes', async () => {
  const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-data-'));
  await writeTestSkill(skillsDir, 'dynamic-skill');
  const engine = new SkillEngine({ skillsDir, dataDir, provider: new FakeProvider() });
  const skills = await engine.listSkills();
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'dynamic-skill');
});

test('validates and executes a skill with schema-checked output', async () => {
  const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-data-'));
  await writeTestSkill(skillsDir, 'execute-skill');
  const engine = new SkillEngine({ skillsDir, dataDir, provider: new FakeProvider() });
  const validation = await engine.validateSkill('execute-skill');
  assert.equal(validation.ok, true);
  const result = await engine.executeSkill('execute-skill', { trigger: 'auto' });
  assert.equal(result.output.quote, 'Doki prueba Skills');
  assert.equal(result.log.status, 'ok');
});
