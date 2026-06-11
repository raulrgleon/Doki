import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getScoresForMatches } from './lib/espn-scores.js';
import { generateDokiMessage } from './lib/doki-ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8765;

app.use(express.json({ limit: '32kb' }));

app.get('/api/scores', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const scores = await getScoresForMatches({ force });
    res.json({ scores, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('scores error', err.message);
    res.status(502).json({ error: 'No se pudieron obtener resultados' });
  }
});

app.post('/api/doki', async (req, res) => {
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

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🐾 Doki corriendo en http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY no definida — Doki usará frases locales');
  }
});
