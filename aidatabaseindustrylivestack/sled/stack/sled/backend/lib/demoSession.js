const crypto = require('node:crypto');

const COOKIE_NAME = 'sled_demo_session';
const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const DEMO_CONTROL_HEADER = 'x-sled-demo-control';
const DEMO_CONTROL_VALUE = 'sled-demo-session';
const ACTOR_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

let generatedProcessSecret = null;

function serverSecret() {
  const configured = String(process.env.DEMO_SESSION_SECRET || '');
  if (configured) {
    if (Buffer.byteLength(configured, 'utf8') < 32) throw new Error('DEMO_SESSION_SECRET must contain at least 32 bytes.');
    return configured;
  }
  if (!generatedProcessSecret) generatedProcessSecret = crypto.randomBytes(48).toString('base64url');
  return generatedProcessSecret;
}

function header(req, name) {
  const normalized = String(name).toLowerCase();
  const rawHeaders = req && req.headers ? req.headers : {};
  const fromExpress = typeof req?.get === 'function' ? req.get(name) : '';
  return String(rawHeaders[normalized] || fromExpress || '');
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(String(cookieHeader || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator <= 0 ? [] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter((entry) => entry.length));
}

function normalizeActor(actor) {
  const value = typeof actor === 'string' ? actor.trim() : '';
  return ACTOR_PATTERN.test(value) ? value : null;
}

function sameOriginDemoControl(req) {
  const intent = header(req, DEMO_CONTROL_HEADER);
  const origin = header(req, 'Origin');
  const host = header(req, 'Host');
  const fetchSite = header(req, 'Sec-Fetch-Site').toLowerCase();
  if (intent !== DEMO_CONTROL_VALUE || !origin || !host || (fetchSite && fetchSite !== 'same-origin')) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.host.toLowerCase() === host.toLowerCase()
      && parsed.origin === origin.replace(/\/$/, '');
  } catch (_) { return false; }
}

function createDemoSessionService({ secret = serverSecret(), ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  if (Buffer.byteLength(String(secret), 'utf8') < 32) throw new Error('The demo-session signing secret must contain at least 32 bytes.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 24 * 60 * 60 * 1000) throw new Error('The demo-session lifetime must be between one second and 24 hours.');
  const signingSecret = Buffer.from(String(secret), 'utf8');
  const signature = (unsigned) => crypto.createHmac('sha256', signingSecret).update(unsigned).digest('base64url');
  const issue = (actor) => {
    const normalizedActor = normalizeActor(actor);
    if (!normalizedActor) throw new Error('A recognized demo actor is required.');
    const issuedAt = Number(now());
    const expiresAt = issuedAt + ttlMs;
    const payload = Buffer.from(JSON.stringify({ v: 1, actor: normalizedActor, iat: issuedAt, exp: expiresAt, nonce: crypto.randomBytes(16).toString('base64url') }), 'utf8').toString('base64url');
    const unsigned = `${TOKEN_VERSION}.${payload}`;
    return { actor: normalizedActor, expiresAt, token: `${unsigned}.${signature(unsigned)}` };
  };
  const verify = (token) => {
    const value = String(token || '');
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return { ok: false, reason: value ? 'invalid' : 'missing' };
    const unsigned = `${parts[0]}.${parts[1]}`;
    const supplied = Buffer.from(parts[2], 'utf8');
    const expected = Buffer.from(signature(unsigned), 'utf8');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return { ok: false, reason: 'invalid' };
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (_) { return { ok: false, reason: 'invalid' }; }
    const currentTime = Number(now());
    const actor = normalizeActor(payload?.actor);
    if (payload?.v !== 1 || !actor || !Number.isSafeInteger(payload?.iat) || !Number.isSafeInteger(payload?.exp) || payload.iat > currentTime + 30_000 || payload.exp <= payload.iat || payload.exp - payload.iat > ttlMs) return { ok: false, reason: 'invalid' };
    if (payload.exp <= currentTime) return { ok: false, reason: 'expired' };
    return { ok: true, actor, issuedAt: payload.iat, expiresAt: payload.exp };
  };
  const cookie = (token, { secure = false, clear = false } = {}) => [
    `${COOKIE_NAME}=${clear ? '' : token}`, 'Path=/api', `Max-Age=${clear ? 0 : Math.floor(ttlMs / 1000)}`,
    ...(clear ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []), 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : []),
  ].join('; ');
  const readRequest = (req) => {
    const rawHeaders = req && req.headers ? req.headers : {};
    const cookieHeader = rawHeaders.cookie || rawHeaders.Cookie || header(req, 'Cookie');
    return verify(parseCookies(cookieHeader)[COOKIE_NAME] || '');
  };
  return { issue, verify, readRequest, serializeCookie: (token, options) => cookie(token, options), clearCookie: (options) => cookie('', { ...options, clear: true }) };
}

module.exports = { COOKIE_NAME, DEMO_CONTROL_HEADER, DEMO_CONTROL_VALUE, createDemoSessionService, normalizeActor, sameOriginDemoControl };
