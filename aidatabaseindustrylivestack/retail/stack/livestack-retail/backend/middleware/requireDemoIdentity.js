function requireDemoIdentity(req, res, next) {
  if (!req.demoIdentity?.authenticated) {
    return res.status(403).json({
      error: 'An Oracle-validated demo identity is required',
      code: 'DEMO_IDENTITY_FORBIDDEN',
    });
  }
  return next();
}

function requireDemoAdmin(req, res, next) {
  if (String(req.demoIdentity?.role || '').toLowerCase() !== 'admin'
      || String(req.demoIdentity?.accessScope || '').toUpperCase() !== 'GLOBAL') {
    return res.status(403).json({
      error: 'Dataset mutation requires the administrator demo identity',
      code: 'DEMO_ADMIN_REQUIRED',
    });
  }
  return next();
}

module.exports = requireDemoIdentity;
module.exports.requireDemoAdmin = requireDemoAdmin;
