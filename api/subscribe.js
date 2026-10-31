// POST: remember this device's push subscription for the signed-in user. DELETE: forget it.
const { redis, validSub, jsonBody, fail, requireUser } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const me = await requireUser(req);
    const { subscription } = await jsonBody(req);
    if (!validSub(subscription)) return res.status(400).json({ ok: false, error: 'Abonnement invalide' });
    const s = JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys, user: me.id });
    if (req.method === 'POST') { await redis('HSET', 'subs', subscription.endpoint, s); await redis('SADD', 'usubs:' + me.id, subscription.endpoint); }
    else if (req.method === 'DELETE') { await redis('HDEL', 'subs', subscription.endpoint); await redis('SREM', 'usubs:' + me.id, subscription.endpoint); }
    else return res.status(405).json({ ok: false });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
};
