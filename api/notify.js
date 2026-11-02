// Daily cron (vercel.json): announce the statistics if a new update was deployed and not announced yet.
const { fail } = require('./_lib');
const { announceIfNew } = require('./_announce');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ ok: false });
  try { res.json({ ok: true, ...(await announceIfNew()) }); } catch (e) { fail(res, e); }
};
