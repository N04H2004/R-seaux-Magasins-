// Shared helpers for the push-notification functions (Vercel serverless, Node).
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

function push() {
  if (!process.env.VAPID_PRIVATE_KEY) throw Object.assign(new Error('Clé VAPID_PRIVATE_KEY absente'), { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@mes-reseaux.app', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return webpush;
}

// A subscription must look like what PushManager.subscribe() returns.
function validSub(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = ''; for await (const c of req) raw += c; return JSON.parse(raw || '{}');
}

function fail(res, e) {
  res.status(e.status || 500).json({ ok: false, error: e.message });
}

module.exports = { VAPID_PUBLIC_KEY, redis, push, validSub, readBody, fail };
