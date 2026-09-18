function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildOwnerCloseNote(context = {}) {
  const propertyName = String(context.PROPERTY_NAME || 'Property').trim();
  const fiscalPeriodLabel = String(context.FISCAL_PERIOD_LABEL || 'current period').trim();
  const validationStatus = String(context.OWNER_VALIDATION_STATUS || 'under review').trim();
  const exceptionCount = Math.max(0, Math.trunc(finiteNumber(context.EXCEPTION_COUNT)));
  const readinessScore = Math.max(0, Math.min(100, finiteNumber(context.CLOSE_READINESS_SCORE)));

  let nextAction;
  if (validationStatus === 'owner validated') {
    nextAction = 'Owner validation is recorded; final close remains governed by the normal finance process.';
  } else if (validationStatus === 'escalated to finance') {
    nextAction = 'Finance should resolve the governed exception evidence before owner attestation.';
  } else if (validationStatus === 'correction requested') {
    nextAction = 'The requested source correction should be completed and revalidated before owner attestation.';
  } else if (exceptionCount === 0) {
    nextAction = 'No material exception remains, but owner attestation is still a separate human action.';
  } else {
    nextAction = 'Owner review should focus on the largest governed variance before attestation; no exception has been auto-attested.';
  }

  return {
    note: [
      `${propertyName} ${fiscalPeriodLabel} close is ${validationStatus}.`,
      `${exceptionCount} exception(s) remain, with a close readiness score of ${readinessScore}%.`,
      nextAction,
    ].join(' '),
    source: 'oracle-governed-summary',
  };
}

module.exports = { buildOwnerCloseNote };
