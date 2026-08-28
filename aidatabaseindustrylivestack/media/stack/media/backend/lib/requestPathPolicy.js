const PROTECTED_JSON_PATHS = new Set([
  '/api/import/upload',
  '/api/import/restore-demo',
]);

function shouldDeferGlobalJsonParser(method, requestPath) {
  return String(method || '').toUpperCase() === 'POST'
    && PROTECTED_JSON_PATHS.has(String(requestPath || '').split('?')[0]);
}

module.exports = { shouldDeferGlobalJsonParser };
