// The weekly meeting with the direction.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → meeting day, the meeting actions, and the CM work in that range
//   (hours of confirmed shifts, posts ticked, feedback), for every CM including removed ones (a CM sees only themself).
// POST {action}: 'day' {day: 1–7} sets the meeting weekday (direction);
//   'add' {text, owner: 'cm'|'direction', store} adds an action (direction);
//   'update' {id, text?, done?} edits an action (direction) or ticks it (the CM, for the actions given to the CM);
//   'delete' {id} (direction).
const crypto = require('crypto');
const { redis, err, fail, jsonBody, allUsers, publicUser, requireUser, parisNow } = require('./_lib');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const hash = async (key) => {
  const flat = (await redis('HGETALL', key)) || [];
  const out = []; for (let i = 0; i < flat.length; i += 2) out.push(JSON.parse(flat[i + 1])); return out;
};
const mins = (s) => { const [a, b] = s.start.split(':').map(Number), [c, d] = s.end.split(':').map(Number); return c * 60 + d - (a * 60 + b); };

async function cmWork(cm, from, to) {
  const shifts = (await hash('shifts:' + cm.id)).filter((s) => s.status === 'confirmed' && s.date >= from && s.date <= to);
  const days = (await hash('days:' + cm.id)).filter((x) => x.date >= from && x.date <= to);
  const byDate = {};
  for (const s of shifts) (byDate[s.date] = byDate[s.date] || { date: s.date, minutes: 0, shifts: [] }).minutes += mins(s), byDate[s.date].shifts.push({ start: s.start, end: s.end, note: s.note || '' });
  for (const x of days) Object.assign(byDate[x.date] = byDate[x.date] || { date: x.date, minutes: 0, shifts: [] }, { posted: !!x.posted, post: x.post || '', feedback: x.feedback || '', feedbackBy: x.feedbackBy || '' });
  return {
    cm: publicUser(cm),
    minutes: shifts.reduce((t, s) => t + mins(s), 0),
    shifts: shifts.length,
    postedDays: days.filter((x) => x.posted).length,
    feedbacks: days.filter((x) => x.feedback).length,
    days: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const me = await requireUser(req);
    const isDir = me.role === 'direction';
    if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const today = parisNow().date;
      const from = DATE.test(q.from || '') ? q.from : today, to = DATE.test(q.to || '') ? q.to : today;
      const cms = isDir ? (await allUsers()).filter((u) => u.role === 'cm') : [me];
      const work = [];
      for (const cm of cms) { const w = await cmWork(cm, from, to); if (!cm.removed || w.shifts || w.postedDays) work.push(w); }
      const actions = (await hash('actions')).sort((a, b) => (a.done - b.done) || b.createdAt.localeCompare(a.createdAt));
      return res.json({ ok: true, meetingDay: +(await redis('GET', 'meeting:day')) || 5, today, work, actions });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);
    const now = new Date().toISOString();
    if (b.action === 'day') {
      if (!isDir) throw err(403, 'Réservé à la direction');
      const day = +b.day;
      if (!(day >= 1 && day <= 7)) throw err(400, 'Jour invalide');
      await redis('SET', 'meeting:day', String(day));
      return res.json({ ok: true, meetingDay: day });
    }
    if (b.action === 'add') {
      if (!isDir) throw err(403, 'Réservé à la direction');
      const text = String(b.text || '').trim().slice(0, 300);
      if (!text) throw err(400, 'Écris l\'action à faire');
      const a = { id: crypto.randomBytes(6).toString('hex'), text, owner: b.owner === 'direction' ? 'direction' : 'cm', store: ['netto', 'cessole'].includes(b.store) ? b.store : null, done: false, createdAt: now, createdBy: me.firstName };
      await redis('HSET', 'actions', a.id, JSON.stringify(a));
      return res.json({ ok: true, item: a });
    }
    const raw = b.id && await redis('HGET', 'actions', b.id);
    if (!raw) throw err(404, 'Action introuvable');
    const a = JSON.parse(raw);
    if (b.action === 'update') {
      if (!isDir && (a.owner !== 'cm' || 'text' in b)) throw err(403, 'Tu peux seulement cocher les actions qui te sont confiées');
      if ('text' in b && String(b.text).trim()) a.text = String(b.text).trim().slice(0, 300);
      if ('owner' in b && isDir) a.owner = b.owner === 'direction' ? 'direction' : 'cm';
      if ('done' in b) Object.assign(a, b.done ? { done: true, doneAt: now, doneBy: me.firstName } : { done: false, doneAt: null, doneBy: null });
      await redis('HSET', 'actions', a.id, JSON.stringify(a));
      return res.json({ ok: true, item: a });
    }
    if (b.action === 'delete') {
      if (!isDir) throw err(403, 'Réservé à la direction');
      await redis('HDEL', 'actions', a.id);
      return res.json({ ok: true });
    }
    throw err(400, 'Action inconnue');
  } catch (e) { fail(res, e); }
};
