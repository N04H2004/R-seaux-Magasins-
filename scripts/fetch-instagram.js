// Fetch the two stores' Instagram statistics from the Meta Graph API and write them to scripts/out/instagram.json.
// Used by the weekly update (MISE_A_JOUR.md) in place of Supermetrics.
//
//   node scripts/fetch-instagram.js            → last 30 full days ending yesterday (Paris time)
//   node scripts/fetch-instagram.js 2026-11-02 → 30 days ending the day before that date
//
// The access token is never in this file or in the environment: the session's network proxy adds it to every
// request to graph.facebook.com (system user « mes-reseaux-stats » of the « Mes Réseaux » business portfolio).
// Requests go through curl, which follows the proxy settings; Node's own fetch does not.
// Exit code 2 = a main figure is missing (do not publish); warnings[] lists secondary data that could not be read.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API = 'https://graph.facebook.com/v27.0/';
const STORES = { netto: '17841432089005834', cessole: '17841444946262250' };
const DAY = 864e5;
const warnings = [];

function get(pathAndQuery) {
  let raw;
  try {
    raw = execFileSync('curl', ['-sS', '--max-time', '60', '--retry', '2', '-H', 'Authorization: Bearer proxy-injected', API + pathAndQuery], { encoding: 'utf8', maxBuffer: 32 << 20 });
  } catch (e) { throw new Error('réseau : ' + (e.stderr || e.message)); }
  const j = JSON.parse(raw);
  if (j.error) throw new Error(j.error.message);
  return j;
}
const tryGet = (q, what) => { try { return get(q); } catch (e) { warnings.push(what + ' : ' + e.message); return null; } };

// ---------- dates (Paris) ----------
const paris = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => iso(Date.parse(s + 'T12:00:00Z') + n * DAY);
const unix = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 1000); // day boundaries for since/until
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

const today = process.argv[2] || paris(new Date());
const end = addDays(today, -1), start = addDays(end, -29);
const prevEnd = addDays(start, -1), prevStart = addDays(prevEnd, -29);

// total_value of account metrics over [from, to] (inclusive). The API accepts at most 30 days per call:
// longer ranges are split; views add up exactly, accounts_engaged is then slightly over-counted.
function totals(id, metrics, from, to) {
  const sum = {};
  for (let a = from; a <= to; a = addDays(a, 30)) {
    const b = addDays(a, 29) < to ? addDays(a, 29) : to;
    const r = get(`${id}/insights?metric=${metrics}&period=day&metric_type=total_value&since=${unix(a)}&until=${unix(addDays(b, 1))}`);
    for (const m of r.data) sum[m.name] = (sum[m.name] || 0) + (m.total_value ? m.total_value.value : 0);
  }
  return sum;
}

// A series metric (period=day): Meta closes each day at 07:00 UTC, so a value ending on D belongs to D-1.
function series(id, metric, from, to) {
  const r = get(`${id}/insights?metric=${metric}&period=day&since=${unix(from)}&until=${unix(addDays(to, 1))}`);
  const out = {};
  for (const v of (r.data[0] || { values: [] }).values) out[addDays(v.end_time.slice(0, 10), -1)] = v.value;
  return out;
}

const FORMAT = { REELS: 'Reel', CAROUSEL_ALBUM: 'Carrousel', IMAGE: 'Photo', VIDEO: 'Vidéo' };
const parisTime = (ts) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));

