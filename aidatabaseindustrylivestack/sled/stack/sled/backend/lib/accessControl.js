function requireGlobalAccess(req, res, next) {
  if (req.demoIdentity?.authenticated === true
      && req.demoIdentity?.accessScope === 'GLOBAL') {
    return next();
  }

  return res.status(403).json({
    error: 'Global demo access is required for this operation',
    code: 'DEMO_GLOBAL_ACCESS_REQUIRED',
  });
}

module.exports = {
  requireGlobalAccess,
};
