const AUTH_BEFORE_BODY_PATHS = new Set([
  '/api/import/upload',
  '/api/import/restore-demo',
]);

function normalizeRequestPath(requestPath) {
  const path = String(requestPath || '/').toLowerCase();
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function shouldDeferGlobalJsonParser(method, requestPath) {
  return String(method || '').toUpperCase() === 'POST'
    && AUTH_BEFORE_BODY_PATHS.has(normalizeRequestPath(requestPath));
}

module.exports = {
  normalizeRequestPath,
  shouldDeferGlobalJsonParser,
};
