// GET: the date of the statistics this deployment serves (public, nothing confidential).
// Lets the GitHub workflow wait until a new data.json is live before asking for the notification.
const DATA = require('../data.json');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ updated: DATA.updated });
};
