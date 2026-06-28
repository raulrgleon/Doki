const TIMEZONES = [
  { id: 'America/Chicago', label: 'Austin · Central (US)', abbr: 'CT' },
  { id: 'America/New_York', label: 'Nueva York · Eastern', abbr: 'ET' },
  { id: 'America/Los_Angeles', label: 'Los Ángeles · Pacific', abbr: 'PT' },
  { id: 'America/Mexico_City', label: 'Ciudad de México', abbr: 'MX' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', abbr: 'ART' },
  { id: 'Europe/Madrid', label: 'Madrid', abbr: 'CET' },
  { id: 'Europe/London', label: 'Londres', abbr: 'GMT' },
  { id: 'UTC', label: 'UTC', abbr: 'UTC' },
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STAGE_LABELS = {
  group: 'Fase de grupos',
  r32: 'Dieciseisavos',
  r16: 'Octavos',
  qf: 'Cuartos',
  sf: 'Semifinal',
  third: 'Tercer puesto',
  final: 'Final',
};
const GROUP_CLASS = {
  A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', E: 'g-e', F: 'g-f',
  G: 'g-g', H: 'g-h', I: 'g-i', J: 'g-j', K: 'g-k', L: 'g-l',
  R32: 'g-ko', R16: 'g-ko', QF: 'g-ko', SF: 'g-ko', THIRD: 'g-ko', FINAL: 'g-ko',
};

const DOKI_QUOTES = [
  { quote: 'Doki esperando los partidos', hint: 'Posición de avión desde el sorteo ✈️🐾' },
  { quote: 'Patitas cruzadas hasta junio', hint: 'No es ansiedad. Es fútbol internacional.' },
  { quote: 'Si suena el silbato, ladra', hint: 'Es su VAR personal. Revisión en curso.' },
  { quote: '¿Ya empezó? Todavía no, Doki', hint: 'Pero el calendario ya está. Prioridades.' },
  { quote: 'Modo espera: activado 🐶', hint: 'Cola en standby. Pelota en standby.' },
  { quote: 'Doki aprueba este calendario', hint: 'Con 4 patas y mucha fe en Argentina.' },
  { quote: 'Ventana del auto = palco VIP', hint: 'Entradas agotadas. Él llegó primero.' },
  { quote: 'Cuenta regresiva canina', hint: 'Cada día sin partido es un día de más ansiedad.' },
  { quote: '¿Eliminatorias? Doki dice que sí', hint: 'Aunque no sepa quién juega todavía.' },
  { quote: 'Exportar al iPhone también, porfa', hint: 'Que no se le pase ningún pitido a su humano.' },
];

const DOKI_CONTEXT = {
  all: { quote: 'Doki esperando los partidos', hint: '104 partidos. Cero paciencia.' },
  argentina: { quote: 'Doki cree en la Scaloneta', hint: 'La cola ya hace la ola albiceleste 🇦🇷' },
  spain: { quote: 'Doki aprueba la Roja', hint: 'Tiki-taka canino en modo espera 🇪🇸' },
  uruguay: { quote: 'Doki respeta a La Celeste', hint: 'Garra, mate y ventana del auto 🇺🇾' },
  empty: { quote: 'Doki no ve partidos aquí', hint: 'Prueba otro mes o país. Sigue esperando.' },
  exported: { quote: 'Doki lo mandó al iPhone', hint: 'Calendario descargado. Ahora a ladrarle al silbato.' },
  next: { quote: 'Doki ya vio el próximo partido', hint: 'Cuenta regresiva activada arriba ⏱️' },
};

let dokiQuoteIndex = 0;
let dokiManualOverride = false;
let countdownTimer = null;

function getVisitorTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function initDisplayTimezone() {
  const manual = localStorage.getItem('wc2026-tz-manual') === '1';
  const saved = localStorage.getItem('wc2026-tz');
  if (manual && saved) {
    displayTz = saved;
    return;
  }
  displayTz = getVisitorTimezone();
}

let displayTz = getVisitorTimezone();
let currentYear = 2026;
let currentMonth = 5;
let activeCountry = 'all';
let selectedDay = null;
let selectedMatchId = null;
const TOURNAMENT_MONTHS = [
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
];
let exportSelections = new Set();
let exportMode = 'all';
let includeKnockouts = false;
let MATCHES = [];
let SCORES_CACHE = {};
let dokiAiEnabled = true;
let dokiFetching = false;
let scoresPollTimer = null;
let scoresUpdatedAt = null;
let scoresFetchFailures = 0;
let dokiAutoTimer = null;
let dokiComicTimer = null;
let lastFinishedCount = 0;

const DOKI_EMOJIS = ['⚽', '🐾', '🦴', '🎾', '👀', '😤', '🏆', '🐶'];

function parseInTimeZone(dateStr, timeStr, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);

  for (let i = 0; i < 6; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(guess));

    const got = Object.fromEntries(
      parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    );
    const diffMin = (h - parseInt(got.hour, 10)) * 60 + (mi - parseInt(got.minute, 10));
    if (diffMin === 0) break;
    guess += diffMin * 60 * 1000;
  }

  return new Date(guess);
}

function formatInTimeZone(date, timeZone, options) {
  return new Intl.DateTimeFormat('es-ES', { timeZone, ...options }).format(date);
}

function getZonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
}

function getTimezoneLabel(tzId) {
  const preset = TIMEZONES.find((t) => t.id === tzId);
  if (preset) return preset.label;
  return tzId.split('/').pop()?.replace(/_/g, ' ') || tzId;
}

