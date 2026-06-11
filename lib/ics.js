import { RAW_MATCHES, TEAMS } from './load-data.js';

const STAGE_LABELS = {
  group: 'Fase de grupos', r32: 'Dieciseisavos', r16: 'Octavos',
  qf: 'Cuartos', sf: 'Semifinal', third: 'Tercer puesto', final: 'Final',
};

const VENUE_TZ = {
  'Mexico City': 'America/Mexico_City', Guadalajara: 'America/Mexico_City', Monterrey: 'America/Mexico_City',
  Toronto: 'America/Toronto', Vancouver: 'America/Vancouver', 'Los Angeles': 'America/Los_Angeles',
  'San Francisco Bay Area': 'America/Los_Angeles', Seattle: 'America/Los_Angeles',
  Boston: 'America/New_York', 'New York/New Jersey': 'America/New_York', Philadelphia: 'America/New_York',
  Miami: 'America/New_York', Atlanta: 'America/New_York', Dallas: 'America/Chicago',
  Houston: 'America/Chicago', 'Kansas City': 'America/Chicago',
};

function parseInTimeZone(dateStr, timeStr, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 6; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(guess));
    const got = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    const diffMin = (h - parseInt(got.hour, 10)) * 60 + (mi - parseInt(got.minute, 10));
    if (diffMin === 0) break;
    guess += diffMin * 60 * 1000;
  }
  return new Date(guess);
}

function getZonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

function formatInTimeZone(date, timeZone, options) {
  return new Intl.DateTimeFormat('es-ES', { timeZone, ...options }).format(date);
}

function escapeIcs(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcsDateTime(dateStr, timeStr) {
  return `${dateStr.replace(/-/g, '')}T${timeStr.replace(':', '')}00`;
}

function applyTz(raw, tz) {
  const venueTz = VENUE_TZ[raw.venue] || 'UTC';
  const instant = parseInTimeZone(raw.date, raw.time, venueTz);
  const { year, month, day } = getZonedDateParts(instant, tz);
  const displayTime = formatInTimeZone(instant, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayLabel = formatInTimeZone(instant, tz, { weekday: 'long', day: 'numeric', month: 'long' });
  const homeName = raw.knockout ? raw.home : TEAMS[raw.home]?.name || raw.home;
  const awayName = raw.knockout ? raw.away : TEAMS[raw.away]?.name || raw.away;
  return {
    ...raw,
    instant,
    homeName,
    awayName,
    displayDate: `${year}-${month}-${day}`,
    displayTime,
    dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
    groupLabel: raw.knockout ? STAGE_LABELS[raw.stage] : `Grupo ${raw.group}`,
  };
}

function buildEvent(match, tz) {
  const endInstant = new Date(match.instant.getTime() + 2 * 60 * 60 * 1000);
  const endParts = getZonedDateParts(endInstant, tz);
  const endTime = formatInTimeZone(endInstant, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  const start = toIcsDateTime(match.displayDate, match.displayTime);
  const end = toIcsDateTime(`${endParts.year}-${endParts.month}-${endParts.day}`, endTime);
  const title = match.awayName ? `${match.homeName} vs. ${match.awayName}` : match.homeName;
  return [
    'BEGIN:VEVENT',
    `UID:wc2026-${match.id}@tuhoy.com`,
    `DTSTAMP:${toIcsDateTime('2026-06-01', '12:00')}`,
    `DTSTART;TZID=${tz}:${start}`,
    `DTEND;TZID=${tz}:${end}`,
    `SUMMARY:${escapeIcs(`${title} — ${match.groupLabel}`)}`,
    `LOCATION:${escapeIcs(`${match.venue} (Mundial 2026)`)}`,
    `DESCRIPTION:${escapeIcs(`Copa Mundial FIFA 2026\\n#${match.id}\\n${match.dayLabel}\\n${match.displayTime}\\n${match.venue}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Partido en 1 hora', 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Partido en 15 min', 'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

export async function generateWebcal({ tz = 'America/Chicago', teams = 'all', knockouts = '0' } = {}) {
  const teamSet = teams === 'all' ? null : new Set(teams.split(',').filter(Boolean));
  const includeKo = knockouts === '1' || knockouts === 'true';

  const matches = RAW_MATCHES.map((r) => applyTz(r, tz))
    .filter((m) => {
      if (m.knockout) return includeKo;
      if (!teamSet) return true;
      return teamSet.has(m.home) || teamSet.has(m.away);
    })
    .sort((a, b) => a.instant - b.instant);

  const calName = teamSet ? `Mundial 2026 — ${teamSet.size} países` : 'Mundial 2026 — Todos';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tuhoy//Mundial 2026//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    `X-WR-CALNAME:${escapeIcs(calName)}`,
    `X-WR-TIMEZONE:${tz}`,
    'BEGIN:VTIMEZONE', `TZID:${tz}`, 'END:VTIMEZONE',
    matches.map((m) => buildEvent(m, tz)).join('\r\n'),
    'END:VCALENDAR',
  ].join('\r\n');
}
