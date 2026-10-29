// Weekly cron (vercel.json): once the Monday update is deployed, notify every subscribed device.
// data.json is bundled with each deployment, so it is the version the site is showing.
const DATA = require('../data.json');
const { redis, push, fail } = require('./_lib');

const nf = new Intl.NumberFormat('fr-FR');
const pct = (a, b) => (b ? (a >= b ? '+' : '−') + nf.format(Math.round(Math.abs(a / b - 1) * 100)) + ' %' : '');
const short = (name) => name.replace(/^Intermarché /, '').replace(/ Temple$/, '');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ ok: false });
  try {
    const ageDays = (Date.now() - new Date(DATA.updated + 'T12:00:00Z').getTime()) / 864e5;
    if (ageDays > 3) return res.json({ ok: true, sent: 0, reason: 'pas de mise à jour récente (' + DATA.updated + ')' });
    if ((await redis('GET', 'last_sent')) === DATA.updated) return res.json({ ok: true, sent: 0, reason: 'déjà envoyé' });

    const body = DATA.stores.map((s) => short(s.name) + ' : ' + nf.format(s.compare.views) + ' vues (' + pct(s.compare.views, s.compare.viewsPrev) + ')').join(' · ');
    const payload = JSON.stringify({ title: 'Les chiffres de la semaine sont là', body, url: '/' });

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
    res.json({ ok: true, sent, of: subs.length });
  } catch (e) { fail(res, e); }
};
