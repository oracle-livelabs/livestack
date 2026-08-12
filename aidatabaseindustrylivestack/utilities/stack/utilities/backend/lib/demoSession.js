const crypto = require('node:crypto');

const COOKIE_NAME = 'utilities_demo_session';
const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const DEMO_CONTROL_HEADER = 'x-utilities-demo-control';
const DEMO_CONTROL_VALUE = 'utilities-demo-session';
const ACTOR_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

let generatedProcessSecret = null;

function serverSecret() {
  const configured = String(process.env.DEMO_SESSION_SECRET || '');
  if (configured) {
    if (Buffer.byteLength(configured, 'utf8') < 32) {
      throw new Error('DEMO_SESSION_SECRET must contain at least 32 bytes.');
    }
    return configured;
  }
  if (!generatedProcessSecret) {
    generatedProcessSecret = crypto.randomBytes(48).toString('base64url');
  }
  return generatedProcessSecret;
}

function header(req, name) {
  if (typeof req?.get === 'function') return String(req.get(name) || '');
  return String(req?.headers?.[String(name).toLowerCase()] || '');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
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
  } catch (_) {
    return false;
  }
}

function createDemoSessionService({
  secret = serverSecret(),
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
} = {}) {
  if (Buffer.byteLength(String(secret), 'utf8') < 32) {
    throw new Error('The demo-session signing secret must contain at least 32 bytes.');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 24 * 60 * 60 * 1000) {
    throw new Error('The demo-session lifetime must be between one second and 24 hours.');
  }

  const signingSecret = Buffer.from(String(secret), 'utf8');

  function signature(unsignedToken) {
    return crypto.createHmac('sha256', signingSecret).update(unsignedToken).digest('base64url');
  }

  function issue(actor) {
    const normalizedActor = normalizeActor(actor);
    if (!normalizedActor) throw new Error('A recognized demo actor is required.');
    const issuedAt = Number(now());
    const expiresAt = issuedAt + ttlMs;
    const payload = Buffer.from(JSON.stringify({
      v: 1,
      actor: normalizedActor,
      iat: issuedAt,
      exp: expiresAt,
      nonce: crypto.randomBytes(16).toString('base64url'),
    }), 'utf8').toString('base64url');
    const unsignedToken = `${TOKEN_VERSION}.${payload}`;
    return {
      actor: normalizedActor,
      expiresAt,
      token: `${unsignedToken}.${signature(unsignedToken)}`,
    };
  }

  function verify(token) {
    const value = String(token || '');
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) {
      return { ok: false, reason: value ? 'invalid' : 'missing' };
    }

    const unsignedToken = `${parts[0]}.${parts[1]}`;
    const expected = signature(unsignedToken);
    const suppliedBuffer = Buffer.from(parts[2], 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (suppliedBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      return { ok: false, reason: 'invalid' };
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (_) {
      return { ok: false, reason: 'invalid' };
    }

    const currentTime = Number(now());
    const actor = normalizeActor(payload?.actor);
    if (payload?.v !== 1
        || !actor
        || !Number.isSafeInteger(payload?.iat)
        || !Number.isSafeInteger(payload?.exp)
        || payload.iat > currentTime + 30_000
        || payload.exp <= payload.iat
        || payload.exp - payload.iat > ttlMs) {
      return { ok: false, reason: 'invalid' };
    }
    if (payload.exp <= currentTime) return { ok: false, reason: 'expired' };

    return {
      ok: true,
      actor,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  }

  function readRequest(req) {
    const token = parseCookies(header(req, 'Cookie'))[COOKIE_NAME] || '';
    return verify(token);
  }

  function serializeCookie(token, { secure = false } = {}) {
    const attributes = [
      `${COOKIE_NAME}=${token}`,
      'Path=/api',
      `Max-Age=${Math.floor(ttlMs / 1000)}`,
      'HttpOnly',
      'SameSite=Strict',
    ];
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
  }

  function clearCookie({ secure = false } = {}) {
    const attributes = [
      `${COOKIE_NAME}=`,
      'Path=/api',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'HttpOnly',
      'SameSite=Strict',
    ];
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
  }

  return {
    clearCookie,
    issue,
    readRequest,
    serializeCookie,
    verify,
  };
}

module.exports = {
  COOKIE_NAME,
  DEMO_CONTROL_HEADER,
  DEMO_CONTROL_VALUE,
  createDemoSessionService,
  normalizeActor,
  sameOriginDemoControl,
};
