// Sanity check for data.json, run by the weekly update before committing: `node scripts/check-data.js`.
const fs = require('fs');
const path = require('path');

const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };
let d;
try { d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8')); }
catch (e) { console.error('data.json illisible : ' + e.message); process.exit(1); }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
need(DATE.test(d.updated), '`updated` doit être une date AAAA-MM-JJ');
need(d.period && DATE.test(d.period.start) && DATE.test(d.period.end), '`period.start` et `period.end` doivent être des dates');
need(Array.isArray(d.stores) && d.stores.length === 2, '`stores` doit contenir les 2 magasins');
for (const s of d.stores || []) {
  const at = (k) => `${s.id || '?'} : ${k}`;
  ['id', 'name', 'handle', 'place', 'brand'].forEach((k) => need(typeof s[k] === 'string' && s[k], at(k) + ' manquant'));
  need(Number.isFinite(s.followers), at('followers doit être un nombre'));
  need(s.compare && ['views', 'viewsPrev', 'engaged', 'engagedPrev'].every((k) => Number.isFinite(s.compare[k])), at('compare incomplet'));
  need(Array.isArray(s.daily) && s.daily.length >= 28 && s.daily.every((x) => DATE.test(x.date) && Number.isFinite(x.views)), at('daily incomplet (une ligne par jour avec date et views)'));
  need(Array.isArray(s.posts) && s.posts.every((p) => p.id && p.time && p.format && Number.isFinite(p.views)), at('posts incomplet'));
  need(Array.isArray(s.summary) && s.summary.length > 0, at('summary vide'));
  need(Array.isArray(s.recos) && s.recos.every((r) => Array.isArray(r) && r.length === 2), at('recos : paires [titre, explication] attendues'));
  need(Array.isArray(s.months) && s.months.length > 0, at('months manquant'));
  for (const m of s.months || []) {
    need(/^\d{4}-\d{2}$/.test(m.month) && ['reference', 'in_progress', 'final'].includes(m.status) && DATE.test(m.through), at('months ' + m.month + ' : month/status/through invalides'));
    need(m.actual && typeof m.actual === 'object', at('months ' + m.month + ' : actual manquant'));
    if (m.goals) need(Object.values(m.goals).every(Number.isFinite), at('months ' + m.month + ' : goals doit ne contenir que des nombres'));
  }
}
if (problems.length) { console.error('data.json : ' + problems.length + ' problème(s)\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('data.json OK');
