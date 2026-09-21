'use strict';

function featureUnavailable(res, {
  feature,
  message,
  source = null,
  correlationId = null,
  details = null,
} = {}) {
  const canonicalFeature = String(feature || 'ORACLE_FEATURE').trim().toUpperCase();
  const canonicalMessage = message || `${canonicalFeature} is unavailable.`;
  res.setHeader('X-Oracle-Feature', canonicalFeature);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    ok: false,
    code: 'FEATURE_UNAVAILABLE',
    category: 'ORACLE_FEATURE_UNAVAILABLE',
    feature: canonicalFeature,
    available: false,
    source,
    correlationId,
    error: canonicalMessage,
    message: canonicalMessage,
    details,
  });
}

module.exports = { featureUnavailable };
