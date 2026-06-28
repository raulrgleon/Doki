import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { getSkillEngine } from './skillRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SKILLS_DIR = path.join(PROJECT_ROOT, 'skills');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(503).json({ error: 'ADMIN_TOKEN no configurado' });
  const provided = req.get('x-admin-token') || req.query.token;
  if (provided !== token) return res.status(401).json({ error: 'No autorizado' });
  next();
}

function resolveSkillPath(name, file = 'SKILL.md') {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(name)) throw new Error('Skill inválido');
  const fullPath = path.resolve(SKILLS_DIR, name, file);
  if (!fullPath.startsWith(SKILLS_DIR)) throw new Error('Ruta fuera de skills');
  return fullPath;
}

export function createSkillAdminRouter() {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/skills', async (_req, res) => {
    const skills = await getSkillEngine().listSkills();
    res.json({ skills });
  });

  router.get('/skills/:name', async (req, res) => {
    const skill = await getSkillEngine().loadSkill(req.params.name, { force: true });
    const validation = await getSkillEngine().validateSkill(skill);
    res.json({ skill: skill.summary, markdown: skill.markdown, metadata: skill.metadata, validation });
  });

  router.put('/skills/:name', async (req, res) => {
    const skillFile = resolveSkillPath(req.params.name);
    await fs.writeFile(skillFile, String(req.body.markdown || ''), 'utf8');
    const skill = await getSkillEngine().reloadSkill(req.params.name);
    res.json({ skill: skill.summary });
  });

  router.post('/skills/:name/enable', async (req, res) => {
    const metadataFile = resolveSkillPath(req.params.name, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
    metadata.enabled = Boolean(req.body.enabled);
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    const skill = await getSkillEngine().reloadSkill(req.params.name);
    res.json({ skill: skill.summary });
  });

  router.post('/skills/:name/duplicate', async (req, res) => {
    const target = req.body.target;
    const sourceDir = path.dirname(resolveSkillPath(req.params.name));
    const targetDir = path.dirname(resolveSkillPath(target));
    await fs.cp(sourceDir, targetDir, { recursive: true, errorOnExist: true });
    const skillFile = path.join(targetDir, 'SKILL.md');
    const markdown = await fs.readFile(skillFile, 'utf8');
    await fs.writeFile(skillFile, markdown.replaceAll(req.params.name, target));
    const skill = await getSkillEngine().loadSkill(target, { force: true });
    res.json({ skill: skill.summary });
  });

  router.post('/skills/:name/test', async (req, res) => {
    const result = await getSkillEngine().executeSkill(req.params.name, req.body.input || {}, {
      cache: false,
    });
    res.json(result);
  });

  router.get('/skills/:name/export', async (req, res) => {
    const skill = await getSkillEngine().loadSkill(req.params.name, { force: true });
    res.json({
      skill: skill.summary,
      markdown: skill.markdown,
      templates: skill.templates,
      examples: skill.examples,
      validators: skill.validators,
    });
  });

  router.post('/skills/import', async (req, res) => {
    const { name, markdown, metadata = {} } = req.body;
    const skillDir = path.dirname(resolveSkillPath(name));
    await fs.mkdir(path.join(skillDir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'examples'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'validators'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), String(markdown || ''));
    await fs.writeFile(path.join(skillDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    const skill = await getSkillEngine().loadSkill(name, { force: true });
    res.json({ skill: skill.summary });
  });

  router.get('/logs', async (_req, res) => {
    const file = path.join(DATA_DIR, 'skill-executions.jsonl');
    const raw = await fs.readFile(file, 'utf8').catch(() => '');
    const logs = raw.trim().split('\n').filter(Boolean).slice(-200).map((line) => JSON.parse(line));
    res.json({ logs });
  });

  router.get('/analytics', async (_req, res) => {
    const file = path.join(DATA_DIR, 'skill-executions.jsonl');
    const raw = await fs.readFile(file, 'utf8').catch(() => '');
    const logs = raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const bySkill = {};
    logs.forEach((log) => {
      bySkill[log.skill] ||= { count: 0, failures: 0, costUsd: 0, latencyMs: 0 };
      bySkill[log.skill].count += 1;
      bySkill[log.skill].failures += log.status === 'ok' ? 0 : 1;
      bySkill[log.skill].costUsd += log.costUsd || 0;
      bySkill[log.skill].latencyMs += log.latencyMs || 0;
    });
    res.json({ total: logs.length, bySkill });
  });

  return router;
}