function getTimezoneAbbr(tzId) {
  const preset = TIMEZONES.find((t) => t.id === tzId);
  if (preset) return preset.abbr;
  try {
    const part = new Intl.DateTimeFormat('es', {
      timeZone: tzId,
      timeZoneName: 'short',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value || getTimezoneLabel(tzId);
  } catch {
    return getTimezoneLabel(tzId);
  }
}

function teamName(id) {
  return TEAMS[id]?.name || id;
}

function teamFlag(id) {
  return TEAMS[id]?.flag || '⚽';
}

function buildBaseMatch(raw) {
  const venueTz = VENUE_TZ[raw.venue];
  const instant = parseInTimeZone(raw.date, raw.time, venueTz);
  const hasHomeTeam = Boolean(TEAMS[raw.home]);
  const hasAwayTeam = Boolean(TEAMS[raw.away]);
  const homeName = raw.knockout && !hasHomeTeam ? raw.home : teamName(raw.home);
  const awayName = raw.knockout && !hasAwayTeam ? raw.away : teamName(raw.away);
  const homeFlag = hasHomeTeam ? teamFlag(raw.home) : '🏆';
  const awayFlag = hasAwayTeam ? teamFlag(raw.away) : '';
  const teamIds = [raw.home, raw.away].filter((id) => TEAMS[id]);

  return {
    ...raw,
    instant,
    homeName,
    awayName,
    homeFlag,
    awayFlag,
    teamIds,
    groupLabel: raw.knockout ? STAGE_LABELS[raw.stage] : `Grupo ${raw.group}`,
    cssGroup: GROUP_CLASS[raw.group] || 'g-ko',
  };
}

function applyTimezone(base, tz) {
  const { year, month, day } = getZonedDateParts(base.instant, tz);
  const displayTime = formatInTimeZone(base.instant, tz, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dayLabel = formatInTimeZone(base.instant, tz, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return {
    ...base,
    displayDate: `${year}-${month}-${day}`,
    displayDay: parseInt(day, 10),
    displayMonth: parseInt(month, 10) - 1,
    displayYear: parseInt(year, 10),
    displayTime,
    dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
  };
}

const BASE_MATCHES = RAW_MATCHES.map(buildBaseMatch);

function loadPrefs() {
  const country = localStorage.getItem('wc2026-country');
  if (country && (country === 'all' || country === 'favorites' || TEAMS[country])) activeCountry = country;

  const mode = localStorage.getItem('wc2026-export-mode');
  if (mode === 'all' || mode === 'custom') exportMode = mode;

  includeKnockouts = localStorage.getItem('wc2026-knockouts') === 'true';

  try {
    const teams = JSON.parse(localStorage.getItem('wc2026-export-teams') || '[]');
    if (Array.isArray(teams) && teams.length) exportSelections = new Set(teams);
  } catch {
    exportSelections = new Set();
  }
}

function savePrefs() {
  localStorage.setItem('wc2026-country', activeCountry);
  localStorage.setItem('wc2026-export-mode', exportMode);
  localStorage.setItem('wc2026-knockouts', String(includeKnockouts));
  localStorage.setItem('wc2026-export-teams', JSON.stringify([...exportSelections]));
}

function getTodayInDisplayTz() {
  const now = new Date();
  const { year, month, day } = getZonedDateParts(now, displayTz);
  return {
    year: parseInt(year, 10),
    month: parseInt(month, 10) - 1,
    day: parseInt(day, 10),
  };
}

function isToday(day, month, year) {
  const t = getTodayInDisplayTz();
  return t.day === day && t.month === month && t.year === year;
}

function isDayInPast(day, month, year) {
  const t = getTodayInDisplayTz();
  if (year !== t.year) return year < t.year;
  if (month !== t.month) return month < t.month;
  return day < t.day;
}

function tournamentMonthIndex(year, month) {
  return TOURNAMENT_MONTHS.findIndex((m) => m.year === year && m.month === month);
}

function syncCalendarMonthToToday() {
  const t = getTodayInDisplayTz();
  if (tournamentMonthIndex(t.year, t.month) >= 0) {
    currentYear = t.year;
    currentMonth = t.month;
  }
}

function updateMonthNavButtons() {
  const prev = document.getElementById('prev-month');
  const next = document.getElementById('next-month');
  const idx = tournamentMonthIndex(currentYear, currentMonth);
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx < 0 || idx >= TOURNAMENT_MONTHS.length - 1;
}

function getNextMatch() {
  const now = Date.now();
  const upcoming = getFilteredMatches()
    .filter((m) => m.instant.getTime() > now)
    .sort((a, b) => a.instant - b.instant);

  if (upcoming.length) return { type: 'upcoming', match: upcoming[0] };

  const allFiltered = getFilteredMatches().sort((a, b) => a.instant - b.instant);
  if (allFiltered.length && allFiltered[allFiltered.length - 1].instant.getTime() <= now) {
    return { type: 'finished', match: allFiltered[allFiltered.length - 1] };
  }

  if (allFiltered.length) return { type: 'upcoming', match: allFiltered[0] };

  return { type: 'none' };
}

function formatCountdown(ms) {
  if (ms <= 0) return '¡Empieza pronto!';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;

  if (days > 0) return `En ${days}d ${hours}h`;
  if (hours > 0) return `En ${hours}h ${mins}m`;
  return `En ${mins} min`;
}

function renderNextMatchBanner() {
  const banner = document.getElementById('next-match-banner');
  const label = document.getElementById('next-match-label');
  const title = document.getElementById('next-match-title');
  const meta = document.getElementById('next-match-meta');
  const countdown = document.getElementById('next-match-countdown');
  const next = getNextMatch();

  if (next.type === 'none') {
    banner.hidden = true;
    banner.classList.remove('next-match--live');
    return;
  }

  banner.hidden = false;
  const m = next.match;
  const vs = m.awayName ? `${m.homeName} vs. ${m.awayName}` : m.homeName;

  if (next.type === 'finished') {
    label.textContent = 'Último partido';
    title.textContent = `${m.homeFlag} ${vs}`;
    const score = getScoreDisplay(m);
    meta.textContent = score
      ? `${score.line} · ${m.dayLabel} · ${m.venue}`
      : `${m.dayLabel} · ${m.displayTime} · ${m.venue}`;
    countdown.textContent = score ? 'Resultado final 🏁' : 'El Mundial en tu filtro ya terminó 🏁';
    return;
  }

  const liveInFilter = getFilteredMatches().find((x) => x.score?.status === 'live');
  if (liveInFilter) {
    const lm = liveInFilter;
    const ls = getScoreDisplay(lm);
    label.textContent = 'En vivo ahora';
    title.textContent = `${lm.homeFlag}${lm.awayFlag} ${lm.homeName}${lm.awayName ? ` vs. ${lm.awayName}` : ''}`;
    meta.textContent = `${ls.line} · ${ls.minute || 'En juego'} · ${lm.venue}`;
    countdown.textContent = '🔴 EN VIVO';
    banner.classList.add('next-match--live');
    return;
  }

  banner.classList.remove('next-match--live');

  label.textContent = 'Próximo partido';
  title.textContent = `${m.homeFlag}${m.awayFlag ? m.awayFlag : ''} ${vs}`;
  meta.textContent = `${m.dayLabel} · ${m.displayTime} (${getTimezoneAbbr(displayTz)}) · ${m.venue}`;
  countdown.textContent = formatCountdown(m.instant.getTime() - Date.now());
}

function setDokiMessage({ quote, hint }, animate = true) {
  const quoteEl = document.getElementById('doki-quote');
  const hintEl = document.getElementById('doki-hint');
  const btn = document.getElementById('doki-tap');
  if (!quoteEl || !hintEl) return;

  if (animate && btn) {
    quoteEl.classList.add('doki-hero__quote--pop');
    btn.classList.add('doki-hero__btn--wiggle');
    window.setTimeout(() => {
      quoteEl.classList.remove('doki-hero__quote--pop');
      btn.classList.remove('doki-hero__btn--wiggle');
    }, 450);
  }

  quoteEl.textContent = quote;
  hintEl.textContent = hint;
}

function setSidebarDokiMessage({ quote, hint }, { animate = true, loading = false } = {}) {
  const box = document.getElementById('sidebar-doki');
  const quoteEl = document.getElementById('sidebar-doki-quote');
  const hintEl = document.getElementById('sidebar-doki-hint');
  if (!box || !quoteEl || !hintEl) return;

  box.hidden = false;
  box.classList.toggle('sidebar-doki--loading', loading);
  if (animate) {
    box.classList.add('sidebar-doki--pop');
    window.setTimeout(() => box.classList.remove('sidebar-doki--pop'), 400);
  }
  quoteEl.textContent = quote;
  hintEl.textContent = hint;
}

function hideSidebarDoki() {
  const box = document.getElementById('sidebar-doki');
  if (box) box.hidden = true;
}

function updateDokiContext(forceKey) {
  if (dokiManualOverride && !forceKey) return;

  let key = forceKey;
  if (!key) {
    if (activeCountry !== 'all' && DOKI_CONTEXT[activeCountry]) key = activeCountry;
    else key = 'all';
  }
  const ctx = DOKI_CONTEXT[key] || DOKI_CONTEXT.all;
  setDokiMessage(ctx, Boolean(forceKey));
}

function buildDayDokiMessage(day) {
  const matches = getAllMatchesForDay(day);
  const dateLabel = `${MONTH_NAMES[currentMonth]} ${day}`;

  if (!matches.length) {
    return {
      quote: `Doki no encuentra partidos el ${dateLabel}`,
      hint: 'Prueba otro día del calendario.',
    };
  }

  const withScore = matches.filter((m) => getScoreDisplay(m));
  const past = isDayInPast(day, currentMonth, currentYear);

  if (withScore.length) {
    const summary = withScore
      .slice(0, 2)
      .map((m) => {
        const s = getScoreDisplay(m);
        return `${m.homeFlag} ${m.homeName} ${s.line} ${m.awayFlag} ${m.awayName || ''}`.trim();
      })
      .join(' · ');
    const extra = matches.length > withScore.length ? ` · y ${matches.length - withScore.length} más` : '';
    const quotes = past
      ? ['Doki no necesita VAR para este día', 'Olfato periodístico: día cargado de goles', 'La cola confirma: hubo fútbol de verdad']
      : ['Doki ya vio los marcadores', 'Resultados en la ventana del auto 📻'];
    return {
      quote: quotes[day % quotes.length] + ' 🐾',
      hint: (summary + extra).slice(0, 120),
    };
  }

  const upcoming = matches
    .slice(0, 2)
    .map((m) => `${m.displayTime} ${m.homeFlag}${m.awayFlag} ${m.homeName} vs ${m.awayName || '?'}`)
    .join(' · ');
  const futureQuotes = [
    `Patitas cruzadas: ${matches.length} partido${matches.length === 1 ? '' : 's'} el ${dateLabel}`,
    `Doki ya reservó lugar en el sofá — ${matches.length} cruces`,
    `Silbato en camino: ${matches.length} partido${matches.length === 1 ? '' : 's'} ese día`,
  ];
  return {
    quote: futureQuotes[day % futureQuotes.length],
    hint: upcoming.slice(0, 120),
  };
}

function formatMatchGoalsSummary(m) {
  const goals = m.score?.goals || [];
  if (!goals.length) return '';
  return goals.map((g) => {
    const team = g.side === 'home' ? m.homeFlag : g.side === 'away' ? m.awayFlag : '⚽';
    return `${team} ${formatGoalLine(g)}`;
  }).join(' · ');
}

function formatGoalLine(g) {
  let line = g.player;
  if (g.minute) line += ` ${g.minute}`;
  if (g.penalty) line += ' (pen.)';
  if (g.ownGoal) line += ' (e.c.)';
  return line;
}

function getMatchDokiContext(m) {
  if (!m) return null;
  return {
    id: m.id,
    home: m.homeName,
    away: m.awayName,
    homeFlag: m.homeFlag,
    awayFlag: m.awayFlag,
    venue: m.venue,
    group: m.groupLabel,
    when: `${m.dayLabel} ${m.displayTime}`,
    status: m.score?.status || 'scheduled',
    score:
      m.score && m.score.status !== 'scheduled'
        ? `${m.score.homeScore}-${m.score.awayScore}`
        : null,
    goals: (m.score?.goals || []).map((g) => ({
      player: g.player,
      minute: g.minute,
      team: g.side === 'home' ? m.homeName : g.side === 'away' ? m.awayName : null,
      ownGoal: g.ownGoal,
      penalty: g.penalty,
    })),
  };
}

function buildMatchDokiMessage(m) {
  const vs = m.awayName ? `${m.homeFlag} ${m.homeName} vs ${m.awayFlag} ${m.awayName}` : `${m.homeFlag} ${m.homeName}`;
  const score = getScoreDisplay(m);
  const goals = m.score?.goals || [];

  if (score?.status === 'finished' && goals.length) {
    const homeGoals = goals.filter((g) => g.side === 'home');
    const awayGoals = goals.filter((g) => g.side === 'away');
    const parts = [];
    if (homeGoals.length) parts.push(`${m.homeName}: ${homeGoals.map(formatGoalLine).join(', ')}`);
    if (awayGoals.length) parts.push(`${m.awayName}: ${awayGoals.map(formatGoalLine).join(', ')}`);
    const star = goals[0];
    const opener = star?.minute
      ? `${star.player} abrió en el ${star.minute}`
      : `${star?.player || 'Gol'} definió el partido`;
    return {
      quote: `Final ${score.line} — ${opener} 🐾`,
      hint: parts.join(' · ').slice(0, 140),
    };
  }

  if (score?.status === 'finished') {
    return {
      quote: `Cerró ${score.line}. Doki confirma el resultado`,
      hint: `${vs} · Marcador oficial — detalle de goles en actualización`,
    };
  }

  if (score?.status === 'live') {
    const lastGoal = goals[goals.length - 1];
    const liveHint = lastGoal
      ? `Último gol: ${formatGoalLine(lastGoal)}`
      : `${vs} · ${m.venue}`;
    return {
      quote: `¡EN VIVO ${score.line}! Doki no parpadea 🔴`,
      hint: liveHint.slice(0, 140),
    };
  }

  return {
    quote: `Doki ya reservó sitio: ${m.homeName} vs ${m.awayName || '?'}`,
    hint: `${m.displayTime} · ${m.groupLabel} · ${m.venue}`,
  };
}

function notifyDokiMatchSelected(id) {
  selectedMatchId = id;
  const m = MATCHES.find((x) => x.id === id);
  if (!m) return;
  setSidebarDokiMessage(buildMatchDokiMessage(m), { animate: true });
  requestDokiAI('match_tap', { force: true, matchId: id });
  window.WCFeatures?.openMatchCenter?.(id);
}

function notifyDokiDaySelected() {
  selectedMatchId = null;
  if (selectedDay === null) {
    hideSidebarDoki();
    return;
  }
  setSidebarDokiMessage(buildDayDokiMessage(selectedDay), { animate: true });
  requestDokiAI('day_select', { force: true });
}

function matchCardHtml(m) {
  return renderMatchCard(m);
}

function groupMatchesByDate(matches) {
  const groups = [];
  let lastDate = null;

  matches.forEach((m) => {
    if (m.displayDate !== lastDate) {
      groups.push({ type: 'header', label: m.dayLabel });
      lastDate = m.displayDate;
    }
    groups.push({ type: 'match', match: m });
  });

  return groups;
}

function goToToday() {
  const t = getTodayInDisplayTz();
  currentYear = t.year;
  currentMonth = t.month;
  selectedDay = t.day;
  renderCalendar();
  renderMatchList();
  scrollToMatches();
  notifyDokiDaySelected();
}

function rebuildMatches() {
  MATCHES = BASE_MATCHES.map((m) => ({
    ...applyTimezone(m, displayTz),
    score: SCORES_CACHE[m.id] || null,
  }));
}

function applyScores(scores, { silent = false } = {}) {
  const prevFinished = lastFinishedCount;
  const oldCache = { ...SCORES_CACHE };
  SCORES_CACHE = { ...SCORES_CACHE, ...scores };
  rebuildMatches();

  const finished = Object.values(SCORES_CACHE).filter((s) => s?.status === 'finished').length;
  const hadNewResults = finished > prevFinished;
  lastFinishedCount = finished;

  if (window.WCFeatures) WCFeatures.onScoresUpdated(oldCache, SCORES_CACHE);

  renderCalendar();
  renderMatchList();
  renderNextMatchBanner();
  if (window.WCFeatures) WCFeatures.refreshAll();
  scheduleScoresPoll();

  if (!silent && hadNewResults) {
    requestDokiAI('score_update');
    if (selectedMatchId !== null) {
      const m = MATCHES.find((x) => x.id === selectedMatchId);
      if (m) {
        setSidebarDokiMessage(buildMatchDokiMessage(m), { animate: false });
        requestDokiAI('match_tap', { force: true, matchId: selectedMatchId });
      }
    } else if (selectedDay !== null) {
      setSidebarDokiMessage(buildDayDokiMessage(selectedDay), { animate: false });
      requestDokiAI('day_select', { force: true });
    }
  }
}

function getScoreDisplay(m) {
  if (!m.score) return null;
  const { homeScore, awayScore, status, minute, detail } = m.score;
  if (status === 'scheduled') return null;
  return {
    line: `${homeScore} – ${awayScore}`,
    status,
    minute,
    detail,
  };
}

function matchScoreHtml(m) {
  const score = getScoreDisplay(m);
  if (!score) return '';
  const live = score.status === 'live';
  const label = live ? `EN VIVO${score.minute ? ` · ${score.minute}` : ''}` : 'Final';
  return `
    <div class="match-card__score${live ? ' match-card__score--live' : ''}">
      <span class="match-card__score-label">${label}</span>
      <span class="match-card__score-line">${score.line}</span>
    </div>`;
}

function matchCardClasses(m) {
  const score = getScoreDisplay(m);
  let cls = `match-card ${m.cssGroup}`;
  if (score?.status === 'live') cls += ' match-card--live';
  if (score?.status === 'finished') cls += ' match-card--finished';
  if (
    selectedDay !== null &&
    activeCountry !== 'all' &&
    !matchInvolvesCountry(m, activeCountry)
  ) {
    cls += ' match-card--dim';
  }
  return cls;
}

function renderMatchCard(m) {
  return `
    <li class="${matchCardClasses(m)}">
      <div class="match-card__top">
        <span class="match-card__time">${m.displayTime}</span>
        <span class="match-card__badge">${m.groupLabel}</span>
      </div>
      ${matchScoreHtml(m)}
      <p class="match-card__teams">${m.homeFlag} ${m.homeName}${m.awayName ? `<span class="match-card__vs">vs</span>${m.awayFlag} ${m.awayName}` : ''}</p>
      <p class="match-card__meta">${m.venue}</p>
    </li>`;
}

function calendarChipContent(m) {
  const score = getScoreDisplay(m);
  const flags = m.teamIds?.length ? `${m.homeFlag}${m.awayFlag}` : `#${m.id}`;
  if (score) {
    const badge = score.status === 'live' ? '🔴' : '✓';
    return `<span class="calendar__event-flags">${flags}</span><span class="calendar__event-main">${score.line}</span><span class="calendar__event-status">${badge}</span>`;
  }
  return `<span class="calendar__event-flags">${flags}</span><span class="calendar__event-main">${m.displayTime}</span>`;
}

async function fetchScores({ silent = false, force = false } = {}) {
  try {
    const url = force ? '/api/scores?refresh=1' : '/api/scores';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    scoresUpdatedAt = json.updatedAt || new Date().toISOString();
    scoresFetchFailures = 0;
    applyScores(json.scores, { silent });
    updateScoresStatusUI();
    return true;
  } catch {
    scoresFetchFailures += 1;
    updateScoresStatusUI();
    if (!silent && scoresFetchFailures >= 3) {
      console.warn('fetchScores: demasiados fallos consecutivos');
    }
    return false;
  }
}

function hasLiveMatch() {
  return MATCHES.some((m) => m.score?.status === 'live');
}

function getScoresPollIntervalMs() {
  if (hasLiveMatch()) return 15_000;
  return 60_000;
}

function scheduleScoresPoll() {
  if (scoresPollTimer) clearInterval(scoresPollTimer);
  scoresPollTimer = window.setInterval(() => {
    fetchScores({ silent: true, force: true });
  }, getScoresPollIntervalMs());
}

function updateScoresStatusUI() {
  const el = document.getElementById('scores-status');
  if (!el) return;
  if (!scoresUpdatedAt) {
    el.textContent = '';
    return;
  }
  const when = new Date(scoresUpdatedAt);
  const label = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const finished = Object.values(SCORES_CACHE).filter((s) => s?.status === 'finished').length;
  if (scoresFetchFailures >= 2) {
    el.textContent = `Resultados desactualizados · reintentando…`;
    el.classList.add('scores-status--warn');
    return;
  }
  el.classList.remove('scores-status--warn');
  el.textContent = `${finished} resultados · actualizado ${label}`;
}

function setupScoresRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchScores({ silent: true, force: true }).then(() => scheduleScoresPoll());
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) fetchScores({ silent: true, force: true });
  });
  window.addEventListener('online', () => fetchScores({ silent: false, force: true }));
}

