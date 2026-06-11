import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/doki-cache.json');
const MAX_ENTRIES = 200;

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(data) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 0));
}

function cacheKey(trigger, context) {
  const slim = {
    trigger,
    country: context.activeCountry,
    results: (context.recentResults || []).slice(0, 3).map((r) => `${r.home}-${r.away}:${r.score}`),
    next: context.nextMatch?.teams,
  };
  return crypto.createHash('sha256').update(JSON.stringify(slim)).digest('hex').slice(0, 16);
}

export function getCachedDoki(trigger, context) {
  const key = cacheKey(trigger, context);
  return loadCache()[key] || null;
}

export function setCachedDoki(trigger, context, message) {
  const key = cacheKey(trigger, context);
  const cache = loadCache();
  cache[key] = { ...message, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete cache[k]);
  }
  saveCache(cache);
  return message;
}
