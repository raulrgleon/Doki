/* eslint-disable no-unused-vars */
const WCFeatures = (() => {
  const GROUPS = 'ABCDEFGHIJKL'.split('');
  const KO_STAGES = [
    { key: 'r32', label: 'Dieciseisavos' },
    { key: 'r16', label: 'Octavos' },
    { key: 'qf', label: 'Cuartos' },
    { key: 'sf', label: 'Semifinales' },
    { key: 'third', label: '3er puesto' },
    { key: 'final', label: 'Final' },
  ];

  let customFavorites = new Set(['argentina', 'spain', 'uruguay']);
  let activeVenue = null;
  let activeTab = 'calendar';
  let prevScores = {};
  let notifTimers = [];
  let themeMode = 'auto';

  function loadFeaturePrefs() {
    try {
      const fav = JSON.parse(localStorage.getItem('wc2026-favorites') || '[]');
      if (Array.isArray(fav) && fav.length) customFavorites = new Set(fav);
    } catch { /* */ }
    themeMode = localStorage.getItem('wc2026-theme') || 'auto';
    activeVenue = localStorage.getItem('wc2026-venue') || null;
    applyTheme();
  }

  function saveFeaturePrefs() {
    localStorage.setItem('wc2026-favorites', JSON.stringify([...customFavorites]));
    localStorage.setItem('wc2026-theme', themeMode);
    if (activeVenue) localStorage.setItem('wc2026-venue', activeVenue);
    else localStorage.removeItem('wc2026-venue');
  }

  function getCustomFavorites() {
    return customFavorites;
  }

  function getActiveVenue() {
    return activeVenue;
  }

  function matchTitle(m) {
    return `${m.homeFlag} ${m.homeName}${m.awayName ? ` vs ${m.awayFlag} ${m.awayName}` : ''}`;
  }

  function matchState(m) {
    const score = getScoreDisplay(m);
    if (score?.status === 'live') return { label: 'EN VIVO', cls: 'state-live', text: `${score.line} · ${score.minute || 'Jugando'}` };
    if (score?.status === 'finished') return { label: 'Final', cls: 'state-finished', text: score.line };
    return { label: 'Próximo', cls: 'state-upcoming', text: `${m.displayTime} · ${getTimezoneAbbr(displayTz)}` };
  }

  function favoritesInMatch(m) {
    return m.teamIds?.some((id) => customFavorites.has(id));
  }

  function getTodayMatches() {
    const t = getTodayInDisplayTz();
    return getFilteredMatches().filter(
      (m) => m.displayDay === t.day && m.displayMonth === t.month && m.displayYear === t.year
    ).sort((a, b) => a.instant - b.instant);
  }

  function matchPassesVenue(m) {
    return !activeVenue || m.venue === activeVenue;
  }

  function matchPassesFavorites(m) {
    if (activeCountry !== 'favorites') return true;
    if (m.knockout) return includeKnockouts;
    return m.teamIds.some((id) => customFavorites.has(id));
  }

  function applyTheme() {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (themeMode === 'light') root.classList.add('theme-light');
    else if (themeMode === 'dark') root.classList.add('theme-dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (meta) meta.content = dark ? '#000000' : '#f2f2f7';
  }

  function cycleTheme() {
    const modes = ['auto', 'light', 'dark'];
    themeMode = modes[(modes.indexOf(themeMode) + 1) % modes.length];
    applyTheme();
    saveFeaturePrefs();
    const labels = { auto: 'Auto', light: 'Claro', dark: 'Oscuro' };
    document.getElementById('theme-toggle').textContent = labels[themeMode];
  }

  function computeStandings(group) {
    const teamIds = Object.entries(TEAMS).filter(([, t]) => t.group === group).map(([id]) => id);
    const stats = {};
    teamIds.forEach((id) => {
      stats[id] = { id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
    });

    MATCHES.filter(
      (m) => !m.knockout && m.group === group && m.score?.status === 'finished'
    ).forEach((m) => {
      const h = m.score.homeScore;
      const a = m.score.awayScore;
      const hid = m.home;
      const aid = m.away;
      if (!stats[hid] || !stats[aid]) return;
      stats[hid].pj++; stats[aid].pj++;
      stats[hid].gf += h; stats[hid].gc += a;
      stats[aid].gf += a; stats[aid].gc += h;
      if (h > a) { stats[hid].g++; stats[hid].pts += 3; stats[aid].p++; }
      else if (a > h) { stats[aid].g++; stats[aid].pts += 3; stats[hid].p++; }
      else { stats[hid].e++; stats[aid].e++; stats[hid].pts++; stats[aid].pts++; }
    });

    return Object.values(stats).map((s) => {
      s.dg = s.gf - s.gc;
      const t = TEAMS[s.id];
      return { ...s, name: t.name, flag: t.flag };
    }).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
  }

  function renderStandings() {
    const el = document.getElementById('standings-grid');
    if (!el) return;
    const groupRows = GROUPS.map((g) => ({ group: g, rows: computeStandings(g) }));
    const thirds = groupRows
      .map(({ group, rows }) => ({ ...rows[2], group }))
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
      .map((row, idx) => ({ ...row, thirdRank: idx + 1, advances: idx < 8 }));

    const thirdMap = new Map(thirds.map((row) => [row.id, row]));
    const thirdBoard = `
      <div class="standings-card standings-card--thirds">
        <h3>Mejores terceros</h3>
        <table class="standings-table">
          <thead><tr><th>#</th><th>Equipo</th><th>Grupo</th><th>Pts</th><th>DG</th></tr></thead>
          <tbody>${thirds.map((r) => `
            <tr class="${r.advances ? 'standings__row--wildcard' : 'standings__row--out'}">
              <td>${r.thirdRank}</td>
              <td>${r.flag} ${r.name}</td>
              <td>${r.group}</td>
              <td><strong>${r.pts}</strong></td>
              <td>${r.dg > 0 ? '+' : ''}${r.dg}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

    el.innerHTML = groupRows.map(({ group: g, rows }) => {
      const body = rows.map((r, i) => `
        <tr class="${i < 2 ? 'standings__row--qualify' : thirdMap.get(r.id)?.advances ? 'standings__row--wildcard' : 'standings__row--out'}">
          <td>${i + 1}</td>
          <td>${r.flag} ${r.name}<span class="standings-badge">${i < 2 ? 'Clasifica' : thirdMap.get(r.id)?.advances ? `3º #${thirdMap.get(r.id).thirdRank}` : 'Eliminado'}</span></td>
          <td>${r.pj}</td>
          <td>${r.g}-${r.e}-${r.p}</td>
          <td>${r.gf}:${r.gc}</td>
          <td><strong>${r.pts}</strong></td>
        </tr>`).join('');
      return `
        <div class="standings-card glass-inset">
          <h3>Grupo ${g}</h3>
          <table class="standings-table">
            <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G-E-P</th><th>GF:GC</th><th>Pts</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>`;
    }).join('') + thirdBoard;
  }

  function renderBracket() {
    const el = document.getElementById('bracket-tree');
    if (!el) return;
    el.innerHTML = KO_STAGES.map(({ key, label }) => {
      const matches = MATCHES.filter((m) => m.stage === key).sort((a, b) => a.instant - b.instant);
      const cards = matches.map((m) => {
        const score = getScoreDisplay(m);
        const state = matchState(m);
        const scoreTxt = score ? score.line : m.displayTime;
        const live = score?.status === 'live' ? ' bracket-match--live' : '';
        const done = score?.status === 'finished' ? ' bracket-match--done' : '';
        return `
          <button type="button" class="bracket-match${live}${done}" data-match-id="${m.id}">
            <span class="bracket-match__label">${label} · #${m.id}</span>
            <span class="bracket-match__teams">${matchTitle(m)}</span>
            <span class="bracket-match__score">${scoreTxt}</span>
            <span class="bracket-match__meta">${state.label} · ${state.text} · ${m.venue}</span>
          </button>`;
      }).join('');
      return `<div class="bracket-col"><h3>${label}</h3>${cards || '<p class="bracket-empty">Próximamente</p>'}</div>`;
    }).join('');
    el.querySelectorAll('[data-match-id]').forEach((btn) => {
      btn.addEventListener('click', () => openMatchDeepLink(parseInt(btn.dataset.matchId, 10)));
    });
  }

  function renderAgenda() {
    const el = document.getElementById('agenda-list');
    if (!el) return;
    const all = getFilteredMatches().sort((a, b) => a.instant - b.instant);
    el.innerHTML = groupMatchesByDate(all).map((item) => {
      if (item.type === 'header') return `<li class="match-day-header">${item.label}</li>`;
      return renderMatchCardInteractive(item.match);
    }).join('');
    bindMatchListActions(el);
  }

  function renderVenueMatches() {
    const detail = document.getElementById('venues-detail');
    const list = document.getElementById('venues-match-list');
    const title = document.getElementById('venues-detail-title');
    const subtitle = document.getElementById('venues-detail-subtitle');
    const hint = document.getElementById('venues-hint');
    if (!detail || !list) return;

    if (!activeVenue) {
      detail.hidden = true;
      if (hint) hint.textContent = 'Toca una sede para ver sus partidos';
      return;
    }

    const meta = VENUES[activeVenue] || { country: '🏟️', city: activeVenue };
    const matches = MATCHES.filter((m) => m.venue === activeVenue).sort((a, b) => a.instant - b.instant);
    const abbr = getTimezoneAbbr(displayTz);

    detail.hidden = false;
    if (hint) hint.textContent = `Partidos en ${meta.city}`;
    if (title) title.textContent = `${meta.country} ${meta.city}`;
    if (subtitle) {
      subtitle.textContent = `${matches.length} partido${matches.length === 1 ? '' : 's'} · horarios en ${abbr}`;
    }

    list.innerHTML = groupMatchesByDate(matches)
      .map((item) => {
        if (item.type === 'header') return `<li class="match-day-header">${item.label}</li>`;
        return renderMatchCardInteractive(item.match);
      })
      .join('');
    bindMatchListActions(list);

    if (window.matchMedia('(max-width: 860px)').matches) {
      window.requestAnimationFrame(() => {
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function renderVenues() {
    const el = document.getElementById('venues-grid');
    if (!el) return;
    const venues = [...new Set(MATCHES.map((m) => m.venue))].sort();
    el.innerHTML = venues.map((name) => {
      const meta = VENUES[name] || { country: '🏟️', city: name, abbr: name.slice(0, 3) };
      const count = MATCHES.filter((m) => m.venue === name).length;
      const active = activeVenue === name ? ' venue-card--active' : '';
      return `
        <button type="button" class="venue-card glass-inset${active}" data-venue="${name}">
          <span class="venue-card__flag">${meta.country}</span>
          <span class="venue-card__city">${meta.city}</span>
          <span class="venue-card__count">${count} partidos</span>
        </button>`;
    }).join('');
    el.querySelectorAll('[data-venue]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeVenue = activeVenue === btn.dataset.venue ? null : btn.dataset.venue;
        saveFeaturePrefs();
        renderVenues();
        renderVenueMatches();
        renderCalendar();
        renderMatchList();
        renderTodayWidget();
      });
    });
    renderVenueMatches();
  }

  function renderTodayWidget() {
    const el = document.getElementById('today-widget');
    const list = document.getElementById('today-matches');
    const dashboard = document.getElementById('daily-dashboard');
    if (!el || !list || !dashboard) return;
    const today = getTodayMatches();

    if (!today.length) { el.hidden = true; return; }
    el.hidden = false;
    const live = today.find((m) => m.score?.status === 'live');
    const upcoming = today.find((m) => !m.score || m.score.status === 'scheduled');
    const finished = today.filter((m) => m.score?.status === 'finished').length;
    const focus = live || upcoming || today[today.length - 1];
    const focusState = matchState(focus);
    const favToday = today.filter(favoritesInMatch);

    dashboard.innerHTML = `
      <button class="daily-hero ${focusState.cls}" type="button" data-match-id="${focus.id}">
        <span class="daily-hero__label">${focusState.label}</span>
        <span class="daily-hero__teams">${matchTitle(focus)}</span>
        <span class="daily-hero__meta">${focusState.text} · ${focus.venue}</span>
      </button>
      <div class="daily-stats">
        <span><strong>${today.length}</strong> hoy</span>
        <span><strong>${today.filter((m) => m.score?.status === 'live').length}</strong> live</span>
        <span><strong>${finished}</strong> finalizados</span>
        <span><strong>${favToday.length}</strong> favoritos</span>
      </div>`;

    dashboard.querySelector('[data-match-id]')?.addEventListener('click', (e) => {
      openMatchDeepLink(parseInt(e.currentTarget.dataset.matchId, 10));
    });

    list.innerHTML = today.map((m) => {
      const state = matchState(m);
      const fav = favoritesInMatch(m) ? '<span class="today-chip__fav">⭐</span>' : '';
      return `
        <li class="today-chip ${m.cssGroup}${state.cls === 'state-live' ? ' today-chip--live' : ''}" data-match-id="${m.id}">
          <span class="today-chip__time">${state.text}</span>
          <span>${matchTitle(m)}</span>
          ${fav}
        </li>`;
    }).join('');
    list.querySelectorAll('[data-match-id]').forEach((chip) => {
      chip.addEventListener('click', () => openMatchDeepLink(parseInt(chip.dataset.matchId, 10)));
    });
    const favBtn = document.getElementById('today-follow-favorites');
    if (favBtn) favBtn.onclick = () => setActiveCountry('favorites');
  }

  function renderMatchCardInteractive(m) {
    const score = getScoreDisplay(m);
    const selected = (window.getSelectedMatchId?.() ?? highlightedMatchId) === m.id;
    const highlight = selected ? ' match-card--highlight match-card--selected' : '';
    return `
    <li class="${matchCardClasses(m)}${highlight}" data-match-id="${m.id}" tabindex="0" role="button" aria-label="Ver comentario de Doki sobre ${m.homeName} vs ${m.awayName || ''}">
      <div class="match-card__top">
        <span class="match-card__time">${m.displayTime}</span>
        <span class="match-card__badge">${m.groupLabel}</span>
      </div>
      ${matchScoreHtml(m)}
      <p class="match-card__teams">${m.homeFlag} ${m.homeName}${m.awayName ? `<span class="match-card__vs">vs</span>${m.awayFlag} ${m.awayName}` : ''}</p>
      <p class="match-card__meta">${m.venue}</p>
      ${score?.status === 'finished' && m.score?.goals?.length ? `<p class="match-card__goals">${window.formatMatchGoalsSummary?.(m) || ''}</p>` : ''}
      <div class="match-card__actions">
        <span class="match-card__tap-hint">Toca para comentario de Doki 🐾</span>
        <button type="button" class="pill pill--sm" data-share-match="${m.id}">Compartir</button>
      </div>
    </li>`;
  }

  let highlightedMatchId = null;
  let activeMatchCenterId = null;

  function bindMatchListActions(container) {
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';
    container.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('[data-share-match]');
      if (shareBtn) {
        e.stopPropagation();
        shareMatch(parseInt(shareBtn.dataset.shareMatch, 10));
        return;
      }
      const card = e.target.closest('[data-match-id]');
      if (!card) return;
      const id = parseInt(card.dataset.matchId, 10);
      onMatchTap(id);
    });
  }

  function onMatchTap(id) {
    const m = MATCHES.find((x) => x.id === id);
    if (!m) return;
    highlightedMatchId = id;
    activeMatchCenterId = id;
    if (window.notifyDokiMatchSelected) {
      window.notifyDokiMatchSelected(id);
    }
    openMatchCenter(id);
    renderMatchList();
    renderAgenda();
  }

  async function shareMatch(id) {
    const url = `${window.location.origin}${window.location.pathname}?match=${id}`;
    const m = MATCHES.find((x) => x.id === id);
    const title = m ? `${m.homeName} vs ${m.awayName || '?'}` : 'Partido Mundial 2026';
    try {
      if (navigator.share) await navigator.share({ title, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Enlace copiado');
      }
    } catch { /* cancelled */ }
  }

  function matchTimelineHtml(m) {
    const goals = m.score?.goals || [];
    if (!goals.length) {
      return '<li class="timeline-empty">Sin goles reportados todavía. Doki mantiene la nariz en la transmisión.</li>';
    }
    return goals.map((g) => {
      const side = g.side === 'home' ? m.homeName : g.side === 'away' ? m.awayName : 'Gol';
      const flag = g.side === 'home' ? m.homeFlag : g.side === 'away' ? m.awayFlag : '⚽';
      return `
        <li class="timeline-goal">
          <span class="timeline-goal__minute">${g.minute || '—'}</span>
          <span class="timeline-goal__ball">⚽</span>
          <span><strong>${flag} ${side}</strong><br>${formatGoalLine(g)}</span>
        </li>`;
    }).join('');
  }

  function openMatchCenter(id) {
    const modal = document.getElementById('match-center-modal');
    const content = document.getElementById('match-center-content');
    const m = MATCHES.find((x) => x.id === id);
    if (!modal || !content || !m) return;
    activeMatchCenterId = id;
    const state = matchState(m);
    const score = getScoreDisplay(m);
    const scoreLine = score ? score.line : 'vs';
    const goalsSummary = window.formatMatchGoalsSummary?.(m);
    content.innerHTML = `
      <section class="match-center__hero ${state.cls}">
        <p class="match-center__stage">${m.groupLabel} · #${m.id}</p>
        <div class="match-center__teams">
          <span>${m.homeFlag} ${m.homeName}</span>
          <strong>${scoreLine}</strong>
          <span>${m.awayFlag} ${m.awayName || ''}</span>
        </div>
        <p class="match-center__meta">${state.label} · ${state.text} · ${m.dayLabel} · ${m.venue}</p>
      </section>
      <section class="match-center__grid">
        <div class="match-center__card">
          <h3>Timeline</h3>
          <ul class="match-timeline">${matchTimelineHtml(m)}</ul>
        </div>
        <div class="match-center__card">
          <h3>Datos rápidos</h3>
          <p><strong>Hora:</strong> ${m.displayTime} (${getTimezoneAbbr(displayTz)})</p>
          <p><strong>Sede:</strong> ${m.venue}</p>
          <p><strong>Estado:</strong> ${state.label}</p>
          <p><strong>Goles:</strong> ${goalsSummary || 'Pendiente de datos'}</p>
          <div class="match-center__actions">
            <button type="button" class="pill" data-center-doki="${m.id}">Comentario Doki</button>
            <button type="button" class="pill" data-center-share="${m.id}">Compartir</button>
          </div>
        </div>
      </section>`;
    content.querySelector('[data-center-doki]')?.addEventListener('click', () => {
      window.notifyDokiMatchSelected?.(id);
    });
    content.querySelector('[data-center-share]')?.addEventListener('click', () => shareMatch(id));
    if (!modal.open) modal.showModal();
  }

  function openMatchDeepLink(id) {
    const m = MATCHES.find((x) => x.id === id);
    if (!m) return;
    currentYear = m.displayYear;
    currentMonth = m.displayMonth;
    selectedDay = m.displayDay;
    setActiveTab('calendar');
    renderCalendar();
    renderMatchList();
    onMatchTap(id);
    scrollToMatches();
  }

  function parseDeepLink() {
    const id = parseInt(new URLSearchParams(window.location.search).get('match') || '', 10);
    if (id) window.setTimeout(() => openMatchDeepLink(id), 600);
  }

  let _inited = false;

  function applyViewTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.app-tab').forEach((btn) => {
      btn.classList.toggle('app-tab--active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.layout__main [data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== tab;
    });
    const sidebar = document.getElementById('match-panel');
    const layout = document.getElementById('main-layout');
    const isCalendar = tab === 'calendar';
    if (sidebar) sidebar.hidden = !isCalendar;
    if (layout) layout.classList.toggle('layout--solo', !isCalendar);
    document.querySelector('.controls')?.toggleAttribute('hidden', !isCalendar && tab !== 'agenda');
    document.querySelector('.doki-hero')?.toggleAttribute('hidden', !isCalendar);
    document.getElementById('next-match-banner')?.toggleAttribute('hidden', !isCalendar);
    document.getElementById('today-widget')?.toggleAttribute('hidden', !isCalendar);
    layout?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderForTab(tab) {
    if (tab === 'standings') renderStandings();
    if (tab === 'bracket') renderBracket();
    if (tab === 'agenda') renderAgenda();
    if (tab === 'venues') renderVenues();
  }

  function setActiveTab(tab) {
    if (window.goTab) window.goTab(tab);
    else {
      applyViewTab(tab);
      renderForTab(tab);
    }
  }

  function renderFavoritesPicker() {
    const el = document.getElementById('favorites-grid');
    if (!el) return;
    el.innerHTML = Object.entries(TEAMS)
      .sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'))
      .map(([id, t]) => `
        <label class="fav-team">
          <input type="checkbox" value="${id}" ${customFavorites.has(id) ? 'checked' : ''}>
          <span>${t.flag} ${t.name}</span>
        </label>`).join('');
    el.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) customFavorites.add(input.value);
        else customFavorites.delete(input.value);
        saveFeaturePrefs();
        updateWebcalLink();
      });
    });
  }

  function updateWebcalLink() {
    const link = document.getElementById('webcal-link');
    if (!link) return;
    const teams = activeCountry === 'favorites' ? [...customFavorites].join(',') : (activeCountry === 'all' ? 'all' : activeCountry);
    const ko = includeKnockouts ? '1' : '0';
    const url = `${window.location.origin}/api/calendar.ics?tz=${encodeURIComponent(displayTz)}&teams=${encodeURIComponent(teams)}&knockouts=${ko}`;
    link.href = url.replace(/^https:/, 'webcal:').replace(/^http:/, 'webcal:');
    link.textContent = url.replace(/^https?:/, 'webcal:');
  }

  function clearNotifTimers() {
    notifTimers.forEach((t) => clearTimeout(t));
    notifTimers = [];
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta notificaciones');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    localStorage.setItem('wc2026-notif', 'true');
    scheduleNotifications();
    document.getElementById('notif-btn')?.classList.add('icon-btn--active');
  }

  function scheduleNotifications() {
    clearNotifTimers();
    if (Notification.permission !== 'granted') return;
    if (localStorage.getItem('wc2026-notif') !== 'true') return;

    const teams = customFavorites;
    const now = Date.now();
    const alerts = [60 * 60 * 1000, 15 * 60 * 1000];

    MATCHES.forEach((m) => {
      if (m.knockout && !includeKnockouts) return;
      if (!m.teamIds.some((id) => teams.has(id))) return;
      const msUntil = m.instant.getTime() - now;
      alerts.forEach((before) => {
        const delay = msUntil - before;
        if (delay > 0 && delay < 7 * 24 * 3600000) {
          const mins = before / 60000;
          const timer = window.setTimeout(() => {
            const body = `${m.homeName}${m.awayName ? ` vs ${m.awayName}` : ''} · ${m.displayTime}`;
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification('Mundial 2026 🐾', { body, icon: '/assets/doki.png', tag: `m${m.id}-${mins}` });
              });
            } else {
              new Notification('Mundial 2026 🐾', { body, icon: '/assets/doki.png' });
            }
          }, delay);
          notifTimers.push(timer);
        }
      });
    });
  }

  function triggerArgentinaGoalCelebration() {
    document.body.classList.add('celebration-active');
    const layer = document.getElementById('confetti-layer');
    if (layer) {
      layer.innerHTML = '';
      for (let i = 0; i < 24; i++) {
        const p = document.createElement('span');
        p.className = 'confetti';
        p.textContent = ['🇦🇷', '⚽', '🐾', '✨'][i % 4];
        p.style.left = `${Math.random() * 100}%`;
        p.style.animationDelay = `${Math.random() * 0.8}s`;
        layer.appendChild(p);
      }
    }
    setDokiMessage({ quote: '¡GOOOL! Doki ladra por Argentina', hint: 'La Scaloneta despertó al vecindario' }, true);
    triggerDokiAction('bark');
    window.setTimeout(() => document.body.classList.remove('celebration-active'), 4000);
  }

  function notifyFavoriteScoreChange(m, prev, current) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!favoritesInMatch(m)) return;
    const oldGoals = (prev.homeScore || 0) + (prev.awayScore || 0);
    const newGoals = (current.homeScore || 0) + (current.awayScore || 0);
    let title = null;
    let body = null;
    if (newGoals > oldGoals) {
      title = `Gol en ${m.homeName} vs ${m.awayName}`;
      body = `${current.homeScore}-${current.awayScore} · ${current.minute || 'En vivo'}`;
    } else if (prev.status !== 'finished' && current.status === 'finished') {
      title = `Final: ${m.homeName} vs ${m.awayName}`;
      body = `${current.homeScore}-${current.awayScore} · Doki ya lo archivó`;
    }
    if (!title) return;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, {
        body,
        icon: '/assets/doki.png',
        tag: `score-${m.id}-${current.homeScore}-${current.awayScore}`,
      }));
    } else {
      new Notification(title, { body, icon: '/assets/doki.png' });
    }
  }

  function onScoresUpdated(oldCache, newCache) {
    Object.entries(newCache).forEach(([id, sc]) => {
      const prev = oldCache[id];
      const m = MATCHES.find((x) => String(x.id) === String(id));
      if (!m || !prev) return;
      notifyFavoriteScoreChange(m, prev, sc);
      const argInvolved = m.teamIds?.includes('argentina');
      const newGoals = sc.homeScore + sc.awayScore;
      const oldGoals = (prev.homeScore || 0) + (prev.awayScore || 0);
      if (argInvolved && sc.status === 'live' && newGoals > oldGoals) {
        triggerArgentinaGoalCelebration();
      }
    });
    prevScores = { ...newCache };
    if (activeMatchCenterId && document.getElementById('match-center-modal')?.open) {
      openMatchCenter(activeMatchCenterId);
    }
  }

  function refreshAll() {
    try { renderTodayWidget(); } catch (err) { console.error('today widget', err); }
    try { renderStandings(); } catch (err) { console.error('standings', err); }
    try { renderBracket(); } catch (err) { console.error('bracket', err); }
    try { renderAgenda(); } catch (err) { console.error('agenda', err); }
    try { renderVenues(); } catch (err) { console.error('venues', err); }
    try { updateWebcalLink(); } catch (err) { console.error('webcal', err); }
  }

  function init() {
    const firstRun = !_inited;
    if (firstRun) {
      _inited = true;
      loadFeaturePrefs();
      parseDeepLink();

      document.getElementById('theme-toggle')?.addEventListener('click', cycleTheme);
      document.getElementById('notif-btn')?.addEventListener('click', enableNotifications);
      document.getElementById('open-favorites')?.addEventListener('click', (e) => {
        e.stopPropagation();
        renderFavoritesPicker();
        document.getElementById('favorites-modal').showModal();
      });
      document.getElementById('close-favorites')?.addEventListener('click', () => {
        document.getElementById('favorites-modal').close();
        if (activeCountry === 'favorites') {
          renderCalendar();
          renderMatchList();
          renderNextMatchBanner();
          refreshAll();
        }
      });
      document.getElementById('apply-favorites')?.addEventListener('click', () => {
        setActiveCountry('favorites');
        document.getElementById('favorites-modal').close();
      });
      document.getElementById('close-match-center')?.addEventListener('click', () => {
        document.getElementById('match-center-modal')?.close();
      });
      document.getElementById('match-center-share')?.addEventListener('click', () => {
        if (activeMatchCenterId) shareMatch(activeMatchCenterId);
      });

      bindMatchListActions(document.getElementById('match-list'));
      bindMatchListActions(document.getElementById('agenda-list'));
      bindMatchListActions(document.getElementById('venues-match-list'));

      if (localStorage.getItem('wc2026-notif') === 'true') scheduleNotifications();
      const labels = { auto: 'Auto', light: 'Claro', dark: 'Oscuro' };
      const tt = document.getElementById('theme-toggle');
      if (tt) tt.textContent = labels[themeMode];
    }

    refreshAll();
  }

  return {
    init,
    applyViewTab,
    setActiveTab,
    renderForTab,
    refreshAll,
    onScoresUpdated,
    getCustomFavorites,
    getActiveVenue,
    matchPassesVenue,
    matchPassesFavorites,
    renderMatchCardInteractive,
    openMatchCenter,
    bindMatchListActions,
    renderTodayWidget,
    updateWebcalLink,
    scheduleNotifications,
  };
})();
window.WCFeatures = WCFeatures;
