// Shared helpers for the serverless functions (Vercel, Node): storage, sessions, push notifications.
const crypto = require('crypto');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = 'BH-GaURNGiBSklxn_JLmzG--vBMv1K0gPucH_-Vd9_59hnj3jsWtb1Xh0N2Ns4_3nCubwK3bzd-hT8H2foGxXvM';

// Upstash Redis over its REST API. Vercel's Upstash integration injects KV_REST_API_*.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  if (!redisUrl || !redisToken) throw Object.assign(new Error('Stockage non configuré'), { status: 503 });
  const r = await fetch(redisUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + redisToken }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const err = (status, message) => Object.assign(new Error(message), { status });

function fail(res, e) {
  res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Erreur du serveur' });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = ''; for await (const c of req) raw += c; return JSON.parse(raw || '{}');
}

// Writes must be JSON: a cross-site <form> cannot send that without a CORS preflight, so no CSRF token is needed.
async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw err(415, 'JSON attendu');
  return readBody(req);
}

// ---------- accounts ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Invitation codes decide the role. Only their hashes live here; env vars can replace them.
const INVITES = {
  direction: process.env.INVITE_DIRECTION ? sha(process.env.INVITE_DIRECTION.trim().toUpperCase()) : 'fecdbf68df4548a7b8625d937dac97d16b5f42ef9254129906e5e66cb3667fcb',
  cm: process.env.INVITE_CM ? sha(process.env.INVITE_CM.trim().toUpperCase()) : '8c79e8e0c7589816c3d537a755cf62697789cbc9f8fc9481b8dc3851e31c5b33',
};
function roleForInvite(code) {
  const h = sha(String(code || '').trim().toUpperCase());
  return Object.keys(INVITES).find((r) => INVITES[r] === h) || null;
}

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);
const hashCode = (code, salt) => crypto.scryptSync(String(code), salt, 32).toString('hex');
function checkCode(code, user) {
  const a = Buffer.from(hashCode(code, user.salt), 'hex'), b = Buffer.from(user.codeHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setCode(user, code) {
  if (String(code || '').length < 6) throw err(400, 'Le code doit faire au moins 6 caractères');
  user.salt = crypto.randomBytes(16).toString('hex');
  user.codeHash = hashCode(code, user.salt);
}

async function getUser(id) {
  const raw = id && await redis('GET', 'user:' + id);
  return raw ? JSON.parse(raw) : null;
}
const saveUser = (u) => redis('SET', 'user:' + u.id, JSON.stringify(u));
async function allUsers() {
  const ids = (await redis('SMEMBERS', 'users')) || [];
  return (await Promise.all(ids.map(getUser))).filter(Boolean);
}
const publicUser = (u) => ({ id: u.id, firstName: u.firstName, role: u.role });

// ---------- sessions: a long-lived httpOnly cookie, so a phone stays signed in ----------
const SESSION_DAYS = 365;
const COOKIE = 'mr_session';
function cookieValue(req) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : null;
}
async function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await redis('SET', 'sess:' + sha(token), user.id, 'EX', SESSION_DAYS * 86400);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
async function endSession(req, res) {
  const token = cookieValue(req);
  if (token) await redis('DEL', 'sess:' + sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
async function currentUser(req) {
  const token = cookieValue(req);
  if (!token) return null;
  const key = 'sess:' + sha(token);
  const id = await redis('GET', key);
  if (!id) return null;
  await redis('EXPIRE', key, SESSION_DAYS * 86400); // sliding: each visit pushes the expiry back
  return getUser(id);
}
async function requireUser(req, role) {
  const u = await currentUser(req);
  if (!u) throw err(401, 'Connexion nécessaire');
  if (role && u.role !== role) throw err(403, 'Réservé à la direction');
  return u;
}

// ---------- dates in Paris time ----------
function parisNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function sundayOf(date) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()) % 7);
  return d.toISOString().slice(0, 10);
}
// The community manager's week closes on Sunday at 23:59, Paris time.
const weekLocked = (date) => parisNow().date > sundayOf(date);

// ---------- push notifications ----------
function push() {
  if (!process.env.VAPID_PRIVATE_KEY) throw err(503, 'Clé VAPID_PRIVATE_KEY absente');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@mes-reseaux.app', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return webpush;
}
// A subscription must look like what PushManager.subscribe() returns.
function validSub(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}
// Best effort: a shift is saved even when a phone cannot be reached.
async function notifyUsers(ids, payload) {
  let wp; try { wp = push(); } catch (e) { return 0; }
  let sent = 0;
  for (const id of ids) {
    const endpoints = (await redis('SMEMBERS', 'usubs:' + id)) || [];
    for (const ep of endpoints) {
      const raw = await redis('HGET', 'subs', ep);
      if (!raw) { await redis('SREM', 'usubs:' + id, ep); continue; }
      try { await wp.sendNotification(JSON.parse(raw), JSON.stringify(payload)); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { await redis('HDEL', 'subs', ep); await redis('SREM', 'usubs:' + id, ep); } }
    }
  }
  return sent;
}

module.exports = {
  VAPID_PUBLIC_KEY, redis, err, fail, readBody, jsonBody,
  roleForInvite, normName, cleanName, checkCode, setCode, getUser, saveUser, allUsers, publicUser,
  startSession, endSession, currentUser, requireUser,
  parisNow, sundayOf, weekLocked, push, validSub, notifyUsers,
};
