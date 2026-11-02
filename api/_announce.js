// Announce new statistics to every subscribed phone, once per data update.
// Called by the daily cron (api/notify.js) and whenever a signed-in user loads the data (api/data.js),
// so a new data.json is announced as soon as it is deployed and someone opens the app, or at the next cron run.
const DATA = require('../data.json');
const { redis, push } = require('./_lib');

const nf = new Intl.NumberFormat('fr-FR');
const pct = (a, b) => (b ? (a >= b ? '+' : '−') + nf.format(Math.round(Math.abs(a / b - 1) * 100)) + ' %' : '');
const short = (name) => name.replace(/^Intermarché /, '').replace(/ Temple$/, '');

function message() {
  // Monthly grade (same rule as the page): one star per goal the month has and reached; watch time needs a Reel.
  const KEYS = ['posts', 'views', 'engaged', 'topReel', 'followers', 'watch'];
  const grade = (s) => {
    const m = (s.months || []).filter((x) => x.goals).pop();
    if (!m) return null;
    const n = KEYS.filter((k) => m.goals[k] != null && m.actual[k] != null && m.actual[k] >= m.goals[k] && (k !== 'watch' || m.actual.reels > 0)).length;
    return { n, final: m.status === 'final', month: m.month };
  };
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const grades = DATA.stores.map((s) => [s, grade(s)]);
  const final = grades.some(([, g]) => g && g.final);
  const body = grades.map(([s, g]) => short(s.name) + ' ' + (g ? stars(g.n) : '') + ' · ' + nf.format(s.compare.views) + ' vues (' + pct(s.compare.views, s.compare.viewsPrev) + ')').join('\n');
  const monthName = grades[0][1] ? new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(grades[0][1].month + '-15T12:00:00Z')) : '';
  const title = final ? 'Note finale ' + (/^[ao]/.test(monthName) ? 'd\'' : 'de ') + monthName : 'Les chiffres de la semaine sont là';
  return JSON.stringify({ title, body, url: '/' });
}

async function announceIfNew() {
  const ageDays = (Date.now() - new Date(DATA.updated + 'T12:00:00Z').getTime()) / 864e5;
  if (ageDays > 3) return { sent: 0, reason: 'pas de mise à jour récente (' + DATA.updated + ')' };
  if ((await redis('GET', 'last_sent')) === DATA.updated) return { sent: 0, reason: 'déjà envoyé' };
  // only one caller sends for a given update, even if the cron and several phones arrive at once
  if (!(await redis('SET', 'announce:' + DATA.updated, '1', 'NX', 'EX', 7 * 86400))) return { sent: 0, reason: 'envoi déjà en cours' };

  try {
    const payload = message();
    // HGETALL over REST returns a flat [field, value, field, value, …] list
    const subs = ((await redis('HGETALL', 'subs')) || []).filter((_, i) => i % 2 === 1);
    const wp = push();
    let sent = 0;
    for (const raw of subs) {
      const sub = JSON.parse(raw);
      try { await wp.sendNotification(sub, payload); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await redis('HDEL', 'subs', sub.endpoint); }
    }
    await redis('SET', 'last_sent', DATA.updated);
    return { sent, of: subs.length };
  } catch (e) {
    await redis('DEL', 'announce:' + DATA.updated); // let the next caller try again
    throw e;
  }
}

module.exports = { announceIfNew };
