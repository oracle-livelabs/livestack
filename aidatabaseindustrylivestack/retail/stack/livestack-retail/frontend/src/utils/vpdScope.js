export function vpdScopePresentation(user) {
  const scope = String(user?.ACCESS_SCOPE || 'RESTRICTED').toUpperCase();
  switch (scope) {
    case 'GLOBAL':
      return {
        scope,
        label: 'VPD global access',
        description: 'Global scope - all authorized regions are visible.',
      };
    case 'REGIONAL':
      return {
        scope,
        label: 'VPD region-filtered',
        description: user?.REGION
          ? `Regional scope - only ${user.REGION} rows are visible.`
          : 'Regional scope - only the authorized region is visible.',
      };
    case 'RESTRICTED':
    default:
      return {
        scope: 'RESTRICTED',
        label: 'VPD restricted',
        description: 'Restricted scope - no protected operational or signal rows are visible.',
      };
  }
}
