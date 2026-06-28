import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  createSkillExecutionId,
  DEFAULT_DOKI_FALLBACK,
  REQUIRED_SKILL_METADATA_FIELDS,
  REQUIRED_SKILL_SECTIONS,
} from '../../shared/skill-contracts.js';
import { assertSafeSkillName, validateJsonSchema } from '../../shared/schema-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function normalizeSectionName(value) {
  return value.trim().replace(/^#+\s*/, '').replace(/:$/, '');
}

function parseSkillHeader(markdown) {
  const header = {};
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z][a-zA-Z -]*):\s*(.*)$/);
    if (!match) {
      if (Object.keys(header).length) break;
      continue;
    }
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '-');
    let value = match[2].trim();
    if (key === 'tags') value = value.split(',').map((tag) => tag.trim()).filter(Boolean);
    header[key] = value;
  }
  return header;
}

function extractSections(markdown) {
  const sections = new Set();
  markdown.split('\n').forEach((line) => {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) sections.add(normalizeSectionName(match[1]));
  });
  return sections;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readTextFiles(dirPath) {
  try {
    const names = await fs.readdir(dirPath);
    const files = [];
    for (const name of names.sort()) {
      const fullPath = path.join(dirPath, name);
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        files.push({ name, content: await fs.readFile(fullPath, 'utf8') });
      }
    }
    return files;
  } catch {
    return [];
  }
}

export class SkillEngine {
  constructor({
    skillsDir = path.join(PROJECT_ROOT, 'skills'),
    dataDir = path.join(PROJECT_ROOT, 'data'),
    provider,
    logger = console,
  } = {}) {
    this.skillsDir = skillsDir;
    this.dataDir = dataDir;
    this.provider = provider;
    this.logger = logger;
    this.skillCache = new Map();
    this.outputCache = new Map();
    this.rateLimits = new Map();
  }

