// GET: the accounts (direction only). POST {action}: 'change' my own code, 'reset' someone's code (direction only).
const { err, fail, jsonBody, checkCode, setCode, getUser, saveUser, allUsers, publicUser, requireUser } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      await requireUser(req, 'direction');
      return res.json({ ok: true, users: (await allUsers()).map(publicUser) });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);
    if (b.action === 'change') {
      const me = await requireUser(req);
      if (!checkCode(b.oldCode, me)) throw err(401, 'Ancien code incorrect');
      setCode(me, b.code); await saveUser(me);
      return res.json({ ok: true });
    }
    if (b.action === 'reset') {
      await requireUser(req, 'direction');
      const u = await getUser(b.userId);
      if (!u) throw err(404, 'Compte introuvable');
      setCode(u, b.code); await saveUser(u);
      return res.json({ ok: true });
    }
    throw err(400, 'Action inconnue');
  } catch (e) { fail(res, e); }
};
