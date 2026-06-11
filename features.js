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
    el.innerHTML = GROUPS.map((g) => {
      const rows = computeStandings(g);
      const body = rows.map((r, i) => `
        <tr class="${i < 2 ? 'standings__row--qualify' : ''}">
          <td>${i + 1}</td>
          <td>${r.flag} ${r.name}</td>
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
    }).join('');
  }

  function renderBracket() {
    const el = document.getElementById('bracket-tree');
    if (!el) return;
    el.innerHTML = KO_STAGES.map(({ key, label }) => {
      const matches = MATCHES.filter((m) => m.stage === key).sort((a, b) => a.instant - b.instant);
      const cards = matches.map((m) => {
        const score = getScoreDisplay(m);
        const scoreTxt = score ? score.line : m.displayTime;
        const live = score?.status === 'live' ? ' bracket-match--live' : '';
        return `
          <button type="button" class="bracket-match${live}" data-match-id="${m.id}">
            <span class="bracket-match__label">${label}</span>
            <span class="bracket-match__teams">${m.homeName}${m.awayName ? ` vs ${m.awayName}` : ''}</span>
            <span class="bracket-match__meta">${scoreTxt} · ${m.venue}</span>
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
    const now = Date.now();
    const upcoming = getFilteredMatches()
      .filter((m) => m.instant.getTime() >= now - 3 * 3600000)
      .sort((a, b) => a.instant - b.instant);
    el.innerHTML = groupMatchesByDate(upcoming).map((item) => {
      if (item.type === 'header') return `<li class="match-day-header">${item.label}</li>`;
      return renderMatchCardInteractive(item.match);
    }).join('');
    bindMatchListActions(el);
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
        setActiveTab('calendar');
        renderVenues();
        renderCalendar();
        renderMatchList();
        renderTodayWidget();
      });
    });
  }

  function renderTodayWidget() {
    const el = document.getElementById('today-widget');
    const list = document.getElementById('today-matches');
    if (!el || !list) return;
    const t = getTodayInDisplayTz();
    const today = getFilteredMatches().filter(
      (m) => m.displayDay === t.day && m.displayMonth === t.month && m.displayYear === t.year
    ).sort((a, b) => a.instant - b.instant);

    if (!today.length) { el.hidden = true; return; }
    el.hidden = false;
    list.innerHTML = today.map((m) => {
      const score = getScoreDisplay(m);
      return `
        <li class="today-chip ${m.cssGroup}${score?.status === 'live' ? ' today-chip--live' : ''}" data-match-id="${m.id}">
          <span class="today-chip__time">${score ? score.line : m.displayTime}</span>
          <span>${m.homeFlag}${m.awayFlag} ${m.homeName}${m.awayName ? ` vs ${m.awayName}` : ''}</span>
        </li>`;
    }).join('');
    list.querySelectorAll('[data-match-id]').forEach((chip) => {
      chip.addEventListener('click', () => openMatchDeepLink(parseInt(chip.dataset.matchId, 10)));
    });
  }

  function renderMatchCardInteractive(m) {
    const score = getScoreDisplay(m);
    const highlight = highlightedMatchId === m.id ? ' match-card--highlight' : '';
    return `
    <li class="${matchCardClasses(m)}${highlight}" data-match-id="${m.id}" tabindex="0">
      <div class="match-card__top">
        <span class="match-card__time">${m.displayTime}</span>
        <span class="match-card__badge">${m.groupLabel}</span>
      </div>
      ${matchScoreHtml(m)}
      <p class="match-card__teams">${m.homeFlag} ${m.homeName}${m.awayName ? `<span class="match-card__vs">vs</span>${m.awayFlag} ${m.awayName}` : ''}</p>
      <p class="match-card__meta">${m.venue}</p>
      <div class="match-card__actions">
        <button type="button" class="pill pill--sm" data-share-match="${m.id}">Compartir</button>
      </div>
    </li>`;
  }

  let highlightedMatchId = null;

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
    dokiManualOverride = true;
    const ctx = getDokiContextPayload();
    ctx.tappedMatch = {
      teams: m.awayName ? `${m.homeName} vs ${m.awayName}` : m.homeName,
      when: `${m.dayLabel} ${m.displayTime}`,
      venue: m.venue,
      score: m.score ? `${m.score.homeScore}-${m.score.awayScore}` : null,
    };
    fetch('/api/doki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'match_tap', context: ctx }),
    })
      .then((r) => r.json())
      .then((data) => { setDokiMessage(data, true); triggerDokiAction(data.action); })
      .catch(() => setDokiMessage({ quote: `${m.homeFlag} ${m.homeName}… Doki lo tiene en la mira`, hint: m.venue }, true));
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

  function setActiveTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.app-tab').forEach((btn) => {
      btn.classList.toggle('app-tab--active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('[data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== tab;
    });

    const isCalendar = tab === 'calendar';
    const layout = document.querySelector('.layout[data-view="calendar"]');
    if (layout) layout.hidden = !isCalendar;

    if (tab === 'standings') renderStandings();
    if (tab === 'bracket') renderBracket();
    if (tab === 'agenda') renderAgenda();
    if (tab === 'venues') renderVenues();

    const panel = document.querySelector(`[data-view="${tab}"]:not(.layout)`);
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function onScoresUpdated(oldCache, newCache) {
    Object.entries(newCache).forEach(([id, sc]) => {
      const prev = oldCache[id];
      const m = MATCHES.find((x) => String(x.id) === String(id));
      if (!m || !prev) return;
      const argInvolved = m.teamIds?.includes('argentina');
      const newGoals = sc.homeScore + sc.awayScore;
      const oldGoals = (prev.homeScore || 0) + (prev.awayScore || 0);
      if (argInvolved && sc.status === 'live' && newGoals > oldGoals) {
        triggerArgentinaGoalCelebration();
      }
    });
    prevScores = { ...newCache };
  }

  function refreshAll() {
    renderTodayWidget();
    renderStandings();
    renderBracket();
    renderAgenda();
    renderVenues();
    updateWebcalLink();
  }

  function init() {
    if (_inited) return;
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

    const favBtn = document.querySelector('[data-team="favorites"]');
    favBtn?.addEventListener('click', () => setActiveCountry('favorites'));

    bindMatchListActions(document.getElementById('match-list'));
    bindMatchListActions(document.getElementById('agenda-list'));

    if (localStorage.getItem('wc2026-notif') === 'true') scheduleNotifications();
    const labels = { auto: 'Auto', light: 'Claro', dark: 'Oscuro' };
    const tt = document.getElementById('theme-toggle');
    if (tt) tt.textContent = labels[themeMode];

    refreshAll();
  }

  return {
    init,
    setActiveTab,
    refreshAll,
    onScoresUpdated,
    getCustomFavorites,
    getActiveVenue,
    matchPassesVenue,
    matchPassesFavorites,
    renderMatchCardInteractive,
    bindMatchListActions,
    renderTodayWidget,
    updateWebcalLink,
    scheduleNotifications,
  };
})();
