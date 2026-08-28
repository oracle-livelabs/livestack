function requireDemoIdentity(req, res, next) {
  if (!req.demoIdentity?.authenticated) {
    return res.status(503).json({
      error: 'Media identity validation is unavailable',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
  return next();
}

function requireDemoAdmin(req, res, next) {
  if (String(req.demoIdentity?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({
      error: 'An active demo administrator identity is required for dataset mutations',
      code: 'DEMO_ADMIN_REQUIRED',
    });
  }
  return next();
}

module.exports = requireDemoIdentity;
module.exports.requireDemoAdmin = requireDemoAdmin;
