const { AsyncLocalStorage } = require('async_hooks');

const DEFAULT_DEMO_USER = 'admin_jess';
const storage = new AsyncLocalStorage();
const DEFAULT_IDENTITY = Object.freeze({
  username: DEFAULT_DEMO_USER,
  role: 'admin',
  region: null,
  accessScope: 'GLOBAL',
  authenticated: true,
});

function runWithRequestIdentity(identity, callback) {
  const normalized = Object.freeze({
    username: String(identity?.username || DEFAULT_DEMO_USER),
    role: String(identity?.role || 'admin').toLowerCase(),
    region: identity?.region || null,
    accessScope: String(identity?.accessScope || 'GLOBAL').toUpperCase(),
    authenticated: identity?.authenticated === true,
  });
  return storage.run(normalized, callback);
}

function getRequestIdentity() {
  return storage.getStore() || DEFAULT_IDENTITY;
}

module.exports = {
  DEFAULT_DEMO_USER,
  getRequestIdentity,
  runWithRequestIdentity,
};
