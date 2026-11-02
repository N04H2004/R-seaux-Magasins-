// GET: the Instagram statistics, for signed-in users only. data.json is bundled with each deployment.
const DATA = require('../data.json');
const { fail, requireUser } = require('./_lib');
const { announceIfNew } = require('./_announce');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await requireUser(req);
    // the first app opening after a new update sends the notification to every phone
    try { await announceIfNew(); } catch (e) { console.error('announce', e.message); }
    res.json(DATA);
  } catch (e) { fail(res, e); }
};
