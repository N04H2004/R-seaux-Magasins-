// GET: the active accounts and the current invitation codes (direction only).
// POST 'invite' {role}: generate a new invitation code for that role (direction only); the previous one stops working. POST {action}: 'change' my own code, 'reset' someone's code (direction only),
// 'profile' {email} sets my own e-mail address (empty clears it), used for meeting invitations;
// 'remove' an account (direction only): it can no longer sign in, its first name is freed, its timesheet stays readable.
const { redis, err, fail, jsonBody, newInvite, currentInvites, normName, checkCode, setCode, getUser, saveUser, activeUsers, publicUser, requireUser, EMAIL } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      await requireUser(req, 'direction');
      return res.json({ ok: true, users: (await activeUsers()).map(publicUser), invites: await currentInvites() });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);
    if (b.action === 'change') {
      const me = await requireUser(req);
      if (!checkCode(b.oldCode, me)) throw err(401, 'Ancien code incorrect');
      setCode(me, b.code); await saveUser(me);
      return res.json({ ok: true });
    }
    if (b.action === 'profile') {
      const me = await requireUser(req);
      const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
      if (email && !EMAIL.test(email)) throw err(400, 'Adresse e-mail invalide');
      me.email = email; await saveUser(me);
      return res.json({ ok: true, user: publicUser(me) });
    }
    if (b.action === 'invite') {
      await requireUser(req, 'direction');
      return res.json({ ok: true, role: b.role, code: await newInvite(b.role) });
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
