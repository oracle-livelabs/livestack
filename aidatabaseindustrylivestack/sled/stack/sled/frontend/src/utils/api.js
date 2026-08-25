const API_BASE = '/api';

// ── Demo User Context (VPD) ──────────────────────────────────────────────
export const RESTRICTED_DEMO_USER = 'viewer_sam';

// Display-only consistency signal for the signed HttpOnly actor session.
let _currentDemoUser = RESTRICTED_DEMO_USER;
export function setApiUser(username) {
  _currentDemoUser = String(username || '').trim() || RESTRICTED_DEMO_USER;
}
export function getApiUser() { return _currentDemoUser; }

function withCacheBuster(endpoint) {
  if (!endpoint || !endpoint.startsWith('/')) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}_ts=${Date.now()}`;
}

export async function apiFetch(endpoint, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const requestEndpoint = method === 'GET' ? withCacheBuster(endpoint) : endpoint;
  const url = `${API_BASE}${requestEndpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...options.headers,
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  const res = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (res.status === 304 && method === 'GET') {
    const retry = await fetch(`${API_BASE}${withCacheBuster(endpoint)}`, {
      ...options,
      headers,
      cache: 'reload',
      credentials: 'same-origin',
    });
    if (!retry.ok) {
      await parseApiError(retry);
    }
    return retry.json();
  }
  if (!res.ok) {
    await parseApiError(res);
  }
  return res.json();
}

function buildApiError(payload, status) {
  const error = new Error(payload.error || payload.message || `API error: ${status}`);
  error.details = payload.details || null;
  error.errors = payload.errors || payload.details?.errors || [];
  error.warnings = payload.warnings || payload.details?.warnings || [];
  error.counts = payload.counts || payload.details?.counts || null;
  error.category = payload.category || payload.details?.category || null;
  error.correlationId = payload.correlationId || payload.correlation_id || null;
  error.sql = payload.sql || null;
  error.oracleError = payload.oracleError || payload.oracle_error || null;
  error.profile = payload.profile || null;
  error.model = payload.model || null;
  return error;
}

async function parseApiError(res) {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw buildApiError(err, res.status);
}

export async function apiUploadFile(endpoint, file) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = {};
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  if (endpoint === '/import/upload') {
    headers['X-SLED-Demo-Control'] = 'sled-demo-session';
    headers['X-SLED-Dataset-Confirmation'] = 'REPLACE_DATASET';
    formData.append('confirmation', 'REPLACE_DATASET');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!res.ok) {
    await parseApiError(res);
  }
  return res.json();
}

