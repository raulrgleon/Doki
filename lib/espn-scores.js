import { RAW_MATCHES } from './load-data.js';
import { espnNameToTeamId } from './team-map.js';

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

const TOURNAMENT_TZ = 'America/New_York';
const CACHE_TTL_MS = 60_000;
const BACKGROUND_REFRESH_MS = 60_000;

const scoreCache = {
  data: {},
  fetchedAt: 0,
  lastError: null,
};

function yyyymmdd(dateStr) {
  return dateStr.replace(/-/g, '');
}

function uniqueDates() {
  const dates = new Set(RAW_MATCHES.map((m) => yyyymmdd(m.date)));
  return [...dates].sort();
}

function dateKeyInTz(date = new Date(), tz = TOURNAMENT_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDateKey(key, deltaDays) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function relevantDates() {
  const all = uniqueDates();
  const todayKey = dateKeyInTz(new Date());
  const today = yyyymmdd(todayKey);
  const tomorrow = yyyymmdd(shiftDateKey(todayKey, 1));
  return all.filter((d) => d <= tomorrow);
}

function mergeScoreMaps(existing, incoming) {
  const rank = { scheduled: 0, live: 1, finished: 2 };
  const out = { ...existing };

  Object.entries(incoming).forEach(([id, sc]) => {
    const prev = out[id];
    if (!prev) {
      out[id] = sc;
      return;
    }
    const prevRank = rank[prev.status] ?? 0;
    const nextRank = rank[sc.status] ?? 0;
    if (nextRank > prevRank || (nextRank === prevRank && sc.status === 'live')) {
      out[id] = sc;
      return;
    }
    if (nextRank === prevRank) out[id] = sc;
  });

  return out;
}

function parseGoals(comp) {
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  const homeId = home?.team?.id;
  const awayId = away?.team?.id;

  return (comp.details || [])
    .filter((d) => d.scoringPlay || d.type?.id === '70' || d.type?.text === 'Gol')
    .map((d) => {
      const athlete = d.athletesInvolved?.[0];
      const teamEspnId = d.team?.id;
      let side = null;
      if (teamEspnId != null && homeId != null && String(teamEspnId) === String(homeId)) side = 'home';
      else if (teamEspnId != null && awayId != null && String(teamEspnId) === String(awayId)) side = 'away';

      return {
        player: athlete?.displayName || athlete?.shortName || null,
        minute: d.clock?.displayValue || null,
        side,
        ownGoal: Boolean(d.ownGoal),
        penalty: Boolean(d.penaltyKick),
      };
    })
    .filter((g) => g.player);
}

function flipGoalSides(goals) {
  return goals.map((g) => ({
    ...g,
    side: g.side === 'home' ? 'away' : g.side === 'away' ? 'home' : g.side,
  }));
}

function parseEvent(event) {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const homeId = espnNameToTeamId(home.team.displayName);
  const awayId = espnNameToTeamId(away.team.displayName);
  if (!homeId || !awayId) {
    console.warn(
      'ESPN equipos sin mapear:',
      home.team.displayName,
      'vs',
      away.team.displayName
    );
    return null;
  }

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
    espnEventId: event.id,
    goals: parseGoals(comp),
  };
}

async function fetchDate(date) {
  const res = await fetch(`${ESPN_BASE}?dates=${date}&limit=100&lang=es&region=es`);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = await res.json();
  return (json.events || []).map(parseEvent).filter(Boolean);
}

function findMatchId(parsed, usedIds) {
  const eventDay = parsed.eventDate?.slice(0, 10);
  const candidates = RAW_MATCHES.filter((raw) => {
    if (usedIds.has(raw.id)) return false;
    if (raw.knockout && (!raw.home || !raw.away)) return false;
    const teamsMatch =
      (raw.home === parsed.homeId && raw.away === parsed.awayId) ||
      (raw.home === parsed.awayId && raw.away === parsed.homeId);
    if (!teamsMatch) return false;
    if (eventDay && raw.date !== eventDay) {
      const eventTime = new Date(parsed.eventDate).getTime();
      const matchTime = new Date(`${raw.date}T${raw.time}:00Z`).getTime();
      if (Math.abs(eventTime - matchTime) > 36 * 3600000) return false;
    }
    return true;
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

function buildScoresFromEvents(events) {
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
      goals: swapped ? flipGoalSides(parsed.goals) : parsed.goals,
      espnEventId: parsed.espnEventId,
    };
    usedIds.add(matchId);
  });

  return scores;
}

async function refreshScoresFromEspn() {
  const events = [];
  const dates = relevantDates();
  let fetchErrors = 0;

  for (let i = 0; i < dates.length; i += 6) {
    const chunk = dates.slice(i, i + 6);
    const chunkEvents = await Promise.all(
      chunk.map(async (date) => {
        try {
          return await fetchDate(date);
        } catch (err) {
          fetchErrors += 1;
          console.error('ESPN fetch', date, err.message);
          return [];
        }
      })
    );
    chunkEvents.forEach((dayEvents) => events.push(...dayEvents));
  }

  if (!events.length && fetchErrors > 0 && Object.keys(scoreCache.data).length) {
    throw new Error('ESPN unavailable');
  }

  const incoming = buildScoresFromEvents(events);
  scoreCache.data = mergeScoreMaps(scoreCache.data, incoming);
  scoreCache.fetchedAt = Date.now();
  scoreCache.lastError = fetchErrors ? `${fetchErrors} fechas sin respuesta` : null;
  return scoreCache.data;
}

export async function getScoresForMatches({ force = false } = {}) {
  const now = Date.now();
  const stale = now - scoreCache.fetchedAt >= CACHE_TTL_MS;
  const empty = !Object.keys(scoreCache.data).length;

  if (!force && !stale && !empty) {
    return scoreCache.data;
  }

  try {
    return await refreshScoresFromEspn();
  } catch (err) {
    scoreCache.lastError = err.message;
    if (Object.keys(scoreCache.data).length) return scoreCache.data;
    throw err;
  }
}

export function getScoresMeta() {
  return {
    updatedAt: scoreCache.fetchedAt ? new Date(scoreCache.fetchedAt).toISOString() : null,
    count: Object.keys(scoreCache.data).length,
    lastError: scoreCache.lastError,
  };
}

export function startScoresBackgroundRefresh() {
  const tick = () => {
    refreshScoresFromEspn().catch((err) => {
      scoreCache.lastError = err.message;
      console.error('background scores', err.message);
    });
  };
  tick();
  setInterval(tick, BACKGROUND_REFRESH_MS);
}
