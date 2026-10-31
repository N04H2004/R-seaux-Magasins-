// The community manager's timesheet.
// GET ?cm=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD → shifts in that range (a CM only ever sees their own).
// POST {action}: 'save' (create or edit), 'delete', 'respond' (CM accepts or declines a shift the direction proposed).
// Status: 'confirmed' (in the timesheet), 'proposed' (by the direction, waiting for the CM), 'declined'.
// A CM can change a week until Sunday 23:59 Paris time; the direction can change anything at any time.
const crypto = require('crypto');
const { redis, err, fail, jsonBody, allUsers, publicUser, requireUser, parisNow, weekLocked, notifyUsers } = require('./_lib');

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const dLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const when = (s) => dLong.format(new Date(s.date + 'T12:00:00Z')) + ' de ' + s.start.replace(':', ' h ') + ' à ' + s.end.replace(':', ' h ');

async function loadShift(cmId, id) {
  const raw = await redis('HGET', 'shifts:' + cmId, id);
  return raw ? JSON.parse(raw) : null;
}
const store = (s) => redis('HSET', 'shifts:' + s.cm, s.id, JSON.stringify(s));

// Which CM the request is about: yourself if you are one; for the direction, the one asked for or the only one.
async function targetCm(me, asked) {
  if (me.role === 'cm') return me;
  const cms = (await allUsers()).filter((u) => u.role === 'cm');
  const cm = asked ? cms.find((u) => u.id === asked) : cms[0];
  if (!cm) throw err(404, 'Aucun community manager inscrit pour l\'instant');
  return cm;
}

function readFields(b) {
  const f = { date: String(b.date || ''), start: String(b.start || ''), end: String(b.end || ''), note: String(b.note || '').trim().slice(0, 1000) };
  if (!DATE.test(f.date) || isNaN(new Date(f.date + 'T12:00:00Z'))) throw err(400, 'Date invalide');
  if (!TIME.test(f.start) || !TIME.test(f.end)) throw err(400, 'Heures invalides');
  if (f.end <= f.start) throw err(400, 'L\'heure de fin doit être après l\'heure de début');
  return f;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const me = await requireUser(req);
    if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const cm = await targetCm(me, q.cm);
      const from = DATE.test(q.from || '') ? q.from : '0000-00-00', to = DATE.test(q.to || '') ? q.to : '9999-99-99';
      const all = Object.values(((await redis('HGETALL', 'shifts:' + cm.id)) || []).reduce((o, v, i, a) => (i % 2 ? o : { ...o, [v]: JSON.parse(a[i + 1]) }), {}));
      const shifts = all.filter((s) => s.date >= from && s.date <= to).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      // proposals still waiting, whatever the week, so the CM always sees them
      const proposals = all.filter((s) => s.status === 'proposed').sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      const cms = me.role === 'direction' ? (await allUsers()).filter((u) => u.role === 'cm').map(publicUser) : [publicUser(me)];
      return res.json({ ok: true, cm: publicUser(cm), cms, shifts, proposals, today: parisNow().date });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);
    const cm = await targetCm(me, b.cm);
    const isCm = me.role === 'cm';
    const now = new Date().toISOString();

    if (b.action === 'save') {
      const f = readFields(b);
      if (b.id) {
        const s = await loadShift(cm.id, b.id);
        if (!s) throw err(404, 'Shift introuvable');
        if (isCm) {
          if (s.status !== 'confirmed') throw err(403, 'Accepte ou refuse d\'abord ce shift proposé');
          if (weekLocked(s.date) || weekLocked(f.date)) throw err(403, 'Cette semaine est verrouillée depuis dimanche 23 h 59');
        }
        Object.assign(s, f, { updatedAt: now, updatedBy: me.id });
        // the direction reworking a declined shift sends it back to the CM as a new proposal
        const reproposed = !isCm && s.status === 'declined';
        if (reproposed) { s.status = 'proposed'; delete s.reason; }
        await store(s);
        if (reproposed) await notifyUsers([cm.id], { title: 'Shift proposé à nouveau', body: me.firstName + ' te propose ' + when(s) + (s.note ? ' : ' + s.note : '') + '.', url: '/#planning' });
        return res.json({ ok: true, shift: s });
      }
      if (isCm && weekLocked(f.date)) throw err(403, 'Cette semaine est verrouillée depuis dimanche 23 h 59');
      // a shift the CM enters goes straight into the timesheet; one from the direction waits for the CM's answer
      const s = { id: crypto.randomBytes(6).toString('hex'), cm: cm.id, ...f, status: isCm ? 'confirmed' : 'proposed', createdBy: me.id, createdAt: now };
      await store(s);
      if (!isCm) await notifyUsers([cm.id], { title: 'Nouveau shift proposé', body: me.firstName + ' te propose ' + when(s) + (s.note ? ' : ' + s.note : '') + '.', url: '/#planning' });
      return res.json({ ok: true, shift: s });
    }

    if (b.action === 'delete') {
      const s = await loadShift(cm.id, b.id);
      if (!s) throw err(404, 'Shift introuvable');
      if (isCm && (s.status === 'proposed' || weekLocked(s.date))) throw err(403, s.status === 'proposed' ? 'Refuse ce shift plutôt que de le supprimer' : 'Cette semaine est verrouillée depuis dimanche 23 h 59');
      await redis('HDEL', 'shifts:' + cm.id, s.id);
      return res.json({ ok: true });
    }

    if (b.action === 'respond') {
      if (!isCm) throw err(403, 'Seul le community manager répond à une proposition');
      const s = await loadShift(cm.id, b.id);
      if (!s || s.status !== 'proposed') throw err(404, 'Proposition introuvable');
      s.status = b.accept ? 'confirmed' : 'declined';
      s.reason = b.accept ? undefined : String(b.reason || '').trim().slice(0, 300);
      s.respondedAt = now;
      await store(s);
      const directors = (await allUsers()).filter((u) => u.role === 'direction').map((u) => u.id);
      await notifyUsers(directors, {
        title: b.accept ? 'Shift accepté' : 'Shift refusé',
        body: me.firstName + (b.accept ? ' a accepté ' : ' a refusé ') + when(s) + (s.reason ? ' : « ' + s.reason + ' »' : '') + '.',
        url: '/#planning',
      });
      return res.json({ ok: true, shift: s });
    }
    throw err(400, 'Action inconnue');
  } catch (e) { fail(res, e); }
};
