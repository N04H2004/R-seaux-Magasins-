// GET: the Instagram statistics, for signed-in users only. data.json is bundled with each deployment.
const DATA = require('../data.json');
const { fail, requireUser } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try { await requireUser(req); res.json(DATA); } catch (e) { fail(res, e); }
};
