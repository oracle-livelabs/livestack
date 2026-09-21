const COMMAND_HEADER = 'x-media-command';
const COMMAND_VALUE = 'dataset-mutation';

function originMatchesRequest(req, origin) {
  try {
    return new URL(origin).host.toLowerCase() === String(req.get('host') || '').trim().toLowerCase();
  } catch (_) {
    return false;
  }
}

module.exports = function requireDatasetCommand(req, res, next) {
  if (String(req.headers?.[COMMAND_HEADER] || '').trim().toLowerCase() !== COMMAND_VALUE) {
    return res.status(403).json({
      error: 'Explicit dataset mutation intent is required',
      code: 'DATASET_COMMAND_REQUIRED',
    });
  }
  const origin = String(req.get('origin') || '').trim();
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  if ((origin && !originMatchesRequest(req, origin))
      || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
    return res.status(403).json({
      error: 'Cross-origin dataset mutation commands are not allowed',
      code: 'DATASET_COMMAND_ORIGIN_FORBIDDEN',
    });
  }
  return next();
};