function getDokiContextPayload() {
  const recentResults = getFilteredMatches()
    .filter((m) => m.score?.status === 'finished' || m.score?.status === 'live')
    .sort((a, b) => b.instant - a.instant)
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      home: m.homeName,
      away: m.awayName,
      score: m.score ? `${m.score.homeScore}-${m.score.awayScore}` : null,
      status: m.score?.status,
      group: m.groupLabel,
    }));

  const next = getNextMatch();
  let nextMatch = null;
  if (next.type !== 'none') {
    const m = next.match;
    nextMatch = {
      type: next.type,
      teams: m.awayName ? `${m.homeName} vs ${m.awayName}` : m.homeName,
      when: `${m.dayLabel} ${m.displayTime}`,
      venue: m.venue,
    };
  }

  let selectedDayInfo = null;
  if (selectedDay !== null) {
    const matches = getAllMatchesForDay(selectedDay);
    selectedDayInfo = {
      date: `${MONTH_NAMES[currentMonth]} ${selectedDay}, ${currentYear}`,
      isPast: isDayInPast(selectedDay, currentMonth, currentYear),
      matchCount: matches.length,
      matches: matches.map((m) => ({
        home: m.homeName,
        away: m.awayName,
        time: m.displayTime,
        venue: m.venue,
        group: m.groupLabel,
        score:
          m.score && m.score.status !== 'scheduled'
            ? `${m.score.homeScore}-${m.score.awayScore}`
            : null,
        status: m.score?.status || 'scheduled',
      })),
    };
  }

  return {
    activeCountry,
    countryName: activeCountry === 'all' ? 'Todos' : TEAMS[activeCountry]?.name,
    timezone: getTimezoneLabel(displayTz),
    recentResults,
    nextMatch,
    selectedDay: selectedDayInfo,
    finishedCount: Object.values(SCORES_CACHE).filter((s) => s?.status === 'finished').length,
  };
}

