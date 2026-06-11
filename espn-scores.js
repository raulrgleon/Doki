/* eslint-disable no-unused-vars */
const ESPNScores = (() => {
  const ESPN_BASE =
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

  const ALIASES = {
    mexico: 'mexico',
    'south africa': 'south-africa',
    'south korea': 'korea-republic',
    'korea republic': 'korea-republic',
    czechia: 'czechia',
    'czech republic': 'czechia',
    usa: 'usa',
    'united states': 'usa',
    'u.s.': 'usa',
    'bosnia and herzegovina': 'bosnia-herzegovina',
    'ivory coast': 'ivory-coast',
    "cote d'ivoire": 'ivory-coast',
    'cape verde': 'cape-verde',
    'saudi arabia': 'saudi-arabia',
    'new zealand': 'new-zealand',
    'dr congo': 'congo-dr',
    'democratic republic of congo': 'congo-dr',
    netherlands: 'netherlands',
    holland: 'netherlands',
    turkiye: 'turkiye',
    turkey: 'turkiye',
    curacao: 'curacao',
    uzbekistan: 'uzbekistan',
    panama: 'panama',
    england: 'england',
    scotland: 'scotland',
  };

  let cache = { data: {}, fetchedAt: 0 };

  function normalize(value) {
    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const NAME_TO_ID = {};
  Object.entries(TEAMS).forEach(([id, team]) => {
    NAME_TO_ID[normalize(team.name)] = id;
    NAME_TO_ID[normalize(id.replace(/-/g, ' '))] = id;
  });
  Object.entries(ALIASES).forEach(([alias, id]) => {
    NAME_TO_ID[normalize(alias)] = id;
  });

  function espnNameToTeamId(name) {
    return NAME_TO_ID[normalize(name)] || null;
  }

  function yyyymmdd(dateStr) {
    return dateStr.replace(/-/g, '');
  }

  function relevantDates() {
    const dates = new Set(RAW_MATCHES.map((m) => yyyymmdd(m.date)));
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return [...dates].filter((d) => d <= todayKey).sort();
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

  async function fetchScores({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - cache.fetchedAt < 90_000 && Object.keys(cache.data).length) {
      return cache.data;
    }

    const events = [];
    const dates = relevantDates();

    for (let i = 0; i < dates.length; i += 6) {
      const chunk = dates.slice(i, i + 6);
      const results = await Promise.all(
        chunk.map((date) => fetchDate(date).catch(() => []))
      );
      results.forEach((dayEvents) => events.push(...dayEvents));
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

    cache = { data: scores, fetchedAt: now };
    return scores;
  }

  return { fetchScores };
})();
