// GET: who is signed in. POST {action}: 'login', 'register' (first connection with an invitation code), 'logout'.
const crypto = require('crypto');
const { redis, err, fail, jsonBody, roleForInvite, normName, cleanName, checkCode, setCode, getUser, saveUser, publicUser, startSession, endSession, currentUser } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const u = await currentUser(req);
      if (!u) return res.status(401).json({ ok: false });
      return res.json({ ok: true, user: publicUser(u) });
    }
    if (req.method !== 'POST') throw err(405, 'Méthode non permise');
    const b = await jsonBody(req);

    if (b.action === 'logout') { await endSession(req, res); return res.json({ ok: true }); }

    const firstName = cleanName(b.firstName), key = normName(b.firstName);
    if (!key) throw err(400, 'Indique ton prénom');

    // Slow down code guessing: 8 tries per first name every 15 minutes.
    const rl = 'rl:' + key;
    const tries = await redis('INCR', rl);
    if (tries === 1) await redis('EXPIRE', rl, 900);
    if (tries > 8) throw err(429, 'Trop d\'essais. Réessaie dans 15 minutes.');

    if (b.action === 'login') {
      const u = await getUser(await redis('GET', 'uname:' + key));
      if (!u || !checkCode(b.code, u)) throw err(401, 'Prénom ou code incorrect');
      await redis('DEL', rl);
      await startSession(res, u);
      return res.json({ ok: true, user: publicUser(u) });
    }

    if (b.action === 'register') {
      const role = roleForInvite(b.invite);
      if (!role) throw err(400, 'Code d\'invitation inconnu');
      if (await redis('GET', 'uname:' + key)) throw err(409, 'Ce prénom est déjà pris. Ajoute l\'initiale de ton nom (ex. « Noam C. »).');
      const u = { id: crypto.randomBytes(8).toString('hex'), firstName, role, createdAt: new Date().toISOString() };
      setCode(u, b.code);
      // SET NX: two people signing up with the same first name at once cannot both get it
      if (!(await redis('SET', 'uname:' + key, u.id, 'NX'))) throw err(409, 'Ce prénom est déjà pris.');
      await saveUser(u);
      await redis('SADD', 'users', u.id);
      await redis('DEL', rl);
      await startSession(res, u);
      return res.json({ ok: true, user: publicUser(u) });
    }
    throw err(400, 'Action inconnue');
  } catch (e) { fail(res, e); }
};
