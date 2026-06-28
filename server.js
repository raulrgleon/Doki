import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { getScoresForMatches, getScoresMeta, startScoresBackgroundRefresh } from './lib/espn-scores.js';
import { generateDokiMessage } from './lib/doki-ai.js';
import { generateWebcal } from './lib/ics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8765;
const startedAt = Date.now();

app.use(express.json({ limit: '32kb' }));

const dokiLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Doki necesita un respiro. Intenta en un minuto.' },
});

app.get('/api/health', async (_req, res) => {
  let espn = 'ok';
  try {
    await getScoresForMatches({ force: true });
  } catch {
    espn = 'error';
  }
  res.json({
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    openai: Boolean(process.env.OPENAI_API_KEY),
    espn,
    version: '2.0.0',
  });
});

app.get('/api/scores', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.force === '1';
    const scores = await getScoresForMatches({ force });
    const meta = getScoresMeta();
    res.set('Cache-Control', 'no-store');
    res.json({ scores, updatedAt: meta.updatedAt || new Date().toISOString(), meta });
  } catch (err) {
    console.error('scores error', err.message);
    res.status(502).json({ error: 'No se pudieron obtener resultados' });
  }
});

app.post('/api/doki', dokiLimiter, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OpenAI no configurado' });
  }
  try {
    const message = await generateDokiMessage(req.body || {});
    res.json(message);
  } catch (err) {
    console.error('doki error', err.message);
    res.status(502).json({ error: 'Doki está durmiendo la siesta' });
  }
});

app.get('/api/calendar.ics', async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago';
    const teams = req.query.teams || 'all';
    const knockouts = req.query.knockouts || '0';
    const ics = await generateWebcal({ tz, teams, knockouts });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="mundial-2026.ics"');
    res.send(ics);
  } catch (err) {
    console.error('ics error', err.message);
    res.status(500).send('Error generando calendario');
  }
});

app.use((req, res, next) => {
  if (/\.(js|html)$/.test(req.path) || req.path === '/sw.js') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '7d', immutable: true }));
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'doki.png'));
});
app.use(express.static(__dirname, { maxAge: '1h', index: false }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🐾 Doki v2 en http://localhost:${PORT}`);
  startScoresBackgroundRefresh();
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY no definida');
  }
});