function store(key, id) {
  const profile = get(`${id}?fields=username,followers_count,media_count`);

  // daily figures for the 30-day window
  const reach = series(id, 'reach', start, end);
  const newFollowers = profile.followers_count >= 100 ? (tryGet(`${id}/insights?metric=follower_count&period=day&since=${unix(start)}&until=${unix(addDays(end, 1))}`, key + ' nouveaux abonnés') || { data: [] }) : { data: [] };
  const fol = {};
  for (const v of (newFollowers.data[0] || { values: [] }).values) fol[addDays(v.end_time.slice(0, 10), -1)] = v.value;
  const daily = range(start, end).map((date) => {
    const t = totals(id, 'views,accounts_engaged', date, date);
    return { date, followers: date in fol ? fol[date] : null, reach: reach[date] || 0, views: t.views || 0, engaged: t.accounts_engaged || 0 };
  });

  const cur = totals(id, 'views,accounts_engaged', start, end), prev = totals(id, 'views,accounts_engaged', prevStart, prevEnd);
  const compare = { views: cur.views || 0, viewsPrev: prev.views || 0, engaged: cur.accounts_engaged || 0, engagedPrev: prev.accounts_engaged || 0 };

  // feed posts of about the last 70 days, with their own statistics
  const since = addDays(end, -70);
  const media = [];
  let page = `${id}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=50`;
  while (page) {
    const r = get(page);
    const recent = r.data.filter((m) => paris(new Date(m.timestamp)) >= since);
    media.push(...recent);
    page = recent.length === r.data.length && r.paging && r.paging.next ? r.paging.next.replace(API, '') : null;
  }
  const posts = media.map((m) => {
    const reel = m.media_product_type === 'REELS';
    const metrics = 'views,reach,saved,shares,total_interactions' + (reel ? ',ig_reels_avg_watch_time,reels_skip_rate' : '');
    const ins = tryGet(`${m.id}/insights?metric=${metrics}`, key + ' publication ' + m.id);
    const v = {}; if (ins) for (const x of ins.data) v[x.name] = x.values[0].value;
    return {
      id: m.id, time: parisTime(m.timestamp), format: reel ? 'Reel' : FORMAT[m.media_type] || 'Photo',
      caption: m.caption || '', title: '',
      views: v.views || 0, reach: v.reach || 0, interactions: v.total_interactions || 0,
      likes: m.like_count || 0, comments: m.comments_count || 0, saves: v.saved || 0, shares: v.shares || 0,
      link: m.permalink,
      watch: reel && v.ig_reels_avg_watch_time != null ? Math.round(v.ig_reels_avg_watch_time / 100) / 10 : null,
      skip: reel && v.reels_skip_rate != null ? Math.round(v.reels_skip_rate * 10) / 10 : null,
    };
  }).sort((a, b) => b.views - a.views);

  // audience (secondary): online hours are given in Pacific time, shifted here to Paris time
  const audience = { hours: null, ages: null, cities: null };
  const online = tryGet(`${id}/insights?metric=online_followers&period=lifetime&since=${unix(addDays(end, -6))}&until=${unix(addDays(end, 1))}`, key + ' heures de connexion');
  if (online) {
    const days = online.data[0].values.map((x) => x.value).filter((v) => v && Object.keys(v).length === 24);
    if (days.length) {
      const now = new Date();
      const shift = Math.round((Date.parse(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - Date.parse(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))) / 36e5);
      audience.hours = Array.from({ length: 24 }, (_, h) => Math.round(days.reduce((s, d) => s + d[(h - shift + 24) % 24], 0) / days.length * 10) / 10);
    } else warnings.push(key + ' heures de connexion : vides');
  }
  for (const [k, dim] of [['ages', 'age'], ['cities', 'city']]) {
    const r = tryGet(`${id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${dim}`, key + ' audience ' + dim);
    const res = r && r.data[0] && r.data[0].total_value.breakdowns ? r.data[0].total_value.breakdowns[0].results : [];
    if (!res.length) { if (r) warnings.push(key + ' audience ' + dim + ' : vide'); continue; }
    const rows = res.map((x) => [dim === 'city' ? x.dimension_values[0].split(',')[0] : x.dimension_values[0], x.value]);
    audience[k] = dim === 'age' ? rows.sort((a, b) => a[0].localeCompare(b[0])) : rows.sort((a, b) => b[1] - a[1]).slice(0, 8);
  }

  // month figures for the note du mois: the month of `end`, and the month before it (to close it if needed)
  const monthOf = (d) => d.slice(0, 7);
  const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0, 12));
  const monthActual = (m, to) => {
    const t = totals(id, 'views,accounts_engaged', m + '-01', to);
    const inMonth = posts.filter((p) => p.time.slice(0, 7) === m && p.time.slice(0, 10) <= to);
    const reels = inMonth.filter((p) => p.format === 'Reel');
    const w = reels.filter((p) => p.watch != null);
    // followers at the end of the window: today's count minus the new followers counted after it
    const after = Object.entries(fol).filter(([d]) => d > to).reduce((s, [, v]) => s + v, 0);
    return {
      posts: inMonth.length, views: t.views || 0, engaged: t.accounts_engaged || 0,
      topReel: reels.length ? Math.max(...reels.map((p) => p.views)) : null,
      followers: profile.followers_count - after,
      watch: w.length ? Math.round(w.reduce((s, p) => s + p.watch, 0) / w.length * 10) / 10 : null,
      reels: reels.length,
    };
  };
  const curMonth = monthOf(end), prevMonth = monthOf(addDays(curMonth + '-01', -1));
  const months = {
    [curMonth]: { through: end, actual: monthActual(curMonth, end) },
    [prevMonth]: { through: monthEnd(prevMonth), actual: monthActual(prevMonth, monthEnd(prevMonth)) },
  };
  if (since > prevMonth + '-01') warnings.push(key + ` : les publications avant le ${since} ne sont pas lues, posts/reels de ${prevMonth} peuvent être incomplets`);

  return { id: key, username: profile.username, followers: profile.followers_count, mediaCount: profile.media_count, daily, compare, posts, audience, months };
}

const out = { fetchedAt: new Date().toISOString(), source: 'Meta Graph API (Instagram)', period: { start, end }, prevPeriod: { start: prevStart, end: prevEnd }, stores: {}, warnings };
let failed = false;
for (const [key, id] of Object.entries(STORES)) {
  try { out.stores[key] = store(key, id); }
  catch (e) { failed = true; warnings.push(key + ' : données principales indisponibles : ' + e.message); }
}
const file = path.join(__dirname, 'out', 'instagram.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log((failed ? 'ÉCHEC' : 'OK') + ' : ' + file + ' (' + start + ' → ' + end + ')');
for (const w of warnings) console.log('- ' + w);
process.exit(failed ? 2 : 0);
