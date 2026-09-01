const COMMAND_HEADER = 'x-dataset-command';
const EXPECTED_COMMAND = 'confirm-dataset-mutation';

function originAllowed(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  const expected = new URL(
    process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`
  ).origin;
  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

module.exports = function requireDatasetCommand(req, res, next) {
  if (String(req.headers[COMMAND_HEADER] || '') !== EXPECTED_COMMAND) {
    return res.status(428).json({
      error: 'Explicit dataset mutation intent is required',
      code: 'DATASET_COMMAND_REQUIRED',
    });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({
      error: 'Cross-origin dataset mutation is not allowed',
      code: 'DATASET_ORIGIN_FORBIDDEN',
    });
  }
  return next();
};
