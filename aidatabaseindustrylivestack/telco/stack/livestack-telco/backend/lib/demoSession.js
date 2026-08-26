const crypto = require('crypto');

const COOKIE_NAME = 'telco_demo_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;
const PROCESS_SESSION_SECRET = crypto.randomBytes(48).toString('base64url');

function secret() {
  return String(process.env.DEMO_SESSION_SECRET || PROCESS_SESSION_SECRET).trim();
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(identity) {
  const payload = Buffer.from(JSON.stringify({
    username: identity.username,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(value) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(String(session.username || ''))) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch (_) {
    return null;
  }
}

function readCookie(header) {
  return String(header || '').split(';').reduce((value, part) => {
    const [key, ...rest] = part.trim().split('=');
    return key === COOKIE_NAME ? decode(rest.join('=')) : value;
  }, null);
}

function setCookie(res, identity) {
  const attrs = [
    `${COOKIE_NAME}=${encode(identity)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

module.exports = { clearCookie, readCookie, setCookie };
