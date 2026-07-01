const ADMIN_ROLES = new Set(['admin']);

async function requireDemoIdentity(req, res, next) {
  if (!req.demoIdentity?.authenticated) {
    return res.status(503).json({
      error: 'Manufacturing identity validation is unavailable',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
  return next();
}

function requireDemoAdmin(req, res, next) {
  const role = String(req.demoIdentity?.role || '').toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return res.status(403).json({
      error: 'An active demo administrator identity is required for dataset mutations',
      code: 'DEMO_ADMIN_REQUIRED',
    });
  }

  return next();
}

module.exports = requireDemoIdentity;
module.exports.requireDemoAdmin = requireDemoAdmin;
