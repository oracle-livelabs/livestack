const MEDIA_AGENT_TEAMS = Object.freeze({
  SIGNAL: 'MEDIA_SIGNAL_TEAM',
  DISTRIBUTION: 'MEDIA_DISTRIBUTION_TEAM',
  REVENUE: 'MEDIA_REVENUE_TEAM',
});

const TEAM_ALIASES = Object.freeze({
  SOCIAL_TREND_TEAM: MEDIA_AGENT_TEAMS.SIGNAL,
  FULFILLMENT_TEAM: MEDIA_AGENT_TEAMS.DISTRIBUTION,
  COMMERCE_TEAM: MEDIA_AGENT_TEAMS.REVENUE,
});

function normalizeAgentTeam(teamName) {
  const normalized = String(teamName || MEDIA_AGENT_TEAMS.REVENUE).trim().toUpperCase();
  return TEAM_ALIASES[normalized] || normalized;
}

function scoreTerms(qLower, strongTerms, weakTerms) {
  return strongTerms.filter((term) => qLower.includes(term)).length * 3
    + weakTerms.filter((term) => qLower.includes(term)).length;
}

function routeAgentQuestion(question) {
  const qLower = String(question || '').trim().toLowerCase();

  if (/(percentage|percent|share|ratio).*(campaign requests?|audience-signal|audience signal|signal-driven)|campaign requests?.*(percentage|percent|share|ratio)/.test(qLower)) {
    return {
      team: MEDIA_AGENT_TEAMS.REVENUE,
      intent: 'revenue',
      scores: { trends: 0, distribution: 0, revenue: 99 },
    };
  }

  const trendStrong = [
    'trending',
    'urgent',
    'urgency',
    'viral',
    'virality',
    'mega_viral',
    'momentum',
    'creator',
    'community',
    'instagram',
    'hashtag',
    'rising',
    'highest demand',
    'demand right now',
    'audience demand',
  ];
  const distributionStrong = [
    'capacity',
    'rights capacity',
    'coverage hub',
    'content distribution',
    'nearest',
    'route',
    'routing',
    'same-day',
    'out of capacity',
    'inventory',
    'reorder',
    'replenish',
  ];
  const revenueStrong = [
    'content revenue',
    'campaign request',
    'campaign order',
    'request total',
    'order total',
    'revenue risk',
    'churn',
    'retention',
    'monetization',
  ];

  const trendWeak = ['trend', 'signal', 'audience signal', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment', 'demand'];
  const distributionWeak = ['stock', 'center', 'supply', 'logistics', 'completion', 'distance', 'desk', 'hub'];
  const revenueWeak = ['campaign', 'subscriber', 'value', 'category', 'program', 'content', 'total', 'revenue'];

  const trendScore = scoreTerms(qLower, trendStrong, trendWeak);
  const distributionScore = scoreTerms(qLower, distributionStrong, distributionWeak);
  const revenueScore = scoreTerms(qLower, revenueStrong, revenueWeak);

  if (distributionScore > trendScore && distributionScore >= revenueScore) {
    return {
      team: MEDIA_AGENT_TEAMS.DISTRIBUTION,
      intent: 'distribution',
      scores: { trends: trendScore, distribution: distributionScore, revenue: revenueScore },
    };
  }

  if (trendScore >= distributionScore && trendScore > revenueScore && trendScore > 0) {
    return {
      team: MEDIA_AGENT_TEAMS.SIGNAL,
      intent: 'trends',
      scores: { trends: trendScore, distribution: distributionScore, revenue: revenueScore },
    };
  }

  return {
    team: MEDIA_AGENT_TEAMS.REVENUE,
    intent: 'revenue',
    scores: { trends: trendScore, distribution: distributionScore, revenue: revenueScore },
  };
}

function cleanAgentFallbackText(text) {
  return String(text || '')
    .replace(/\bcampaign orders\b/gi, 'campaign requests')
    .replace(/\bcampaign order\b/gi, 'campaign request')
    .replace(/\border total\b/gi, 'campaign value')
    .replace(/\borders\b/gi, 'campaign requests')
    .replace(/\border\b/gi, 'campaign request')
    .replace(/\binventory\b/gi, 'rights capacity')
    .replace(/\bstock status\b/gi, 'rights-capacity status')
    .replace(/\bstock\b/gi, 'rights capacity')
    .replace(/\bfulfillment centers\b/gi, 'coverage hubs')
    .replace(/\bfulfillment center\b/gi, 'coverage hub')
    .replace(/\bfulfillment\b/gi, 'coverage')
    .replace(/\bcustomers\b/gi, 'audience accounts')
    .replace(/\bcustomer\b/gi, 'audience account')
    .replace(/\bsocial-driven\b/gi, 'audience-signal-driven')
    .replace(/\bsocial orders\b/gi, 'audience-signal campaign requests');
}

function resolveAgentRuntimeMode({ agentUsed = false, toolsUsed = [] } = {}) {
  if (agentUsed) return 'ollama';
  const hasOracleTool = toolsUsed.some((entry) => (
    entry?.status === 'success'
    && !/^Ollama\b/i.test(String(entry.tool || ''))
  ));
  return hasOracleTool ? 'oracle_fallback' : 'oracle_tool_only';
}

module.exports = {
  MEDIA_AGENT_TEAMS,
  TEAM_ALIASES,
  cleanAgentFallbackText,
  normalizeAgentTeam,
  resolveAgentRuntimeMode,
  routeAgentQuestion,
};
