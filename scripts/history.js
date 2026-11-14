// Keeps the history that the 30-day window forgets, inside data.json:
//   weeks[]   one entry per meeting week (the 7 days ending on period.end), upserted on every update;
//   reports{} one entry per closed month (status "final"), created once with its top posts; the weekly update
//             then writes its texts (summary, priorities) — see MISE_A_JOUR.md.
//
//   node scripts/history.js              → upsert the week ending on period.end, open reports for newly closed months
//   node scripts/history.js --backfill 4 → also rebuild the 3 weeks before it from the daily figures still available
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data.json');
const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const addDays = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const n = process.argv.includes('--backfill') ? Math.max(1, +process.argv[process.argv.indexOf('--backfill') + 1] || 4) : 1;

function weekEntry(end) {
  const start = addDays(end, -6);
  const stores = {};
  for (const s of d.stores) {
    const days = s.daily.filter((x) => x.date >= start && x.date <= end);
    if (days.length < 7) return null; // the daily window no longer covers this week
    const gains = days.map((x) => x.followers);
    const after = s.daily.filter((x) => x.date > end).reduce((t, x) => t + (x.followers || 0), 0);
    const posts = s.posts.filter((p) => p.time.slice(0, 10) >= start && p.time.slice(0, 10) <= end);
    const top = posts.slice().sort((a, b) => b.views - a.views)[0];
    stores[s.id] = {
      views: days.reduce((t, x) => t + x.views, 0),
      followersGained: gains.every((g) => g == null) ? null : gains.reduce((t, g) => t + (g || 0), 0),
      followers: s.followers - after,
      posts: posts.length,
      reels: posts.filter((p) => p.format === 'Reel').length,
      topPost: top ? { id: top.id, title: top.title, format: top.format, views: top.views, link: top.link } : null,
    };
  }
  return { start, end, stores };
}

d.weeks = d.weeks || [];
for (let i = n - 1; i >= 0; i--) {
  const w = weekEntry(addDays(d.period.end, -7 * i));
  if (!w) continue;
  const at = d.weeks.findIndex((x) => x.end === w.end);
  if (at >= 0) d.weeks[at] = w; else d.weeks.push(w);
}
d.weeks.sort((a, b) => a.end.localeCompare(b.end));
d.weeks = d.weeks.slice(-104); // two years is plenty

// a report for each month that just closed, with its 3 most viewed posts (measured now)
d.reports = d.reports || {};
const opened = [];
for (const s of d.stores) {
  for (const m of s.months || []) {
    if (m.status !== 'final') continue;
    const r = d.reports[m.month] = d.reports[m.month] || { month: m.month, stores: {} };
    if (r.stores[s.id]) continue;
    const top = s.posts.filter((p) => p.time.slice(0, 7) === m.month).sort((a, b) => b.views - a.views).slice(0, 3)
      .map((p) => ({ id: p.id, title: p.title, format: p.format, views: p.views, shares: p.shares, link: p.link }));
    r.stores[s.id] = { topPosts: top, summary: [], priorities: [] };
    opened.push(m.month + ' ' + s.id);
  }
}

fs.writeFileSync(FILE, JSON.stringify(d, null, 1) + '\n');
console.log('semaines :', d.weeks.map((w) => w.start + '→' + w.end).join(', '));
console.log(opened.length ? 'rapports à rédiger (summary, priorities) : ' + opened.join(', ') : 'aucun nouveau rapport mensuel');
