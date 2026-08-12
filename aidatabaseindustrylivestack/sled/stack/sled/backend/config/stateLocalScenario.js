const DEMO_JURISDICTION = Object.freeze({
  stateName: 'Colorado',
  stateCode: 'CO',
  operatingViewLabel: 'Colorado Resident Services Overview',
  residentScopeLabel: 'Colorado residents only',
});

const SERVICE_REGIONS = Object.freeze([
  Object.freeze({
    code: 'FRONT_RANGE',
    name: 'Front Range',
    description: 'Front Range and Eastern Plains resident-service operations',
  }),
  Object.freeze({
    code: 'WESTERN_SLOPE',
    name: 'Western Slope',
    description: 'Western Slope and mountain resident-service operations',
  }),
  Object.freeze({
    code: 'SOUTHERN_COLORADO',
    name: 'Southern Colorado',
    description: 'Southern Colorado resident-service operations',
  }),
]);

function resolveServiceRegionCode(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon <= -106.2) return 'WESTERN_SLOPE';
  if (lat < 39.2) return 'SOUTHERN_COLORADO';
  return 'FRONT_RANGE';
}

const STATE_LOCAL_SCENARIO = Object.freeze({
  state: DEMO_JURISDICTION.stateName,
  stateCode: DEMO_JURISDICTION.stateCode,
  operatingViewLabel: DEMO_JURISDICTION.operatingViewLabel,
  residentScopeLabel: DEMO_JURISDICTION.residentScopeLabel,
  serviceRegions: SERVICE_REGIONS,
  medicaidEligibility: Object.freeze({
    currentErrorRatePercent: 2.7,
    thresholdPercent: 3.0,
    approachingThresholdFloorPercent: 2.5,
  }),
});

function asFinitePercent(value, fieldName) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new TypeError(`${fieldName} must be a non-negative finite number.`);
  }
  return numericValue;
}

function evaluateMedicaidEligibilityRisk(
  currentErrorRatePercent = STATE_LOCAL_SCENARIO.medicaidEligibility.currentErrorRatePercent,
  thresholdPercent = STATE_LOCAL_SCENARIO.medicaidEligibility.thresholdPercent,
) {
  const currentRate = asFinitePercent(currentErrorRatePercent, 'currentErrorRatePercent');
  const threshold = asFinitePercent(thresholdPercent, 'thresholdPercent');
  if (threshold === 0) {
    throw new TypeError('thresholdPercent must be greater than zero.');
  }

  const aboveThreshold = currentRate > threshold;
  const approachingThreshold = !aboveThreshold
    && currentRate >= Math.min(
      threshold,
      STATE_LOCAL_SCENARIO.medicaidEligibility.approachingThresholdFloorPercent,
    );

  return {
    metricName: 'Medicaid Eligibility Error Rate',
    currentErrorRatePercent: currentRate,
    thresholdPercent: threshold,
    status: aboveThreshold
      ? 'Above Threshold'
      : approachingThreshold
        ? 'Approaching Threshold'
        : 'Within Threshold',
    thresholdStatus: aboveThreshold ? 'Above Threshold' : 'Within Threshold',
    thresholdCondition: aboveThreshold ? 'Above Threshold' : 'Within Threshold',
    withinThreshold: !aboveThreshold,
    aboveThreshold,
    isAboveThreshold: aboveThreshold,
    potentialRisk: aboveThreshold ? 'Potential federal matching-fund exposure' : null,
    explanation: 'Tracks the share of eligibility-related payments that may be improper. Rates above 3% may create federal matching-fund exposure based on the stakeholder-provided demo threshold.',
    ruleDisclosure: 'Demo risk status uses the stakeholder-provided 3% business-rule threshold.',
  };
}

module.exports = {
  DEMO_JURISDICTION,
  SERVICE_REGIONS,
  STATE_LOCAL_SCENARIO,
  resolveServiceRegionCode,
  evaluateMedicaidEligibilityRisk,
};
