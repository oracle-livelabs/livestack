const { AsyncLocalStorage } = require('async_hooks');

const RESTRICTED_DEMO_USER = 'viewer_sam';
const requestIdentityStorage = new AsyncLocalStorage();
const RESTRICTED_IDENTITY = Object.freeze({
  username: RESTRICTED_DEMO_USER,
  role: 'viewer',
  region: null,
  accessScope: 'RESTRICTED',
  authenticated: true,
});

function runWithRequestIdentity(identity, callback) {
  const normalized = Object.freeze({
    username: String(identity?.username || RESTRICTED_DEMO_USER),
    role: String(identity?.role || 'viewer').toLowerCase(),
    region: identity?.region || null,
    accessScope: String(identity?.accessScope || 'RESTRICTED').toUpperCase(),
    authenticated: identity?.authenticated === true,
  });
  return requestIdentityStorage.run(normalized, callback);
}

function getRequestIdentity() {
  return requestIdentityStorage.getStore() || RESTRICTED_IDENTITY;
}

module.exports = {
  RESTRICTED_DEMO_USER,
  getRequestIdentity,
  runWithRequestIdentity,
};
