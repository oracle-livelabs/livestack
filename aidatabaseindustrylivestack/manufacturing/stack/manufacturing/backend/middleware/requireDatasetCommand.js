const COMMAND_HEADER = 'x-manufacturing-command';
const COMMAND_VALUE = 'dataset-mutation';

function originMatchesRequest(req, origin) {
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = String(req.get('host') || '').trim().toLowerCase();
    return Boolean(requestHost) && parsedOrigin.host.toLowerCase() === requestHost;
  } catch (_) {
    return false;
  }
}

function requireDatasetCommand(req, res, next) {
  const command = String(req.headers?.[COMMAND_HEADER] || '').trim().toLowerCase();
  if (command !== COMMAND_VALUE) {
    return res.status(403).json({
      error: 'Explicit dataset mutation intent is required',
      code: 'DATASET_COMMAND_REQUIRED',
    });
  }

  const origin = String(req.get('origin') || '').trim();
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  if ((origin && !originMatchesRequest(req, origin)) || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
    return res.status(403).json({
      error: 'Cross-origin dataset mutation commands are not allowed',
      code: 'DATASET_COMMAND_ORIGIN_FORBIDDEN',
    });
  }

  return next();
}

module.exports = requireDatasetCommand;
