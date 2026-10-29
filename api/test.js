// POST: send a test notification to the calling device only.
const { push, validSub, readBody, fail } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { subscription } = await readBody(req);
    if (!validSub(subscription)) return res.status(400).json({ ok: false, error: 'Abonnement invalide' });
    await push().sendNotification(subscription, JSON.stringify({
      title: 'Mes Réseaux',
      body: 'Notifications activées : tu seras prévenu chaque lundi quand les chiffres sont à jour.',
      url: '/',
    }));
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
};
