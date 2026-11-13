// GET: the active accounts (direction only). POST {action}: 'change' my own code, 'reset' someone's code (direction only),
// 'remove' an account (direction only): it can no longer sign in, its first name is freed, its timesheet stays readable.
const { redis, err, fail, jsonBody, normName, checkCode, setCode, getUser, saveUser, activeUsers, publicUser, requireUser } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      await requireUser(req, 'direction');
      return res.json({ ok: true, users: (await activeUsers()).map(publicUser) });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);
    if (b.action === 'change') {
      const me = await requireUser(req);
      if (!checkCode(b.oldCode, me)) throw err(401, 'Ancien code incorrect');
      setCode(me, b.code); await saveUser(me);
      return res.json({ ok: true });
    }
    if (b.action === 'remove') {
      const me = await requireUser(req, 'direction');
      const u = await getUser(b.userId);
      if (!u || u.removed) throw err(404, 'Compte introuvable');
      if (u.id === me.id) throw err(400, 'Tu ne peux pas supprimer ton propre compte');
      Object.assign(u, { removed: true, removedAt: new Date().toISOString(), removedBy: me.id });
      await saveUser(u);
      await redis('DEL', 'uname:' + normName(u.firstName));
      // stop notifications to the phones that account had
      for (const ep of (await redis('SMEMBERS', 'usubs:' + u.id)) || []) await redis('HDEL', 'subs', ep);
      await redis('DEL', 'usubs:' + u.id);
      return res.json({ ok: true });
    }
    if (b.action === 'reset') {
      await requireUser(req, 'direction');
      const u = await getUser(b.userId);
      if (!u || u.removed) throw err(404, 'Compte introuvable');
      setCode(u, b.code); await saveUser(u);
      return res.json({ ok: true });
    }
    throw err(400, 'Action inconnue');
  } catch (e) { fail(res, e); }
};