function triggerDokiAction(action) {
  const btn = document.getElementById('doki-tap');
  const hero = document.querySelector('.doki-hero');
  if (!btn) return;

  btn.classList.remove(
    'doki-hero__btn--wiggle',
    'doki-hero__btn--spin',
    'doki-hero__btn--jump',
    'doki-hero__btn--bark',
    'doki-hero__btn--zoom'
  );

  if (action && action !== 'null') {
    btn.classList.add(`doki-hero__btn--${action}`);
    window.setTimeout(() => btn.classList.remove(`doki-hero__btn--${action}`), 700);
  }

  if (action === 'bark' || action === 'jump') {
    hero?.classList.add('doki-hero--shake');
    window.setTimeout(() => hero?.classList.remove('doki-hero--shake'), 500);
  }

  if (Math.random() > 0.35) spawnDokiEmoji();
}

function spawnDokiEmoji() {
  const hero = document.querySelector('.doki-hero');
  const field = document.getElementById('doki-comics');
  if (!field) return;

  const emoji = DOKI_EMOJIS[Math.floor(Math.random() * DOKI_EMOJIS.length)];
  const bubble = document.createElement('span');
  bubble.className = 'doki-comic';
  bubble.textContent = emoji;
  bubble.style.left = `${10 + Math.random() * 70}%`;
  bubble.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
  field.appendChild(bubble);
  window.setTimeout(() => bubble.remove(), 3200);

  if (hero && Math.random() > 0.6) {
    hero.classList.add('doki-hero--bounce');
    window.setTimeout(() => hero.classList.remove('doki-hero--bounce'), 600);
  }
}

