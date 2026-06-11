import { RAW_MATCHES } from './load-data.js';
import { espnNameToTeamId } from './team-map.js';

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

const scoreCache = {
  data: {},
  fetchedAt: 0,
};

function yyyymmdd(dateStr) {
  return dateStr.replace(/-/g, '');
}

function uniqueDates() {
  const dates = new Set(RAW_MATCHES.map((m) => yyyymmdd(m.date)));
  return [...dates].sort();
}

function relevantDates() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10).replace(/-/g, '');
  return uniqueDates().filter((d) => d <= todayKey);
}

function parseEvent(event) {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const homeId = espnNameToTeamId(home.team.displayName);
  const awayId = espnNameToTeamId(away.team.displayName);
  if (!homeId || !awayId) return null;

  const statusType = comp.status?.type || {};
  let status = 'scheduled';
  if (statusType.state === 'in') status = 'live';
  if (statusType.completed || statusType.state === 'post') status = 'finished';

  return {
    homeId,
    awayId,
    homeScore: parseInt(home.score ?? '0', 10),
    awayScore: parseInt(away.score ?? '0', 10),
    status,
    minute: comp.status?.displayClock || null,
    detail: statusType.shortDetail || statusType.description || null,
    eventDate: event.date,
  };
}

async function fetchDate(date) {
  const res = await fetch(`${ESPN_BASE}?dates=${date}&limit=100&lang=es&region=es`);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = await res.json();
  return (json.events || []).map(parseEvent).filter(Boolean);
}

function findMatchId(parsed, usedIds) {
  const candidates = RAW_MATCHES.filter((raw) => {
    if (raw.knockout) return false;
    if (usedIds.has(raw.id)) return false;
    return (
      (raw.home === parsed.homeId && raw.away === parsed.awayId) ||
      (raw.home === parsed.awayId && raw.away === parsed.homeId)
    );
  });

  if (candidates.length === 1) return candidates[0].id;

  if (candidates.length > 1) {
    const eventTime = new Date(parsed.eventDate).getTime();
    let best = candidates[0];
    let bestDiff = Infinity;
    candidates.forEach((raw) => {
      const matchTime = new Date(`${raw.date}T${raw.time}:00Z`).getTime();
      const diff = Math.abs(matchTime - eventTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = raw;
      }
    });
    return best.id;
  }

  return null;
}

export async function getScoresForMatches({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - scoreCache.fetchedAt < 90_000 && Object.keys(scoreCache.data).length) {
    return scoreCache.data;
  }

  const events = [];
  const dates = relevantDates();

  for (let i = 0; i < dates.length; i += 6) {
    const chunk = dates.slice(i, i + 6);
    const chunkEvents = await Promise.all(
      chunk.map(async (date) => {
        try {
          return await fetchDate(date);
        } catch {
          return [];
        }
      })
    );
    chunkEvents.forEach((dayEvents) => events.push(...dayEvents));
  }

  const scores = {};
  const usedIds = new Set();

  events.forEach((parsed) => {
    const matchId = findMatchId(parsed, usedIds);
    if (!matchId) return;

    const raw = RAW_MATCHES.find((m) => m.id === matchId);
    const swapped = raw && raw.home === parsed.awayId;

    scores[matchId] = {
      homeScore: swapped ? parsed.awayScore : parsed.homeScore,
      awayScore: swapped ? parsed.homeScore : parsed.awayScore,
      status: parsed.status,
      minute: parsed.minute,
      detail: parsed.detail,
    };
    usedIds.add(matchId);
  });

  scoreCache.data = scores;
  scoreCache.fetchedAt = now;
  return scores;
}
