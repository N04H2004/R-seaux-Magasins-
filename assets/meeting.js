// Meeting tab: the week at a glance, week-by-week trend, the CM's work, monthly goals, meeting actions,
// monthly reports (printable to PDF) and the PowerPoint for the weekly meeting with the direction.
// Reads the statistics through window.MR (set by the dashboard) and the app helpers through window.App.
(() => {
  const $ = (s) => document.querySelector(s);
  const DAY = 864e5;
  const D = (s) => new Date(s + 'T12:00:00Z');
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => iso(D(s).getTime() + n * DAY);
  const fmt = (o) => new Intl.DateTimeFormat('fr-FR', { ...o, timeZone: 'UTC' });
  const fShort = fmt({ day: 'numeric', month: 'short' }), fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' }), fDay = fmt({ weekday: 'short', day: 'numeric' }), fFull = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const sentence = (t) => (/[.!?]$/.test(t) ? t : t + '.'); // « 13 nov. » already ends with a period
  const nf = new Intl.NumberFormat('fr-FR');
  const int = (v) => (v == null ? '—' : nf.format(Math.round(v)));
  const hm = (m) => Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
  const pct = (a, b) => (b ? (a >= b ? '+' : '−') + nf.format(Math.round(Math.abs(a / b - 1) * 100)) + ' %' : '');
  const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const COLOR = { cessole: 'D6001C', netto: 'EE6A00' };
  const SHORT = { cessole: 'Intermarché Cessole', netto: 'Netto Temple' };

  let S = null; // state for the current render: data, week, meeting info, CM work, actions
  const el = (...a) => window.App.el(...a);

  // ---------- derived figures ----------
  function weekInfo(DATA) {
    const W = DATA.weeks || [];
    const cur = W[W.length - 1], prev = W[W.length - 2];
    return { cur, prev, list: W };
  }
  function nextMeeting(today, day) { // day 1 = Monday … 7 = Sunday
    const dow = (D(today).getUTCDay() + 6) % 7 + 1;
    return addDays(today, (day - dow + 7) % 7);
  }
  const monthOf = (d) => d.slice(0, 7);
  const prevMonth = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 15)).slice(0, 7);
  const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0, 12));
  const curMonthEntry = (s) => (s.months || []).filter((m) => m.goals).slice(-1)[0];
  const goalFmt = (k, v) => (v == null ? '—' : k === 'watch' ? String(v).replace('.', ',') + ' s' : int(v));

  // ---------- render ----------
  async function open() {
    if (!window.MR) { $('#mt-when').textContent = 'Chargement des statistiques…'; document.addEventListener('mr-ready', open, { once: true }); return; }
    const { DATA } = window.MR;
    const me = window.App.user();
    const wk = weekInfo(DATA);
    if (!wk.cur) { $('#mt-when').textContent = 'L\'historique des semaines n\'est pas encore disponible.'; return; }
    let r;
    try { r = await window.App.api('/api/meeting?' + new URLSearchParams({ from: wk.cur.start, to: wk.cur.end })); }
    catch (x) { $('#mt-when').textContent = 'Impossible de charger la réunion : ' + x.message; return; }
    const meeting = nextMeeting(r.today, r.meetingDay);
    const pm = prevMonth(monthOf(meeting));
    // the first meeting of a month adds the report of the month before; ?mois=AAAA-MM forces a given month
    const forced = new URLSearchParams(location.search).get('mois');
    const monthly = forced && DATA.reports && DATA.reports[forced] ? forced : +meeting.slice(8, 10) <= 7 && DATA.reports && DATA.reports[pm] ? pm : null;
    S = { DATA, wk, r, meeting, monthly, me, isDir: me.role === 'direction' };

    $('#mt-when').textContent = 'Prochaine réunion : ' + fLong.format(D(meeting)) + ' · semaine du ' + fShort.format(D(wk.cur.start)) + ' au ' + fShort.format(D(wk.cur.end));
    $('#mt-pptnote').textContent = sentence('À ouvrir sur ordinateur, avec les chiffres jusqu\'au ' + fShort.format(D(wk.cur.end)) + (monthly ? ' et le rapport ' + window.MR.of(monthly) : ''));
    $('#mt-banner').hidden = !monthly;
    if (monthly) $('#mt-banner').textContent = 'Première réunion du mois : le rapport ' + window.MR.of(monthly) + ' est ajouté à la présentation.';
    renderWeek(); renderTrend(); renderCm(); renderGoals(); renderActions(); renderReports(); renderSettings();
  }

  function storeHead(s) {
    const h = el('div', 'mt-name'); const dot = el('i', 'mt-dot'); dot.style.background = '#' + COLOR[s.id];
    h.append(dot, el('span', '', SHORT[s.id] || s.name)); return h;
  }
  function tile(l, v, sub) { const t = el('div', 'mt-tile'); t.append(el('div', 'l', l), el('div', 'v', v), el('div', 's', sub || '')); return t; }

  function renderWeek() {
    const { DATA, wk } = S;
    $('#mt-week').replaceChildren(...DATA.stores.map((s) => {
      const c = wk.cur.stores[s.id], p = wk.prev && wk.prev.stores[s.id];
      const card = el('section', 'mt-card'); card.append(storeHead(s));
      const tiles = el('div', 'mt-tiles');
      tiles.append(
        tile('Vues', int(c.views), p ? pct(c.views, p.views) + ' vs sem. préc.' : ''),
        tile('Abonnés', c.followersGained == null ? '—' : '+' + int(c.followersGained), int(c.followers) + ' au total'),
        tile('Posts', int(c.posts), c.reels ? 'dont ' + c.reels + ' Reel' + (c.reels > 1 ? 's' : '') : (p ? p.posts + ' sem. préc.' : '')),
      );
      card.append(tiles);
      const top = el('p', 'mt-top');
      if (c.topPost) { top.append('Meilleur post : '); top.append(el('b', '', c.topPost.title)); top.append(' · ' + int(c.topPost.views) + ' vues'); }
      else top.textContent = 'Aucune publication cette semaine.';
      card.append(top);
      return card;
    }));
  }

  function renderTrend() {
    const { DATA, wk } = S;
    const weeks = wk.list.slice(-8);
    $('#mt-trend').replaceChildren(...DATA.stores.map((s) => {
      const card = el('section', 'mt-card'); card.append(storeHead(s));
      const max = Math.max(1, ...weeks.map((w) => (w.stores[s.id] || {}).views || 0));
      const bars = el('div', 'mt-bars'); bars.style.setProperty('--mt-color', '#' + COLOR[s.id]);
      weeks.forEach((w, i) => {
        const v = (w.stores[s.id] || {}).views || 0;
        const b = el('div', 'mt-bar' + (i === weeks.length - 1 ? ' cur' : ''));
        const bar = el('i'); bar.style.height = Math.max(2, v / max * 88) + '%';
        b.title = fShort.format(D(w.start)) + ' – ' + fShort.format(D(w.end)) + ' : ' + int(v) + ' vues';
        b.append(el('b', '', v >= 1000 ? (Math.round(v / 100) / 10 + 'k').replace('.', ',') : String(v)), bar, el('small', '', fShort.format(D(w.end))));
        bars.append(b);
      });
      card.append(bars, el('p', 'mt-top', 'Vues par semaine de réunion (semaine finissant le jour indiqué).'));
      return card;
    }));
  }

  function renderCm() {
    const { r, wk } = S;
    if (!r.work.length) { $('#mt-cm').replaceChildren(el('p', 'empty', 'Aucun community manager inscrit pour cette semaine.')); return; }
    $('#mt-cm').replaceChildren(...r.work.map((w) => {
      const card = el('section', 'mt-card');
      card.append(el('div', 'mt-name', w.cm.firstName + (w.cm.removed ? ' (ancien compte)' : '')));
      const tiles = el('div', 'mt-tiles');
      tiles.append(tile('Heures', hm(w.minutes), w.shifts + ' shift' + (w.shifts > 1 ? 's' : '')), tile('Jours postés', w.postedDays + '/7', 'avec un post'), tile('Retours', String(w.feedbacks), 'de la direction'));
      card.append(tiles);
      const list = el('div', 'mt-cmrow');
      for (let i = 0; i < 7; i++) {
        const date = addDays(wk.cur.start, i), x = w.days.find((y) => y.date === date) || { minutes: 0 };
        const row = el('div', 'mt-day');
        row.append(el('b', '', cap(fDay.format(D(date)))), el('span', x.minutes || x.posted ? '' : 'm',
          (x.minutes ? hm(x.minutes) : 'Pas de shift') + (x.posted ? ' · ✓ ' + (x.post || 'posté') : x.post ? ' · ' + x.post : '')));
        if (x.feedback) row.append(el('div', 'fb', (x.feedbackBy || 'Direction') + ' : ' + x.feedback));
        list.append(row);
      }
      card.append(list);
      return card;
    }));
  }

  function goalRows(s, m) {
    const { GOALS, reached } = window.MR;
    return GOALS.filter((g) => m.goals[g.k] != null).map((g) => ({ name: g.name, ok: reached(m.goals, m.actual, g.k), actual: goalFmt(g.k, m.actual[g.k]), goal: goalFmt(g.k, m.goals[g.k]) }));
  }
  function renderGoals() {
    const { DATA } = S;
    const m0 = curMonthEntry(DATA.stores[0]);
    $('#mt-goals-title').textContent = m0 ? 'Objectifs ' + window.MR.of(m0.month) : 'Objectifs du mois';
    $('#mt-goals').replaceChildren(...DATA.stores.map((s) => {
      const card = el('section', 'mt-card'); card.append(storeHead(s));
      const m = curMonthEntry(s);
      if (!m) { card.append(el('p', 'mt-top', 'Pas encore d\'objectifs.')); return card; }
      const n = window.MR.starsOf(m);
      const head = el('div', 'mt-top'); head.append(window.MR.starsEl(n, 'sm'), ' ' + n + '/5 au ' + fShort.format(D(m.through)));
      card.append(head);
      for (const g of goalRows(s, m)) {
        const row = el('div', 'mt-goal' + (g.ok ? ' ok' : ''));
        row.append(el('span', '', (g.ok ? '★ ' : '☆ ') + g.name), el('span', '', g.actual + ' / ' + g.goal)); card.append(row);
      }
      return card;
    }));
  }

  // ---------- actions ----------
  function renderActions() {
    const { r, isDir } = S;
    $('#mt-add').hidden = !isDir;
    if (!r.actions.length) { $('#mt-actions').replaceChildren(el('p', 'empty', isDir ? 'Aucune action pour l\'instant. Ajoute les décisions prises en réunion.' : 'Aucune action pour l\'instant.')); return; }
    $('#mt-actions').replaceChildren(...r.actions.map((a) => {
      const row = el('div', 'mt-act' + (a.done ? ' done' : ''));
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = a.done; cb.disabled = !isDir && a.owner !== 'cm';
      cb.setAttribute('aria-label', 'Fait : ' + a.text);
      cb.addEventListener('change', async () => { try { await window.App.api('/api/meeting', { action: 'update', id: a.id, done: cb.checked }); open(); } catch (x) { window.App.toast(x.message); cb.checked = !cb.checked; } });
      const t = el('div', 't');
      t.append(el('span', '', a.text), el('small', '', 'Pour ' + (a.owner === 'cm' ? 'le CM' : 'la direction') + (a.store ? ' · ' + SHORT[a.store] : '') + ' · ' + a.createdBy + ', ' + fShort.format(new Date(a.createdAt)) + (a.done ? ' · fait' + (a.doneBy ? ' par ' + a.doneBy : '') : '')));
      row.append(cb, t);
      if (isDir) {
        const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Supprimer l\'action');
        x.addEventListener('click', async () => { if (!confirm('Supprimer cette action ?')) return; try { await window.App.api('/api/meeting', { action: 'delete', id: a.id }); open(); } catch (e) { window.App.toast(e.message); } });
        row.append(x);
      }
      return row;
    }));
  }
  $('#mt-add').addEventListener('click', () => window.App.openSheet({
    title: 'Nouvelle action',
    fields: [['text', 'Action décidée', 'textarea'], ['owner', 'Pour', 'select', [['cm', 'Le community manager'], ['direction', 'La direction']]], ['store', 'Magasin', 'select', [['', 'Les deux'], ['cessole', 'Intermarché Cessole'], ['netto', 'Netto Temple']]]],
    okLabel: 'Ajouter',
    submit: async (v) => { await window.App.api('/api/meeting', { action: 'add', text: v.text, owner: v.owner, store: v.store || null }); window.App.toast('Action ajoutée.'); open(); },
  }));

  // ---------- settings ----------
  function renderSettings() {
    const { r, isDir } = S;
    $('#mt-settings').hidden = !isDir;
    const sel = $('#mt-day');
    sel.replaceChildren(...DAYS.map((d, i) => { const o = el('option', '', cap(d)); o.value = i + 1; o.selected = i + 1 === r.meetingDay; return o; }));
  }
  $('#mt-day').addEventListener('change', async (e) => {
    try { await window.App.api('/api/meeting', { action: 'day', day: +e.target.value }); window.App.toast('Réunion le ' + DAYS[e.target.value - 1] + '. Pense à décaler la mise à jour automatique sur ce jour.'); open(); }
    catch (x) { window.App.toast(x.message); }
  });

  // ---------- monthly reports ----------
  function renderReports() {
    const { DATA } = S;
    const months = Object.keys(DATA.reports || {}).sort().reverse();
    if (!months.length) { $('#mt-reports').replaceChildren(el('p', 'empty', 'Le premier rapport sera créé à la clôture du mois.')); return; }
    $('#mt-reports').replaceChildren(...months.map((m) => {
      const b = el('button', 'mt-rep'); b.type = 'button';
      const stars = DATA.stores.map((s) => { const e = (s.months || []).find((x) => x.month === m); return (SHORT[s.id] || s.name).split(' ')[0] + ' ' + (e && e.goals ? window.MR.starsOf(e) + '/5' : '—'); }).join(' · ');
      b.append(el('span', '', 'Rapport ' + window.MR.of(m) + ' ' + m.slice(0, 4)), el('small', '', stars));
      b.addEventListener('click', () => showReport(m));
      return b;
    }));
  }

  async function monthWork(m) {
    try { return (await window.App.api('/api/meeting?' + new URLSearchParams({ from: m + '-01', to: monthEnd(m) }))).work; } catch (e) { return []; }
  }
  function reportData(m, work) {
    const { DATA } = S;
    const rep = DATA.reports[m];
    return DATA.stores.map((s) => {
      const e = (s.months || []).find((x) => x.month === m);
      const r = rep.stores[s.id] || { topPosts: [], summary: [], priorities: [] };
      return { s, e, r, stars: e && e.goals ? window.MR.starsOf(e) : null, goals: e && e.goals ? goalRows(s, e) : [] };
    }).concat([{ work }]);
  }
  async function showReport(m) {
    const work = await monthWork(m);
    const parts = reportData(m, work); const w = parts.pop().work.filter((x) => x.minutes || x.postedDays);
    const body = $('#rv-body'); body.replaceChildren();
    body.append(el('h1', '', 'Rapport ' + window.MR.of(m) + ' ' + m.slice(0, 4)), el('p', 'note', 'Réseaux sociaux d\'Intermarché Cessole et de Netto Temple · source : Instagram Insights'));
    for (const p of parts) {
      const box = el('section', 'rv-store');
      const h = el('h2'); h.append(SHORT[p.s.id] + ' · ', p.stars == null ? 'pas de note' : '★'.repeat(p.stars) + '☆'.repeat(5 - p.stars) + ' (' + p.stars + '/5)'); box.append(h);
      if (p.goals.length) {
        const t = el('table', 'rv-table'); const hd = el('tr'); ['Objectif', 'Réalisé', 'Visé', ''].forEach((x, i) => hd.append(el('th', i && i < 3 ? 'n' : '', x))); t.append(hd);
        for (const g of p.goals) { const tr = el('tr'); tr.append(el('td', '', g.name), el('td', 'n', g.actual), el('td', 'n', g.goal), el('td', g.ok ? 'ok' : 'ko', g.ok ? 'Atteint' : 'Manqué')); t.append(tr); }
        box.append(t);
      }
      if (p.r.summary.length) { box.append(el('h3', '', 'Ce qu\'il faut retenir')); const ul = el('ul'); p.r.summary.forEach((x) => ul.append(el('li', '', x))); box.append(ul); }
      if (p.r.topPosts.length) { box.append(el('h3', '', 'Meilleurs posts du mois')); const ol = el('ol'); p.r.topPosts.forEach((x) => ol.append(el('li', '', x.title + ' · ' + x.format + ' · ' + int(x.views) + ' vues'))); box.append(ol); }
      if (p.r.priorities.length) { box.append(el('h3', '', 'Priorités du mois suivant')); const ul = el('ul'); p.r.priorities.forEach((x) => ul.append(el('li', '', x))); box.append(ul); }
      body.append(box);
    }
    const cm = el('section', 'rv-store'); cm.append(el('h2', '', 'Travail du community manager'));
    if (!w.length) cm.append(el('p', 'note', 'Aucune donnée de planning pour ce mois.'));
    for (const x of w) cm.append(el('p', '', x.cm.firstName + (x.cm.removed ? ' (ancien compte)' : '') + ' : ' + hm(x.minutes) + ' sur ' + x.shifts + ' shift' + (x.shifts > 1 ? 's' : '') + ', ' + x.postedDays + ' jours avec post, ' + x.feedbacks + ' retour' + (x.feedbacks > 1 ? 's' : '') + ' de la direction.'));
    body.append(cm);
    const rv = $('#report-view'); if (rv.parentElement !== document.body) document.body.append(rv);
    rv.hidden = false; rv.scrollTop = 0;
  }
  $('#rv-close').addEventListener('click', () => { $('#report-view').hidden = true; });
  $('#rv-print').addEventListener('click', () => window.print());

  // ---------- PowerPoint ----------
  function loadPptx() {
    if (window.PptxGenJS) return Promise.resolve();
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/assets/vendor/pptxgen.bundle.js'; s.onload = ok; s.onerror = () => ko(new Error('Impossible de charger le générateur')); document.head.append(s); });
  }
  $('#mt-ppt').addEventListener('click', async () => {
    const b = $('#mt-ppt'); b.disabled = true; const label = b.textContent; b.textContent = 'Préparation de la présentation…';
    try { await loadPptx(); await buildPpt(); window.App.toast('Présentation téléchargée.'); }
    catch (x) { window.App.toast('Erreur : ' + x.message); }
    b.disabled = false; b.textContent = label;
  });

  async function buildPpt() {
    const { DATA, wk, r, meeting, monthly } = S;
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
    pptx.title = 'Réunion réseaux sociaux du ' + meeting;
    pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Calibri' };
    const INK = '16191F', MUTED = '5D6573', BG = 'F4F5F7', LINE = 'DDE0E6', GOOD = '1B7A46', BAD = 'B3261E', W = 13.333, M = 0.6;
    const range = 'Semaine du ' + fShort.format(D(wk.cur.start)) + ' au ' + fShort.format(D(wk.cur.end));
    pptx.defineSlideMaster({
      title: 'CONTENU', background: { color: 'FFFFFF' },
      objects: [{ text: { text: 'Mes Réseaux · ' + range + ' · source : Instagram Insights', options: { x: M, y: 7.0, w: 10, h: 0.3, fontSize: 10, color: MUTED, margin: 0 } } }],
      slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: MUTED, align: 'right' },
    });
    const slide = (title) => { const s = pptx.addSlide({ masterName: 'CONTENU' }); s.addText(title, { x: M, y: 0.35, w: W - 2 * M, h: 0.8, fontSize: 30, bold: true, color: INK, fontFace: 'Arial', margin: 0, valign: 'middle' }); return s; };
    const card = (s, x, y, w, h) => s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: BG }, line: { type: 'none' } });
    const chip = (s, id, x, y, w) => s.addText(SHORT[id], { shape: pptx.shapes.ROUNDED_RECTANGLE, rectRadius: 0.5, x, y, w: w || 2.8, h: 0.42, fill: { color: COLOR[id] }, color: 'FFFFFF', fontSize: 14, bold: true, align: 'center', valign: 'middle', margin: 0 });
    const stat = (s, x, y, w, v, l, sub, subColor) => {
      s.addText(v, { x, y, w, h: 0.7, fontSize: 32, bold: true, color: INK, fontFace: 'Arial', margin: 0, valign: 'bottom' });
      s.addText(l, { x, y: y + 0.72, w, h: 0.32, fontSize: 13, color: INK, margin: 0 });
      if (sub) s.addText(sub, { x, y: y + 1.02, w, h: 0.3, fontSize: 11.5, bold: !!subColor, color: subColor || MUTED, margin: 0 });
    };

    // 1. title
    const t = pptx.addSlide(); t.background = { color: INK };
    t.addText('Point réseaux sociaux', { x: M, y: 2.0, w: 12, h: 1.2, fontSize: 48, bold: true, color: 'FFFFFF', fontFace: 'Arial', margin: 0 });
    t.addText(cap(fFull.format(D(meeting))) + ' · ' + range.toLowerCase(), { x: M, y: 3.25, w: 12, h: 0.6, fontSize: 20, color: 'D9DCE3', margin: 0 });
    if (monthly) t.addText('Avec le rapport ' + window.MR.of(monthly) + ' ' + monthly.slice(0, 4), { x: M, y: 3.85, w: 12, h: 0.5, fontSize: 16, color: 'D9DCE3', italic: true, margin: 0 });
    DATA.stores.forEach((s, i) => chip(t, s.id, M + i * 3.0, 4.8));

    // 2. the week at a glance
    const s2 = slide('La semaine en un coup d\'œil');
    const cw = (W - 2 * M - 0.4) / 2;
    DATA.stores.forEach((s, i) => {
      const x = M + i * (cw + 0.4), c = wk.cur.stores[s.id], p = wk.prev && wk.prev.stores[s.id];
      card(s2, x, 1.4, cw, 5.3); chip(s2, s.id, x + 0.3, 1.65);
      const up = p && c.views >= p.views;
      stat(s2, x + 0.3, 2.3, 1.9, int(c.views), 'vues', p ? pct(c.views, p.views) + ' vs sem. préc.' : '', p ? (up ? GOOD : BAD) : null);
      stat(s2, x + 2.3, 2.3, 1.9, c.followersGained == null ? '—' : '+' + int(c.followersGained), 'nouveaux abonnés', int(c.followers) + ' au total');
      stat(s2, x + 4.3, 2.3, 1.6, int(c.posts), 'publications', p ? p.posts + ' la semaine d\'avant' : '');
      s2.addText([{ text: 'Meilleur post de la semaine', options: { bold: true, breakLine: true, fontSize: 13, color: MUTED } }, { text: c.topPost ? c.topPost.title + ' · ' + c.topPost.format + ' · ' + int(c.topPost.views) + ' vues' : 'Aucune publication cette semaine', options: { fontSize: 16, color: INK } }],
        { x: x + 0.3, y: 4.05, w: cw - 0.6, h: 1.0, margin: 0, valign: 'top' });
      s2.addText([{ text: 'Ce qu\'il faut retenir', options: { bold: true, breakLine: true, fontSize: 13, color: MUTED } }].concat((s.summary || []).slice(0, 2).map((x, j, a) => ({ text: x, options: { bullet: true, fontSize: 13, color: INK, breakLine: j < a.length - 1 } }))),
        { x: x + 0.3, y: 5.05, w: cw - 0.6, h: 1.55, margin: 0, valign: 'top', paraSpaceAfter: 3 });
    });

    // 3–4. each store: week-by-week views + this week's posts
    for (const s of DATA.stores) {
      const sl = slide(SHORT[s.id] + ' : semaine par semaine');
      const weeks = wk.list.slice(-8);
      sl.addChart(pptx.charts.BAR, [{ name: 'Vues', labels: weeks.map((w) => fShort.format(D(w.end))), values: weeks.map((w) => (w.stores[s.id] || {}).views || 0) }], {
        x: M, y: 1.3, w: 7.2, h: 5.4, chartColors: [COLOR[s.id]], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: INK, dataLabelFormatCode: '#,##0',
        valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, catAxisLabelColor: MUTED, catAxisLabelFontSize: 11, showLegend: false,
        showTitle: true, title: 'Vues par semaine (semaine finissant le jour indiqué)', titleFontSize: 13, titleColor: INK,
      });
      const posts = (s.posts || []).filter((p) => p.time.slice(0, 10) >= wk.cur.start && p.time.slice(0, 10) <= wk.cur.end).sort((a, b) => b.views - a.views);
      card(sl, 8.2, 1.4, W - M - 8.2, 5.3);
      sl.addText('Publications de la semaine', { x: 8.45, y: 1.55, w: 4, h: 0.4, fontSize: 15, bold: true, color: INK, margin: 0 });
      if (!posts.length) sl.addText('Aucune publication cette semaine.', { x: 8.45, y: 2.05, w: 4, h: 0.4, fontSize: 13, color: MUTED, margin: 0 });
      posts.slice(0, 5).forEach((p, j) => sl.addText([
        { text: p.title, options: { bold: true, fontSize: 13, color: INK, breakLine: true } },
        { text: p.format + ' · ' + int(p.views) + ' vues · ' + int(p.interactions) + ' réactions' + (p.shares ? ' · ' + p.shares + ' partages' : '') + (p.watch != null ? ' · ' + String(p.watch).replace('.', ',') + ' s vus' : ''), options: { fontSize: 11.5, color: MUTED } },
      ], { x: 8.45, y: 2.05 + j * 0.9, w: W - M - 8.7, h: 0.8, margin: 0, valign: 'top' }));
    }

    // 5. CM work
    const s5 = slide('Travail du community manager');
    if (!r.work.length) s5.addText('Aucun community manager inscrit pour cette semaine.', { x: M, y: 1.5, w: 10, h: 0.5, fontSize: 16, color: MUTED, margin: 0 });
    const w0 = r.work[0];
    if (w0) {
      card(s5, M, 1.35, 3.3, 5.35);
      s5.addText(w0.cm.firstName, { x: M + 0.3, y: 1.55, w: 2.8, h: 0.45, fontSize: 18, bold: true, color: INK, margin: 0 });
      stat(s5, M + 0.3, 2.1, 2.8, hm(w0.minutes), 'de travail', w0.shifts + ' shift' + (w0.shifts > 1 ? 's' : ''));
      stat(s5, M + 0.3, 3.6, 2.8, w0.postedDays + '/7', 'jours avec un post', '');
      stat(s5, M + 0.3, 5.0, 2.8, String(w0.feedbacks), 'retours de la direction', '');
      const rows = [[{ text: 'Jour', options: { bold: true } }, { text: 'Heures', options: { bold: true, align: 'right' } }, { text: 'Post publié', options: { bold: true } }, { text: 'Retour de la direction', options: { bold: true } }]];
      for (let i = 0; i < 7; i++) {
        const date = addDays(wk.cur.start, i), x = w0.days.find((y) => y.date === date) || { minutes: 0 };
        rows.push([cap(fDay.format(D(date))), { text: x.minutes ? hm(x.minutes) : '—', options: { align: 'right' } }, x.posted ? '✓ ' + (x.post || 'posté') : (x.post || '—'), x.feedback || '']);
      }
      s5.addTable(rows, { x: 4.2, y: 1.4, w: W - M - 4.2, colW: [1.2, 1.0, 3.0, W - M - 4.2 - 5.2], fontSize: 12, color: INK, border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: 'FFFFFF' }, rowH: 0.55, valign: 'middle' });
    }

    // 6. monthly goals
    const m0 = curMonthEntry(DATA.stores[0]);
    const s6 = slide('Objectifs ' + (m0 ? window.MR.of(m0.month) : 'du mois') + ' : où en est-on ?');
    DATA.stores.forEach((s, i) => {
      const x = M + i * (cw + 0.4), m = curMonthEntry(s);
      card(s6, x, 1.4, cw, 5.3); chip(s6, s.id, x + 0.3, 1.65);
      if (!m) return;
      const n = window.MR.starsOf(m);
      s6.addText('★'.repeat(n) + '☆'.repeat(5 - n), { x: x + 3.3, y: 1.6, w: cw - 3.6, h: 0.5, fontSize: 24, color: 'F2A900', align: 'right', margin: 0 });
      const rows = [[{ text: 'Objectif', options: { bold: true } }, { text: 'Réalisé', options: { bold: true, align: 'right' } }, { text: 'Visé', options: { bold: true, align: 'right' } }]];
      for (const g of goalRows(s, m)) rows.push([{ text: (g.ok ? '★ ' : '☆ ') + g.name, options: { color: g.ok ? GOOD : INK, bold: g.ok } }, { text: g.actual, options: { align: 'right' } }, { text: g.goal, options: { align: 'right' } }]);
      s6.addTable(rows, { x: x + 0.3, y: 2.35, w: cw - 0.6, colW: [cw - 0.6 - 2.6, 1.3, 1.3], fontSize: 13, color: INK, border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: 'FFFFFF' }, rowH: 0.5 });
      s6.addText(sentence('Chiffres du 1er au ' + fShort.format(D(m.through))), { x: x + 0.3, y: 6.15, w: cw - 0.6, h: 0.35, fontSize: 11.5, color: MUTED, margin: 0 });
    });

    // 7–8. monthly report, the first meeting of the month
    if (monthly) {
      const work = await monthWork(monthly);
      const parts = reportData(monthly, work); const mw = parts.pop().work.filter((x) => x.minutes || x.postedDays);
      const s7 = slide('Rapport ' + window.MR.of(monthly) + ' : la note finale');
      parts.forEach((p, i) => {
        const x = M + i * (cw + 0.4);
        card(s7, x, 1.4, cw, 5.3); chip(s7, p.s.id, x + 0.3, 1.65);
        if (p.stars != null) s7.addText('★'.repeat(p.stars) + '☆'.repeat(5 - p.stars), { x: x + 3.3, y: 1.6, w: cw - 3.6, h: 0.5, fontSize: 24, color: 'F2A900', align: 'right', margin: 0 });
        const rows = [[{ text: 'Objectif', options: { bold: true } }, { text: 'Réalisé', options: { bold: true, align: 'right' } }, { text: 'Visé', options: { bold: true, align: 'right' } }]];
        for (const g of p.goals) rows.push([{ text: (g.ok ? '★ ' : '☆ ') + g.name, options: { color: g.ok ? GOOD : BAD, bold: g.ok } }, { text: g.actual, options: { align: 'right' } }, { text: g.goal, options: { align: 'right' } }]);
        s7.addTable(rows, { x: x + 0.3, y: 2.35, w: cw - 0.6, colW: [cw - 0.6 - 2.6, 1.3, 1.3], fontSize: 13, color: INK, border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: 'FFFFFF' }, rowH: 0.48 });
        if (p.r.summary.length) s7.addText(p.r.summary[0], { x: x + 0.3, y: 5.5, w: cw - 0.6, h: 1.0, fontSize: 12.5, color: INK, margin: 0, valign: 'top' });
      });
      const s8 = slide('Rapport ' + window.MR.of(monthly) + ' : meilleurs posts et priorités');
      parts.forEach((p, i) => {
        const x = M + i * (cw + 0.4);
        card(s8, x, 1.4, cw, 4.6); chip(s8, p.s.id, x + 0.3, 1.65);
        const runs = [{ text: 'Meilleurs posts', options: { bold: true, fontSize: 13, color: MUTED, breakLine: true } }]
          .concat(p.r.topPosts.map((tp) => ({ text: tp.title + ' · ' + int(tp.views) + ' vues', options: { bullet: { type: 'number' }, fontSize: 13, color: INK, breakLine: true } })))
          .concat([{ text: ' ', options: { fontSize: 6, breakLine: true } }, { text: 'Priorités du mois', options: { bold: true, fontSize: 13, color: MUTED, breakLine: true } }])
          .concat(p.r.priorities.map((x2, j, a) => ({ text: x2, options: { bullet: true, fontSize: 13, color: INK, breakLine: j < a.length - 1 } })));
        s8.addText(runs, { x: x + 0.3, y: 2.25, w: cw - 0.6, h: 3.6, margin: 0, valign: 'top', paraSpaceAfter: 3 });
      });
      const line = mw.length ? mw.map((x) => x.cm.firstName + (x.cm.removed ? ' (ancien compte)' : '') + ' : ' + hm(x.minutes) + ' sur ' + x.shifts + ' shifts, ' + x.postedDays + ' jours avec post').join(' · ') : 'Aucune donnée de planning pour ce mois.';
      s8.addText([{ text: 'Travail du CM sur le mois : ', options: { bold: true } }, { text: line }], { x: M, y: 6.2, w: W - 2 * M, h: 0.5, fontSize: 13, color: INK, margin: 0 });
    }

    // last. actions
    const s9 = slide('Actions');
    const acts = r.actions.slice(0, 12);
    const arows = [[{ text: 'Action', options: { bold: true } }, { text: 'Pour', options: { bold: true } }, { text: 'Statut', options: { bold: true } }]];
    for (const a of acts) arows.push([a.text + (a.store ? ' (' + SHORT[a.store] + ')' : ''), a.owner === 'cm' ? 'Community manager' : 'Direction', { text: a.done ? '✓ Fait' : 'À faire', options: { color: a.done ? GOOD : BAD, bold: true } }]);
    if (acts.length) s9.addTable(arows, { x: M, y: 1.4, w: W - 2 * M, colW: [W - 2 * M - 4.4, 2.6, 1.8], fontSize: 13, color: INK, border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: 'FFFFFF' }, rowH: 0.45, autoPage: true });
    else s9.addText('Aucune action enregistrée. Notez les décisions de la réunion dans l\'appli (onglet Réunion).', { x: M, y: 1.5, w: W - 2 * M, h: 0.5, fontSize: 15, color: MUTED, margin: 0 });
    s9.addText('Nouvelles décisions : à ajouter dans l\'appli pendant la réunion (onglet Réunion → Actions).', { x: M, y: 6.35, w: W - 2 * M, h: 0.4, fontSize: 12, italic: true, color: MUTED, margin: 0 });

    await pptx.writeFile({ fileName: 'Reunion reseaux ' + meeting + '.pptx' });
  }

  window.Meeting = { open };
})();