async function requestDokiAI(trigger = 'auto', { force = false, matchId = null } = {}) {
  if (!dokiAiEnabled || dokiFetching) return false;
  if (dokiManualOverride && !force && trigger !== 'tap') return false;

  dokiFetching = true;
  const badge = document.getElementById('doki-ai-badge');
  badge?.classList.add('doki-ai-badge--loading');

  const sidebarTrigger = trigger === 'day_select' || trigger === 'match_tap';
  if (sidebarTrigger) {
    const loadingQuote =
      trigger === 'match_tap' ? 'Doki analiza el partido…' : 'Doki husmea el día…';
    const loadingHint =
      trigger === 'match_tap'
        ? 'Revisando goles, minutos y datos reales 🐾'
        : 'Olfateando marcadores y horarios 🐾';
    if (trigger === 'day_select' && selectedDay !== null) {
      setSidebarDokiMessage({ quote: loadingQuote, hint: loadingHint }, { animate: false, loading: true });
    }
    if (trigger === 'match_tap' && matchId) {
      setSidebarDokiMessage({ quote: loadingQuote, hint: loadingHint }, { animate: false, loading: true });
    }
  }

  try {
    const context = getDokiContextPayload();
    if (matchId) {
      const m = MATCHES.find((x) => x.id === matchId);
      if (m) context.tappedMatch = getMatchDokiContext(m);
    }

    const res = await fetch('/api/doki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger, context }),
    });

    if (!res.ok) throw new Error('api');

    const data = await res.json();
    if (trigger === 'tap') dokiManualOverride = true;
    if (trigger === 'day_select' && selectedDay !== null) {
      setSidebarDokiMessage(data, { animate: true });
    } else if (trigger === 'match_tap' && matchId) {
      setSidebarDokiMessage(data, { animate: true });
    } else {
      setDokiMessage(data, true);
      triggerDokiAction(data.action);
    }
    return true;
  } catch {
    if (trigger === 'tap') nextDokiQuoteLocal();
    else if (trigger === 'day_select' && selectedDay !== null) {
      setSidebarDokiMessage(buildDayDokiMessage(selectedDay), { animate: false });
    } else if (trigger === 'match_tap' && matchId) {
      const m = MATCHES.find((x) => x.id === matchId);
      if (m) setSidebarDokiMessage(buildMatchDokiMessage(m), { animate: false });
    }
    return false;
  } finally {
    dokiFetching = false;
    badge?.classList.remove('doki-ai-badge--loading');
  }
}

function nextDokiQuoteLocal() {
  dokiQuoteIndex = (dokiQuoteIndex + 1) % DOKI_QUOTES.length;
  setDokiMessage(DOKI_QUOTES[dokiQuoteIndex], true);
  triggerDokiAction('wiggle');
}

function setupDokiComics() {
  if (dokiComicTimer) clearInterval(dokiComicTimer);
  dokiComicTimer = window.setInterval(() => {
    if (Math.random() > 0.55) spawnDokiEmoji();
    if (Math.random() > 0.75) {
      document.getElementById('doki-tap')?.classList.add('doki-hero__btn--wiggle');
      window.setTimeout(
        () => document.getElementById('doki-tap')?.classList.remove('doki-hero__btn--wiggle'),
        450
      );
    }
  }, 18_000);
}

function startDokiAuto() {
  if (dokiAutoTimer) clearInterval(dokiAutoTimer);
  dokiAutoTimer = window.setInterval(() => {
    if (!dokiManualOverride) requestDokiAI('auto');
  }, 240_000);
}

function matchInvolvesCountry(match, countryId) {
  if (countryId === 'all') return true;
  if (countryId === 'favorites') {
    if (window.WCFeatures) return WCFeatures.matchPassesFavorites(match);
    if (match.knockout) return includeKnockouts;
    return match.teamIds.some((id) => ['argentina', 'spain', 'uruguay'].includes(id));
  }
  if (match.knockout) return includeKnockouts && match.teamIds.includes(countryId);
  return match.teamIds.includes(countryId);
}

function getFilteredMatches() {
  return MATCHES.filter((m) => {
    if (!matchInvolvesCountry(m, activeCountry)) return false;
    if (window.WCFeatures && !WCFeatures.matchPassesVenue(m)) return false;
    return true;
  });
}

function calendarDateKey(day, month = currentMonth, year = currentYear) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function matchOnCalendarDay(m, day, month = currentMonth, year = currentYear) {
  return m.date === calendarDateKey(day, month, year);
}

function isInCalendarMonth(m, month = currentMonth, year = currentYear) {
  const [y, mo] = m.date.split('-').map(Number);
  return y === year && mo - 1 === month;
}

function getVisibleMatches() {
  let list = getFilteredMatches();

  if (selectedDay !== null) {
    list = list.filter((m) => matchOnCalendarDay(m, selectedDay));
  } else {
    list = list.filter((m) => isInCalendarMonth(m));
  }

  return list.sort((a, b) => a.instant - b.instant);
}

function getAllMatchesForDay(day) {
  return MATCHES.filter((m) => matchOnCalendarDay(m, day)).sort((a, b) => a.instant - b.instant);
}

