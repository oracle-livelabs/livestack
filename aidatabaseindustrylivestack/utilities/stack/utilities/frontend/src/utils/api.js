const API_BASE = '/api';

// ── Demo User Context (VPD) ──────────────────────────────────────────────
let _currentDemoUser = null;
export function setApiUser(username) { _currentDemoUser = username; }
export function getApiUser() { return _currentDemoUser; }

function withCacheBuster(url, token = '_') {
  return `${url}${url.includes('?') ? '&' : '?'}${token}=${Date.now()}`;
}

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    ...options.headers,
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  const requestUrl = method === 'GET' ? withCacheBuster(url) : url;
  let res = await fetch(requestUrl, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: options.cache || 'no-store',
  });

  if (res.status === 304) {
    res = await fetch(withCacheBuster(url, '_retry'), {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'reload',
    });
  }

  if (!res.ok) {
    await parseApiError(res);
  }
  return res.json();
}

function buildApiError(payload, status, correlationId = null) {
  const error = new Error(payload.error || payload.message || `API error: ${status}`);
  error.status = status;
  error.code = payload.code || null;
  error.category = payload.category || null;
  error.correlationId = payload.correlationId || correlationId || null;
  error.details = payload.details || null;
  error.errors = payload.errors || payload.details?.errors || [];
  error.warnings = payload.warnings || payload.details?.warnings || [];
  error.counts = payload.counts || payload.details?.counts || null;
  error.sql = payload.sql || null;
  error.oracleError = payload.oracleError || null;
  error.profile = payload.profile || null;
  error.model = payload.model || null;
  return error;
}

async function parseApiError(res) {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw buildApiError(err, res.status, res.headers.get('x-correlation-id'));
}

function destructiveRequestHeaders(confirmation) {
  return {
    'X-Utilities-Demo-Control': 'utilities-demo-session',
    'X-Utilities-Dataset-Confirmation': confirmation,
  };
}

export async function apiUploadFile(endpoint, file, { destructiveConfirmation = null } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  if (destructiveConfirmation) {
    formData.append('confirmation', destructiveConfirmation);
  }

  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    ...(destructiveConfirmation ? destructiveRequestHeaders(destructiveConfirmation) : {}),
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!res.ok) {
    await parseApiError(res);
  }
  return res.json();
}

export async function apiDownload(endpoint) {
  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  let res = await fetch(withCacheBuster(`${API_BASE}${endpoint}`), {
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 304) {
    res = await fetch(withCacheBuster(`${API_BASE}${endpoint}`, '_retry'), {
      headers,
      credentials: 'same-origin',
      cache: 'reload',
    });
  }
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
    establish: (actor) =>
      apiFetch('/demo-session', {
        method: 'POST',
        headers: { 'X-Utilities-Demo-Control': 'utilities-demo-session' },
        body: JSON.stringify({ actor }),
      }),
    end: () =>
      apiFetch('/demo-session', {
        method: 'DELETE',
        headers: { 'X-Utilities-Demo-Control': 'utilities-demo-session' },
      }),
  },
  dashboard: {
    summary: () => apiFetch('/dashboard/summary'),
    trending: (limit = 10, search = '', brand = '') => {
      const qs = new URLSearchParams({ limit, ...(search && { search }), ...(brand && { brand }) }).toString();
      return apiFetch(`/dashboard/trending-products?${qs}`);
    },
    velocity: (hours = 48) => apiFetch(`/dashboard/social-velocity?hours=${hours}`),
    revenueByCategory: () => apiFetch('/dashboard/revenue-by-category'),
    demandMap: () => apiFetch('/dashboard/demand-map'),
    inmemoryReadiness: () => apiFetch('/dashboard/inmemory-readiness'),
  },
  social: {
    posts: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/social/posts?${qs}`);
    },
    viral: (hours = 48) => apiFetch(`/social/viral?hours=${hours}`),
    influencers: () => apiFetch('/social/influencers'),
    momentum: () => apiFetch('/social/momentum-timeline'),
    platforms: () => apiFetch('/social/platform-breakdown'),
    search: (query, topK = 10) =>
      apiFetch('/social/semantic-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
    postSearch: (query, topK = 20) =>
      apiFetch('/social/post-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
    vectorReadiness: () => apiFetch('/social/vector-readiness'),
  },
  products: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/products?${qs}`);
    },
    detail: (id) => apiFetch(`/products/${id}`),
    duality: (id) => apiFetch(`/products/${id}/duality`),
    categories: () => apiFetch('/products/categories/list'),
  },
  fulfillment: {
    kpis: () => apiFetch('/fulfillment/kpis'),
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
    spatialReadiness: () => apiFetch('/fulfillment/spatial-readiness'),
  },
  graph: {
    influencers: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/graph/influencers?${qs}`);
    },
    network: (id, depth = 1) => apiFetch(`/graph/network/${id}?depth=${depth}`),
    edgeMetadata: () => apiFetch('/graph/edge-metadata'),
    propagation: (brandSlug) => apiFetch(`/graph/propagation/${brandSlug}`),
    exampleQueries: () => apiFetch('/graph/example-queries'),
    runExample: (queryId, params = {}) =>
      apiFetch('/graph/run-example', {
        method: 'POST',
        body: JSON.stringify({ queryId, params }),
      }),
    readiness: () => apiFetch('/graph/readiness'),
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
  serviceRequests: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/service-requests?${qs}`);
    },
    detail: (id) => apiFetch(`/service-requests/${id}`),
    duality: (id) => apiFetch(`/service-requests/${id}/duality`),
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
    inventoryIntelligence: () => apiFetch('/ml/inventory-intelligence'),
    modelStatus: () => apiFetch('/ml/models/status'),
    persistenceStatus: () => apiFetch('/ml/persistence/status'),
  },
  selectai: {
    profiles: () => apiFetch('/selectai/profiles'),
    health: () => apiFetch('/selectai/health'),
    schemaObjects: () => apiFetch('/selectai/schema-objects'),
    chat: (question, showSql = true, profile) =>
      apiFetch('/selectai/chat', {
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile }),
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
  users: {
    list: () => apiFetch('/users'),
  },
  import: {
    template: () => apiDownload('/import/template'),
    validate: (file) => apiUploadFile('/import/validate', file),
    upload: (file) =>
      apiUploadFile('/import/upload', file, {
        destructiveConfirmation: 'REPLACE_DATASET',
      }),
    status: (jobId) => apiFetch(`/import/status/${jobId}`),
    dataset: () => apiFetch('/import/dataset'),
    restoreDemoPreview: () =>
      apiFetch('/import/restore-demo/validate', {
        method: 'POST',
      }),
    restoreDemo: (payload = {}) =>
      apiFetch('/import/restore-demo', {
        method: 'POST',
        headers: destructiveRequestHeaders('RESTORE_DEMO'),
        body: JSON.stringify({
          ...payload,
          confirmation: 'RESTORE_DEMO',
        }),
      }),
  },
  demo: {
    status: () => apiFetch('/demo/status'),
    nativeJsonReadiness: () => apiFetch('/demo/native-json-readiness'),
    unifiedAuditReadiness: () => apiFetch('/demo/unified-audit-readiness'),
  },
  health: () => apiFetch('/health'),
};