export async function apiDownload(endpoint) {
  const headers = {};
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  headers['Cache-Control'] = 'no-cache';
  headers['Pragma'] = 'no-cache';

  const res = await fetch(`${API_BASE}${withCacheBuster(endpoint)}`, {
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    await parseApiError(res);
  }

  const contentDisposition = res.headers.get('content-disposition') || '';
  const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  const filename = fileNameMatch?.[1] || 'import-template-v1.zip';

  return {
    filename,
    blob: await res.blob(),
  };
}

export const api = {
  session: {
    establish: async (actor) => {
      const res = await fetch(`${API_BASE}/demo-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SLED-Demo-Control': 'sled-demo-session' },
        body: JSON.stringify({ actor }), credentials: 'same-origin', cache: 'no-store',
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },
    end: async () => {
      const res = await fetch(`${API_BASE}/demo-session`, { method: 'DELETE', headers: { 'X-SLED-Demo-Control': 'sled-demo-session' }, credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },
  },
  dashboard: {
    summary: () => apiFetch('/dashboard/summary'),
    trending: (limit = 10, search = '', brand = '') => {
      const qs = new URLSearchParams({ limit, ...(search && { search }), ...(brand && { brand }) }).toString();
      return apiFetch(`/dashboard/services-under-pressure?${qs}`);
    },
    velocity: (hours = 48) => apiFetch(`/dashboard/agency-workload-velocity?hours=${hours}`),
    revenueByCategory: () => apiFetch('/dashboard/service-value-by-category'),
    demandMap: () => apiFetch('/dashboard/demand-map'),
    inmemory: () => apiFetch('/dashboard/inmemory'),
  },
  residentSignals: {
    posts: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/resident-signals/posts?${qs}`);
    },
    prioritySignals: (hours = 48) => apiFetch(`/resident-signals/priority-signals?hours=${hours}`),
    influencers: () => apiFetch('/resident-signals/influencers'),
    priorityTimeline: () => apiFetch('/resident-signals/priority-timeline'),
    sourceChannels: () => apiFetch('/resident-signals/source-channel-breakdown'),
    search: (query, topK = 10) =>
      apiFetch('/resident-signals/semantic-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
    signalSearch: (query, topK = 20) =>
      apiFetch('/resident-signals/signal-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
  },
  publicServices: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/public-services?${qs}`);
    },
    detail: (id) => apiFetch(`/public-services/${id}`),
    duality: (id) => apiFetch(`/public-services/${id}/duality`),
    categories: () => apiFetch('/public-services/categories/list'),
  },
  fulfillment: {
    centers: () => apiFetch('/fulfillment/centers'),
    nearest: (params) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/fulfillment/nearest?${qs}`);
    },
    shipments: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/fulfillment/shipments?${qs}`);
    },
    alerts: () => apiFetch('/fulfillment/inventory-alerts'),
    customers: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/fulfillment/customers?${qs}`);
    },
    zones: () => apiFetch('/fulfillment/zones'),
    demandRegions: () => apiFetch('/fulfillment/demand-regions'),
  },
  graph: {
    influencers: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/graph/influencers?${qs}`);
    },
    network: (id, depth = 1) => apiFetch(`/graph/network/${id}?depth=${depth}`),
    propagation: (brandSlug) => apiFetch(`/graph/propagation/${brandSlug}`),
    exampleQueries: () => apiFetch('/graph/example-queries'),
    runExample: (queryId, params = {}) =>
      apiFetch('/graph/run-example', {
        method: 'POST',
        body: JSON.stringify({ queryId, params }),
      }),
    edgeMetadata: () => apiFetch('/graph/edge-metadata'),
  },
  agents: {
    runCycle: () => apiFetch('/agents/run-cycle', { method: 'POST' }),
    actions: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/agents/actions?${qs}`);
    },
    summary: () => apiFetch('/agents/summary'),
    detectTrends: (windowHours = 24, viralThreshold = 75) =>
      apiFetch('/agents/detect-trends', {
        method: 'POST',
        body: JSON.stringify({ windowHours, viralThreshold }),
      }),
    chat: (question) =>
      apiFetch('/agents/chat', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    events: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/agents/events?${qs}`);
    },
    profiles: () => apiFetch('/agents/profiles'),
    setProfile: (profile) =>
      apiFetch('/agents/set-profile', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }),
  },
  orders: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/orders?${qs}`);
    },
    detail: (id) => apiFetch(`/orders/${id}`),
    duality: (id) => apiFetch(`/orders/${id}/duality`),
  },
  ml: {
    summary: () => apiFetch('/ml/summary'),
    demandForecast: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/ml/demand-forecast?${qs}`);
    },
    customerSegments: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/ml/customer-segments?${qs}`);
    },
    revenueForecast: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/ml/revenue-forecast?${qs}`);
    },
    vectorClusters: (k = 5) => apiFetch(`/ml/vector-clusters?k=${k}`),
    capacityIntelligence: () => apiFetch('/ml/inventory-intelligence'),
    inventoryIntelligence: () => apiFetch('/ml/inventory-intelligence'),
    persistenceStatus: () => apiFetch('/ml/persistence/status'),
    refreshPersistence: () => apiFetch('/ml/persistence/refresh', { method: 'POST' }),
    modelStatus: () => apiFetch('/ml/models/status'),
  },
  selectai: {
    profiles: () => apiFetch('/selectai/profiles'),
    health: (profile) => apiFetch(`/selectai/health${profile ? `?profile=${encodeURIComponent(profile)}` : ''}`),
    schemaObjects: () => apiFetch('/selectai/schema-objects'),
    chat: (question, showSql = true, profile, history = []) =>
      apiFetch('/selectai/chat', {
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile, history }),
      }),
    showsql: (question, profile) =>
      apiFetch('/selectai/showsql', {
        method: 'POST',
        body: JSON.stringify({ question, profile }),
      }),
    runsql: (question, profile) =>
      apiFetch('/selectai/runsql', {
        method: 'POST',
        body: JSON.stringify({ question, profile }),
      }),
    chatMode: (question, showSql = true, profile, history = []) =>
      apiFetch('/selectai/chat-mode', {
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile, history }),
      }),
  },
  serviceRequests: () => apiFetch('/service-requests'),
  users: {
    list: () => apiFetch('/users'),
  },
  import: {
    template: () => apiDownload('/import/template'),
    validate: (file) => apiUploadFile('/import/validate', file),
    upload: (file) => apiUploadFile('/import/upload', file),
    status: (jobId) => apiFetch(`/import/status/${jobId}`),
    dataset: () => apiFetch('/import/dataset'),
    restoreDemoPreview: () =>
      apiFetch('/import/restore-demo/validate', {
        method: 'POST',
      }),
    restoreDemo: () =>
      apiFetch('/import/restore-demo', {
        method: 'POST',
        headers: { 'X-SLED-Demo-Control': 'sled-demo-session', 'X-SLED-Dataset-Confirmation': 'RESTORE_DEMO' },
        body: JSON.stringify({ confirmation: 'RESTORE_DEMO' }),
      }),
  },
  health: () => apiFetch('/health'),
};