function getMatchesForDay(day) {
  return getFilteredMatches()
    .filter((m) => matchOnCalendarDay(m, day))
    .sort((a, b) => a.instant - b.instant);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekdayOffset(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function updateTimezoneUI() {
  const abbr = getTimezoneAbbr(displayTz);
  const label = getTimezoneLabel(displayTz);
  document.getElementById('calendar-hint').textContent = `Horarios en ${label}`;
  document.getElementById('footer-timezone').textContent =
    `Horarios en ${label} (${abbr}) · tu zona horaria · Junio–Julio 2026`;
  document.title = `Mundial 2026 · ${abbr}`;
}

function populateTimezoneSelect() {
  const select = document.getElementById('timezone-select');
  if (!select) return;
  select.innerHTML = '';
  const userTz = getVisitorTimezone();
  const seen = new Set();

  const addOption = (id, label) => {
    if (seen.has(id)) return;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    select.appendChild(opt);
    seen.add(id);
  };

  if (userTz) {
    const preset = TIMEZONES.find((t) => t.id === userTz);
    addOption(
      userTz,
      preset ? `${preset.label} · tu zona` : `Tu zona · ${getTimezoneLabel(userTz)}`
    );
  }

  TIMEZONES.forEach((tz) => addOption(tz.id, tz.label));

  if (displayTz && !seen.has(displayTz)) {
    addOption(displayTz, getTimezoneLabel(displayTz));
  }

  if (displayTz && seen.has(displayTz)) {
    select.value = displayTz;
  } else if (userTz) {
    displayTz = userTz;
    select.value = userTz;
  }
}

function populateCountryFilter() {
  const select = document.getElementById('country-filter');
  const favOpt = document.createElement('option');
  favOpt.value = 'favorites';
  favOpt.textContent = '⭐ Mis favoritos';
  select.appendChild(favOpt);
  const groups = {};

  Object.entries(TEAMS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'))
    .forEach(([id, team]) => {
      if (!groups[team.group]) groups[team.group] = [];
      groups[team.group].push({ id, ...team });
    });

  Object.keys(groups)
    .sort()
    .forEach((group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = `Grupo ${group}`;
      groups[group].forEach((team) => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = `${team.flag} ${team.name}`;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
}

function isMobileView() {
  return window.matchMedia('(max-width: 860px)').matches;
}

function updateMobileLayoutState() {
  const layout = document.getElementById('main-layout');
  const open = selectedDay !== null && isMobileView();
  layout?.classList.toggle('layout--day-open', open);
}

function scrollToMatches() {
  if (!isMobileView()) return;
  updateMobileLayoutState();
  window.requestAnimationFrame(() => {
    document.getElementById('match-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

function renderCalendar() {
  const calendar = document.getElementById('calendar');
  const monthLabel = document.getElementById('month-label');
  calendar.innerHTML = '';
  monthLabel.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  WEEKDAYS.forEach((wd) => {
    const el = document.createElement('div');
    el.className = 'calendar__weekday';
    el.textContent = wd;
    calendar.appendChild(el);
  });

  const offset = firstWeekdayOffset(currentYear, currentMonth);
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar__day calendar__day--empty';
    calendar.appendChild(empty);
  }

  const totalDays = daysInMonth(currentYear, currentMonth);
  for (let day = 1; day <= totalDays; day++) {
    const dayMatches = getAllMatchesForDay(day);
    const cell = document.createElement('div');
    cell.className = 'calendar__day';
    cell.setAttribute('role', 'gridcell');

    if (dayMatches.length > 0) {
      cell.classList.add('calendar__day--has-match');
      cell.addEventListener('click', () => {
        selectedDay = selectedDay === day ? null : day;
        renderCalendar();
        renderMatchList();
        if (selectedDay !== null) scrollToMatches();
        notifyDokiDaySelected();
      });
    }

    if (selectedDay === day) cell.classList.add('calendar__day--selected');
    if (isToday(day, currentMonth, currentYear)) cell.classList.add('calendar__day--today');
    if (dayMatches.length > 0 && isDayInPast(day, currentMonth, currentYear)) {
      cell.classList.add('calendar__day--past');
    }

    const num = document.createElement('span');
    num.className = 'calendar__day-num';
    num.textContent = day;
    cell.appendChild(num);

    if (dayMatches.length > 0) {
      const count = document.createElement('span');
      count.className = 'calendar__count';
      count.textContent = dayMatches.length;
      cell.appendChild(count);

      const events = document.createElement('div');
      events.className = 'calendar__events';
      dayMatches.slice(0, isMobileView() ? 1 : 2).forEach((m) => {
        const chip = document.createElement('div');
        const score = getScoreDisplay(m);
        chip.className = `calendar__event ${m.cssGroup}${score?.status === 'live' ? ' calendar__event--live' : ''}${score?.status === 'finished' ? ' calendar__event--finished' : ''}${selectedMatchId === m.id ? ' calendar__event--selected' : ''}`;
        const scoreLine = score ? ` · ${score.line}` : '';
        chip.title = `${m.homeName}${m.awayName ? ' vs. ' + m.awayName : ''}${scoreLine} — ${m.displayTime}`;
        chip.innerHTML = calendarChipContent(m);
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedDay = day;
          selectedMatchId = m.id;
          renderCalendar();
          renderMatchList();
          scrollToMatches();
          notifyDokiMatchSelected(m.id);
        });
        events.appendChild(chip);
      });
      if (dayMatches.length > (isMobileView() ? 1 : 2)) {
        const more = document.createElement('span');
        more.className = 'calendar__more';
        more.textContent = `+${dayMatches.length - (isMobileView() ? 1 : 2)}`;
        events.appendChild(more);
      }
      cell.appendChild(events);
    }

    calendar.appendChild(cell);
  }
  updateMonthNavButtons();
  updateMobileLayoutState();
}

function getSidebarMatches() {
  if (selectedDay === null) {
    return getFilteredMatches().filter((m) => isInCalendarMonth(m));
  }
  return getAllMatchesForDay(selectedDay);
}

function renderMatchList() {
  const list = document.getElementById('match-list');
  const title = document.getElementById('sidebar-title');
  const subtitle = document.getElementById('sidebar-subtitle');
  const abbr = getTimezoneAbbr(displayTz);

  const monthMatches = getFilteredMatches().filter((m) => isInCalendarMonth(m));
  const display = (selectedDay !== null ? getSidebarMatches() : monthMatches).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.instant - b.instant;
  });

  if (selectedDay === null) hideSidebarDoki();

  title.textContent = selectedDay !== null
    ? `${MONTH_NAMES[currentMonth]} ${selectedDay}`
    : MONTH_NAMES[currentMonth];

  if (selectedDay !== null) {
    const allDay = getAllMatchesForDay(selectedDay).length;
    const filteredDay = getMatchesForDay(selectedDay).length;
    if (display.length > 1) {
      if (activeCountry !== 'all' && filteredDay < allDay) {
        subtitle.textContent = `${allDay} partidos del día · ${filteredDay} con tu filtro`;
      } else {
        subtitle.textContent = `${display.length} partidos · toca uno para comentario de Doki`;
      }
    } else if (activeCountry !== 'all' && filteredDay === 0 && allDay > 0) {
      subtitle.textContent = `${allDay} partidos del día · ninguno con tu filtro`;
    } else {
      subtitle.textContent = `${display.length} partido${display.length === 1 ? '' : 's'} · ${abbr}`;
    }
  } else if (activeCountry === 'all') {
    subtitle.textContent = `${monthMatches.length} partidos · ${abbr}`;
  } else if (activeCountry === 'favorites') {
    subtitle.textContent = '⭐ Mis favoritos';
  } else {
    subtitle.textContent = `${TEAMS[activeCountry].flag} ${TEAMS[activeCountry].name}`;
  }

  const renderCard = window.WCFeatures?.renderMatchCardInteractive || renderMatchCard;
  list.innerHTML = groupMatchesByDate(display)
    .map((item) => {
      if (item.type === 'header') {
        return `<li class="match-day-header">${item.label}</li>`;
      }
      return renderCard(item.match);
    })
    .join('');

  if (display.length === 0) {
    const totalDay = selectedDay !== null ? getAllMatchesForDay(selectedDay).length : 0;
    const emptyText = totalDay > 0
      ? `Hay ${totalDay} partido${totalDay === 1 ? '' : 's'} este día. Cambia el filtro a «Todos» para verlos.`
      : 'No hay partidos aquí. Sigue esperando con las patitas cruzadas.';
    list.innerHTML = `
    <li class="doki-empty">
      <img src="assets/doki.png" alt="" class="doki-empty__img" width="88" height="88">
      <p class="doki-empty__title">Doki revisó el calendario</p>
      <p class="doki-empty__text">${emptyText}</p>
    </li>`;
    updateDokiContext('empty');
    updateMobileLayoutState();
    return;
  }
  updateMobileLayoutState();
}

function getExportMatches() {
  return MATCHES.filter((m) => {
    if (m.knockout) return includeKnockouts;
    if (exportMode === 'all') return true;
    return m.teamIds.some((id) => exportSelections.has(id));
  }).sort((a, b) => a.instant - b.instant);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getExportMeta() {
  const matches = getExportMatches();
  const tzLabel = getTimezoneAbbr(displayTz);

  if (exportMode === 'all') {
    return {
      calendarName: `Mundial 2026 — Todos los países (${tzLabel})`,
      filename: `mundial-2026-todos-paises-${slugify(tzLabel)}.ics`,
      matches,
    };
  }

  const selectedIds = [...exportSelections];
  const selectedNames = selectedIds.map((id) => TEAMS[id]?.name).filter(Boolean);

  if (selectedNames.length === 0) {
    return {
      calendarName: `Mundial 2026 — Sin países (${tzLabel})`,
      filename: `mundial-2026-vacio.ics`,
      matches,
    };
  }

  const namePart =
    selectedNames.length <= 3
      ? selectedNames.join(', ')
      : `${selectedNames.length} países`;

  const filePart =
    selectedIds.length <= 4
      ? selectedIds.map(slugify).join('-')
      : `${selectedIds.length}-paises`;

  return {
    calendarName: `Mundial 2026 — ${namePart} (${tzLabel})`,
    filename: `mundial-2026-${filePart}-${slugify(tzLabel)}.ics`,
    matches,
  };
}

function updateExportUI() {
  const meta = getExportMeta();
  const count = meta.matches.length;

  document.getElementById('export-calendar-name').textContent = meta.calendarName;
  document.getElementById('export-count').textContent =
    `${count} partido${count === 1 ? '' : 's'} · recordatorio 1 h antes`;

  const preview = document.getElementById('export-match-preview');
  if (count === 0) {
    preview.innerHTML = '<li class="export-match-preview__empty">No hay partidos con esta selección.</li>';
    if (window.WCFeatures) WCFeatures.updateWebcalLink();
    return;
  }

  const items = meta.matches.slice(0, 6).map(
    (m) => `
    <li>
      <span class="export-match-preview__time">${m.displayTime}</span>
      <span>${m.homeFlag} ${m.homeName}${m.awayName ? ` vs. ${m.awayFlag} ${m.awayName}` : ''}</span>
    </li>`
  );

  if (count > 6) {
    items.push(`<li class="export-match-preview__more">+ ${count - 6} partidos más…</li>`);
  }

  preview.innerHTML = items.join('');
  if (window.WCFeatures) WCFeatures.updateWebcalLink();
}

function setExportMode(mode) {
  exportMode = mode;
  document.querySelectorAll('.export-mode__btn').forEach((btn) => {
    btn.classList.toggle('export-mode__btn--active', btn.dataset.mode === mode);
  });
  document.getElementById('export-custom-panel').hidden = mode === 'all';
  updateExportUI();
  savePrefs();
}

function openExportModal() {
  const modal = document.getElementById('export-modal');

  if (activeCountry !== 'all' && activeCountry !== 'favorites') {
    exportMode = 'custom';
    exportSelections = new Set([activeCountry]);
  } else if (activeCountry === 'favorites' && window.WCFeatures) {
    exportMode = 'custom';
    exportSelections = new Set(WCFeatures.getCustomFavorites());
  }

  setExportMode(exportMode);
  document.getElementById('include-knockouts').checked = includeKnockouts;
  renderExportTeams();
  updateExportUI();
  modal.showModal();
}

function renderExportTeams(filter = '') {
  const container = document.getElementById('export-teams');
  const query = filter.trim().toLowerCase();
  container.innerHTML = '';

  Object.entries(TEAMS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'))
    .filter(([, team]) => !query || team.name.toLowerCase().includes(query))
    .forEach(([id, team]) => {
      const label = document.createElement('label');
      label.className = 'export-team';
      label.innerHTML = `
        <input type="checkbox" value="${id}" ${exportSelections.has(id) ? 'checked' : ''}>
        <span class="export-team__name">${team.flag} ${team.name}</span>
        <span class="export-team__group">${team.group}</span>`;
      container.appendChild(label);
    });

  container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) exportSelections.add(input.value);
      else exportSelections.delete(input.value);
      updateExportUI();
      savePrefs();
    });
  });
}

function escapeIcs(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function getEndDateTime(match) {
  const endInstant = new Date(match.instant.getTime() + 2 * 60 * 60 * 1000);
  const { year, month, day } = getZonedDateParts(endInstant, displayTz);
  const endTime = formatInTimeZone(endInstant, displayTz, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date: `${year}-${month}-${day}`, time: endTime };
}

function toIcsDateTime(dateStr, timeStr) {
  return `${dateStr.replace(/-/g, '')}T${timeStr.replace(':', '')}00`;
}

function buildIcsEvent(match) {
  const start = toIcsDateTime(match.displayDate, match.displayTime);
  const endParts = getEndDateTime(match);
  const end = toIcsDateTime(endParts.date, endParts.time);
  const title = match.awayName ? `${match.homeName} vs. ${match.awayName}` : match.homeName;
  const tzLabel = getTimezoneLabel(displayTz);

  return [
    'BEGIN:VEVENT',
    `UID:wc2026-${match.id}@calendarEAU`,
    `DTSTAMP:${toIcsDateTime('2026-06-01', '12:00')}`,
    `DTSTART;TZID=${displayTz}:${start}`,
    `DTEND;TZID=${displayTz}:${end}`,
    `SUMMARY:${escapeIcs(`${title} — ${match.groupLabel}`)}`,
    `LOCATION:${escapeIcs(`${match.venue} (Mundial 2026)`)}`,
    `DESCRIPTION:${escapeIcs(`Copa Mundial FIFA 2026\\n#${match.id}\\n${match.dayLabel}\\n${match.displayTime} (${tzLabel})\\n${match.venue}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Partido en 1 hora',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

function generateIcs(matches, calendarName) {
  const timezone = [
    'BEGIN:VTIMEZONE',
    `TZID:${displayTz}`,
    'END:VTIMEZONE',
  ].join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalendarEAU//Mundial 2026//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    `X-WR-TIMEZONE:${displayTz}`,
    timezone,
    matches.map(buildIcsEvent).join('\r\n'),
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs() {
  const meta = getExportMeta();

  if (meta.matches.length === 0) {
    if (exportMode === 'custom' && exportSelections.size === 0) {
      alert('Marca al menos un país, o elige «Todos los países».');
    } else {
      alert('No hay partidos para descargar. Activa las eliminatorias o elige otros países.');
    }
    return;
  }

  const blob = new Blob([generateIcs(meta.matches, meta.calendarName)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = meta.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  document.getElementById('export-modal').close();
  savePrefs();
  dokiManualOverride = true;
  updateDokiContext('exported');
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = window.setInterval(renderNextMatchBanner, 60000);
}

async function shareApp() {
  const payload = {
    title: 'Mundial 2026 — Loma del Gato Edición',
    text: 'Calendario del Mundial FIFA 2026 con Doki 🐾',
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(payload);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      alert('Enlace copiado al portapapeles');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      /* user cancelled share */
    }
  }
}

function setTimezone(tz) {
  displayTz = tz;
  localStorage.setItem('wc2026-tz', tz);
  localStorage.setItem('wc2026-tz-manual', '1');
  selectedDay = null;
  rebuildMatches();
  updateTimezoneUI();
  renderCalendar();
  renderMatchList();
  renderNextMatchBanner();
  if (window.WCFeatures) WCFeatures.refreshAll();
  if (document.getElementById('export-modal').open) updateExportUI();
}

function setActiveCountry(country) {
  activeCountry = country;
  selectedDay = null;
  dokiManualOverride = false;
  const filter = document.getElementById('country-filter');
  if (filter.querySelector(`option[value="${country}"]`) || country === 'all' || country === 'favorites') {
    filter.value = country;
  }
  document.querySelectorAll('.segmented__btn[data-team]').forEach((btn) => {
    btn.classList.toggle('segmented__btn--active', btn.dataset.team === country);
  });
  savePrefs();
  renderCalendar();
  renderMatchList();
  renderNextMatchBanner();
  if (window.WCFeatures) {
    WCFeatures.refreshAll();
    WCFeatures.scheduleNotifications();
  }
  dokiManualOverride = false;
  requestDokiAI('context', { force: true });
}

function setupExportModal() {
  const modal = document.getElementById('export-modal');

  document.getElementById('open-export').addEventListener('click', openExportModal);
  document.getElementById('close-export').addEventListener('click', () => modal.close());
  document.getElementById('download-export').addEventListener('click', downloadIcs);

  document.getElementById('mode-all').addEventListener('click', () => setExportMode('all'));
  document.getElementById('mode-custom').addEventListener('click', () => setExportMode('custom'));

  document.getElementById('select-all-teams').addEventListener('click', () => {
    exportSelections = new Set(Object.keys(TEAMS));
    renderExportTeams(document.getElementById('export-search').value);
    updateExportUI();
    savePrefs();
  });

  document.getElementById('clear-teams').addEventListener('click', () => {
    exportSelections.clear();
    renderExportTeams(document.getElementById('export-search').value);
    updateExportUI();
    savePrefs();
  });

  document.getElementById('select-favorites').addEventListener('click', () => {
    exportMode = 'custom';
    exportSelections = new Set(['argentina', 'spain', 'uruguay']);
    setExportMode('custom');
    renderExportTeams(document.getElementById('export-search').value);
    updateExportUI();
    savePrefs();
  });

  document.getElementById('include-knockouts').addEventListener('change', (e) => {
    includeKnockouts = e.target.checked;
    updateExportUI();
    savePrefs();
    renderCalendar();
    renderMatchList();
    if (window.WCFeatures) {
      WCFeatures.refreshAll();
      WCFeatures.scheduleNotifications();
      WCFeatures.updateWebcalLink();
    }
  });

  document.getElementById('export-search').addEventListener('input', (e) => {
    renderExportTeams(e.target.value);
  });
}

function setupFilters() {
  document.getElementById('timezone-select').addEventListener('change', (e) => {
    setTimezone(e.target.value);
  });

  document.getElementById('country-filter').addEventListener('change', (e) => {
    setActiveCountry(e.target.value);
  });

  document.querySelectorAll('.segmented__btn[data-team]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveCountry(btn.dataset.team));
  });
}

function nextDokiQuote() {
  dokiManualOverride = true;
  requestDokiAI('tap', { force: true });
}

function setupDoki() {
  document.getElementById('doki-tap').addEventListener('click', nextDokiQuote);
  setupDokiComics();
}

function setupGoToday() {
  document.getElementById('go-today').addEventListener('click', goToToday);
}

function setupAppTabs() {
  document.querySelector('.app-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.app-tab');
    if (!btn?.dataset.tab) return;
    goTab(btn.dataset.tab);
  });
}

function ensureFeaturePanels(tab) {
  if (!window.WCFeatures) return;
  if (tab && tab !== 'calendar') WCFeatures.renderForTab?.(tab);
  WCFeatures.refreshAll?.();
}

function bootFeaturePanels() {
  if (!window.WCFeatures) return;
  WCFeatures.refreshAll?.();
}
function goTab(tab) {
  document.querySelectorAll('.app-tab').forEach((btn) => {
    btn.classList.toggle('app-tab--active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.layout__main [data-view]').forEach((view) => {
    view.hidden = view.dataset.view !== tab;
  });

  const isCalendar = tab === 'calendar';
  const sidebar = document.getElementById('match-panel');
  const layout = document.getElementById('main-layout');
  if (sidebar) sidebar.hidden = !isCalendar;
  if (layout) layout.classList.toggle('layout--solo', !isCalendar);
  document.querySelector('.controls')?.toggleAttribute('hidden', !isCalendar && tab !== 'agenda');
  document.querySelector('.doki-hero')?.toggleAttribute('hidden', !isCalendar);
  document.getElementById('today-widget')?.toggleAttribute('hidden', !isCalendar);
  if (isCalendar) renderNextMatchBanner();
  else {
    const banner = document.getElementById('next-match-banner');
    if (banner) banner.hidden = true;
  }

  if (tab !== 'calendar') {
    ensureFeaturePanels(tab);
    setTimeout(() => ensureFeaturePanels(tab), 0);
  }

  layout?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.goTab = goTab;
window.notifyDokiMatchSelected = notifyDokiMatchSelected;
window.getSelectedMatchId = () => selectedMatchId;
window.formatMatchGoalsSummary = formatMatchGoalsSummary;

function setupShare() {
  const btn = document.getElementById('share-app');
  if (navigator.share || navigator.clipboard?.writeText) {
    btn.hidden = false;
    btn.addEventListener('click', shareApp);
  }
}

function setupMonthNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    const idx = tournamentMonthIndex(currentYear, currentMonth);
    if (idx <= 0) return;
    const prev = TOURNAMENT_MONTHS[idx - 1];
    currentYear = prev.year;
    currentMonth = prev.month;
    selectedDay = null;
    renderCalendar();
    renderMatchList();
    notifyDokiDaySelected();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    const idx = tournamentMonthIndex(currentYear, currentMonth);
    if (idx < 0 || idx >= TOURNAMENT_MONTHS.length - 1) return;
    const next = TOURNAMENT_MONTHS[idx + 1];
    currentYear = next.year;
    currentMonth = next.month;
    selectedDay = null;
    renderCalendar();
    renderMatchList();
    notifyDokiDaySelected();
  });
}

function init() {
  loadPrefs();
  initDisplayTimezone();
  populateTimezoneSelect();
  populateCountryFilter();

  document.getElementById('country-filter').value = activeCountry;
  document.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.classList.toggle('segmented__btn--active', btn.dataset.team === activeCountry);
  });
  document.getElementById('include-knockouts').checked = includeKnockouts;

  rebuildMatches();
  syncCalendarMonthToToday();
  updateTimezoneUI();
  renderCalendar();
  renderMatchList();
  bootAsync();

  setupFilters();
  setupMonthNav();
  setupGoToday();
  setupExportModal();
  setupShare();
  setupDoki();
  setupAppTabs();
  if (window.WCFeatures) WCFeatures.init();
  bootFeaturePanels();
  queueMicrotask(bootFeaturePanels);
  requestAnimationFrame(bootFeaturePanels);
  setTimeout(bootFeaturePanels, 50);
  window.addEventListener('load', bootFeaturePanels, { once: true });
  let wasMobile = isMobileView();
  window.addEventListener('resize', () => {
    updateMobileLayoutState();
    const nowMobile = isMobileView();
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      renderCalendar();
    }
  }, { passive: true });
  updateMobileLayoutState();
  window.__wcAppReady = true;
}

async function bootAsync() {
  renderNextMatchBanner();
  lastFinishedCount = 0;

  const scoresOk = await fetchScores({ silent: true, force: true });
  if (scoresOk) {
    lastFinishedCount = Object.values(SCORES_CACHE).filter((s) => s?.status === 'finished').length;
    requestDokiAI('auto', { force: true });
  } else {
    updateDokiContext();
  }

  scheduleScoresPoll();
  setupScoresRefresh();
  startCountdownTimer();
  startDokiAuto();
  ensureFeaturePanels();
}

init();
