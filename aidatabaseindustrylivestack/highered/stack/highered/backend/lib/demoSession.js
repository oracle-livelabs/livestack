const crypto = require('node:crypto');

const COOKIE_NAME = 'highered_demo_session';
const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const DEMO_CONTROL_HEADER = 'x-highered-demo-control';
const DEMO_CONTROL_VALUE = 'highered-demo-session';
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
  if (typeof req?.get === 'function') return String(req.get(name) || '');
  return String(req?.headers?.[String(name).toLowerCase()] || '');
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
  if (intent !== DEMO_CONTROL_VALUE || !origin || !host) return false;
  if (fetchSite && fetchSite !== 'same-origin') return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.host.toLowerCase() === host.toLowerCase()
      && parsed.origin === origin.replace(/\/$/, '');
  } catch (_) { return false; }
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(String(cookieHeader || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : [];
  }).filter(([name]) => name));
}

function createDemoSessionService({ secret = serverSecret(), ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  if (Buffer.byteLength(String(secret), 'utf8') < 32) throw new Error('The demo-session signing secret must contain at least 32 bytes.');
  const signingSecret = Buffer.from(String(secret), 'utf8');
  const signature = (value) => crypto.createHmac('sha256', signingSecret).update(value).digest('base64url');
  function issue(actor) {
    const normalizedActor = normalizeActor(actor);
    if (!normalizedActor) throw new Error('A recognized demo actor is required.');
    const iat = Number(now()); const exp = iat + ttlMs;
    const payload = Buffer.from(JSON.stringify({ v: 1, actor: normalizedActor, iat, exp, nonce: crypto.randomBytes(16).toString('base64url') })).toString('base64url');
    const unsigned = `${TOKEN_VERSION}.${payload}`;
    return { actor: normalizedActor, expiresAt: exp, token: `${unsigned}.${signature(unsigned)}` };
  }
  function verify(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return { ok: false, reason: token ? 'invalid' : 'missing' };
    const unsigned = `${parts[0]}.${parts[1]}`;
    const supplied = Buffer.from(parts[2], 'utf8'); const expected = Buffer.from(signature(unsigned), 'utf8');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return { ok: false, reason: 'invalid' };
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const actor = normalizeActor(payload?.actor); const current = Number(now());
      if (payload?.v !== 1 || !actor || !Number.isSafeInteger(payload?.iat) || !Number.isSafeInteger(payload?.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > ttlMs) return { ok: false, reason: 'invalid' };
      if (payload.exp <= current) return { ok: false, reason: 'expired' };
      return { ok: true, actor, issuedAt: payload.iat, expiresAt: payload.exp };
    } catch (_) { return { ok: false, reason: 'invalid' }; }
  }
  const cookie = (token, maxAge, secure) => [`${COOKIE_NAME}=${token}`, 'Path=/api', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])].join('; ');
  return {
    issue, verify,
    readRequest: (req) => verify(parseCookies(header(req, 'Cookie'))[COOKIE_NAME] || ''),
    serializeCookie: (token, { secure = false } = {}) => cookie(token, Math.floor(ttlMs / 1000), secure),
    clearCookie: ({ secure = false } = {}) => cookie('', 0, secure),
  };
}

module.exports = { COOKIE_NAME, DEMO_CONTROL_HEADER, DEMO_CONTROL_VALUE, createDemoSessionService, normalizeActor, sameOriginDemoControl };