  async discoverSkills() {
    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true }).catch(() => []);
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(this.skillsDir, entry.name);
      const skillFile = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillFile);
        const skill = await this.loadSkill(entry.name);
        if (skill.metadata.enabled !== false) skills.push(skill.summary);
      } catch (err) {
        this.logger.warn?.(`Skill discovery skipped ${entry.name}: ${err.message}`);
      }
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadSkill(name, { force = false } = {}) {
    assertSafeSkillName(name);
    if (!force && this.skillCache.has(name)) return this.skillCache.get(name);

    const skillPath = path.join(this.skillsDir, name);
    const markdown = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf8');
    const metadataFile = await readJson(path.join(skillPath, 'metadata.json'), {});
    const header = parseSkillHeader(markdown);
    const metadata = { ...header, ...metadataFile };
    const templates = await readTextFiles(path.join(skillPath, 'templates'));
    const examples = await readTextFiles(path.join(skillPath, 'examples'));
    const validatorFiles = await readTextFiles(path.join(skillPath, 'validators'));
    const validators = validatorFiles.map((file) => {
      try {
        return { name: file.name, schema: JSON.parse(file.content) };
      } catch {
        return { name: file.name, schema: null };
      }
    });

    const skill = {
      name,
      path: skillPath,
      markdown,
      metadata,
      templates,
      examples,
      validators,
      summary: {
        name,
        version: metadata.version,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags || [],
        owner: metadata.owner,
        enabled: metadata.enabled !== false,
      },
    };
    this.skillCache.set(name, skill);
    return skill;
  }

  async validateSkill(nameOrSkill) {
    const skill = typeof nameOrSkill === 'string' ? await this.loadSkill(nameOrSkill) : nameOrSkill;
    const errors = [];
    REQUIRED_SKILL_METADATA_FIELDS.forEach((field) => {
      if (!skill.metadata[field]) errors.push(`${skill.name}: missing metadata field ${field}`);
    });
    const sections = extractSections(skill.markdown);
    REQUIRED_SKILL_SECTIONS.forEach((section) => {
      if (!sections.has(section)) errors.push(`${skill.name}: missing section ${section}`);
    });
    if (!skill.validators.length) errors.push(`${skill.name}: missing validators`);
    return { ok: errors.length === 0, errors };
  }

  async reloadSkill(name) {
    this.skillCache.delete(name);
    return this.loadSkill(name, { force: true });
  }

  async listSkills() {
    return this.discoverSkills();
  }

  async composeSkills(names) {
    const skills = [];
    for (const name of names) skills.push(await this.loadSkill(name));
    return {
      names,
      prompt: skills.map((skill) => skill.markdown).join('\n\n---\n\n'),
      templates: skills.flatMap((skill) => skill.templates),
      examples: skills.flatMap((skill) => skill.examples),
      validators: skills.flatMap((skill) => skill.validators),
    };
  }

  async cacheSkills() {
    const skills = await this.discoverSkills();
    return Promise.all(skills.map((skill) => this.loadSkill(skill.name, { force: true })));
  }

  buildContext(skill, input) {
    return {
      skill: skill.markdown,
      examples: skill.examples,
      templates: skill.templates,
      validators: skill.validators.map((validator) => validator.name),
      input,
    };
  }

  enforceRateLimit(skill) {
    const limit = Number(skill.metadata.rateLimitPerMinute || 120);
    const now = Date.now();
    const windowStart = now - 60_000;
    const existing = (this.rateLimits.get(skill.name) || []).filter((ts) => ts > windowStart);
    if (existing.length >= limit) {
      throw new Error(`Rate limit exceeded for skill ${skill.name}`);
    }
    existing.push(now);
    this.rateLimits.set(skill.name, existing);
  }

  async runProviderWithRetry(provider, request, retries = 1) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await provider.generate(request);
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async executeSkill(name, input = {}, options = {}) {
    const skill = await this.loadSkill(name);
    const validation = await this.validateSkill(skill);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    this.enforceRateLimit(skill);

    const startedAt = Date.now();
    const executionId = createSkillExecutionId();
    const cacheKey = stableHash({ name, version: skill.metadata.version, input });
    const cacheable = options.cache !== false && skill.metadata.cache !== false;
    if (cacheable && this.outputCache.has(cacheKey)) {
      const cached = this.outputCache.get(cacheKey);
      await this.writeExecutionLog({ ...cached.log, executionId, cacheHit: true });
      return { ...cached.result, executionId, cacheHit: true };
    }

    const context = this.buildContext(skill, input);
    const provider = options.provider || this.provider;
    const fallback = skill.metadata.fallback || DEFAULT_DOKI_FALLBACK;
    let output = fallback;
    let providerResult = null;
    let status = 'fallback';
    let validationErrors = [];

    try {
      providerResult = await this.runProviderWithRetry(
        provider,
        { skill, context, input },
        Number(skill.metadata.retries || 1)
      );
      output = providerResult.output;
      const schema = skill.validators.find((validator) => validator.schema)?.schema;
      const outputValidation = validateJsonSchema(output, schema);
      validationErrors = outputValidation.errors;
      if (!outputValidation.ok) {
        output = fallback;
      } else {
        status = 'ok';
      }
    } catch (err) {
      validationErrors = [err.message];
      output = fallback;
    }

    const log = {
      executionId,
      skill: name,
      version: skill.metadata.version,
      status,
      validationErrors,
      provider: providerResult?.provider || provider?.name || 'none',
      model: providerResult?.model || null,
      usage: providerResult?.usage || null,
      costUsd: providerResult?.costUsd || 0,
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
    };
    await this.writeExecutionLog(log);

    const result = { output, log, executionId, cacheHit: false };
    if (cacheable && status === 'ok') this.outputCache.set(cacheKey, { result, log });
    return result;
  }

  async writeExecutionLog(entry) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.appendFile(
      path.join(this.dataDir, 'skill-executions.jsonl'),
      `${JSON.stringify(entry)}\n`
    );
  }
}
