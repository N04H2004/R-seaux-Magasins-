// POST: remember this device's push subscription. DELETE: forget it.
const { redis, validSub, readBody, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const { subscription } = await readBody(req);
    if (!validSub(subscription)) return res.status(400).json({ ok: false, error: 'Abonnement invalide' });
    const s = JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys });
    if (req.method === 'POST') await redis('HSET', 'subs', subscription.endpoint, s);
    else if (req.method === 'DELETE') await redis('HDEL', 'subs', subscription.endpoint);
    else return res.status(405).json({ ok: false });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
};
