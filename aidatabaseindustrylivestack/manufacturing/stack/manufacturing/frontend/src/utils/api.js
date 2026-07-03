const API_BASE = '/api';

// ── Demo User Context (VPD) ──────────────────────────────────────────────
let _currentDemoUser = null;
export function setApiUser(username) {
  const nextUser = username || null;
  const changed = _currentDemoUser !== nextUser;
  _currentDemoUser = nextUser;
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('manufacturing-demo-user-changed', {
      detail: { username: nextUser },
    }));
  }
}
export function getApiUser() { return _currentDemoUser; }

const DATASET_COMMAND_HEADERS = Object.freeze({
  'X-Manufacturing-Command': 'dataset-mutation',
});

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
    cache: options.cache || 'no-store',
  });

  if (res.status === 304) {
    res = await fetch(withCacheBuster(url, '_retry'), {
      ...options,
      headers,
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

export async function apiUploadFile(endpoint, file, { datasetMutation = false } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  if (datasetMutation) Object.assign(headers, DATASET_COMMAND_HEADERS);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: formData,
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

  let res = await fetch(withCacheBuster(`${API_BASE}${endpoint}`), { headers, cache: 'no-store' });
  if (res.status === 304) {
    res = await fetch(withCacheBuster(`${API_BASE}${endpoint}`, '_retry'), { headers, cache: 'reload' });
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
  dashboard: {
    summary: () => apiFetch('/dashboard/summary'),
    trending: (limit = 10, search = '', brand = '') => {
      const qs = new URLSearchParams({ limit, ...(search && { search }), ...(brand && { brand }) }).toString();
      return apiFetch(`/dashboard/trending-products?${qs}`);
    },
    velocity: (hours = 48) => apiFetch(`/dashboard/signal-velocity?hours=${hours}`),
    workOrderValueByCategory: () => apiFetch('/dashboard/work-order-value-by-category'),
    demandMap: () => apiFetch('/dashboard/demand-map'),
    inmemory: () => apiFetch('/dashboard/inmemory'),
  },
  productionSignals: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/production-signals?${qs}`);
    },
    urgent: (hours = 48) => apiFetch(`/production-signals/urgent?hours=${hours}`),
    networkAccounts: () => apiFetch('/production-signals/network-accounts'),
    momentum: () => apiFetch('/production-signals/momentum-timeline'),
    channels: () => apiFetch('/production-signals/channel-breakdown'),
    search: (query, topK = 10) =>
      apiFetch('/production-signals/semantic-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
    signalSearch: (query, topK = 20) =>
      apiFetch('/production-signals/signal-search', {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      }),
  },
  products: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/products?${qs}`);
    },
    detail: (id) => apiFetch(`/products/${id}`),
    categories: () => apiFetch('/products/categories/list'),
  },
  manufacturing: {
    parts: {
      document: (id) => apiFetch(`/manufacturing/parts/${id}/document`),
    },
    workOrders: {
      document: (id) => apiFetch(`/manufacturing/work-orders/${id}/document`),
    },
    plants: {
      document: (id) => apiFetch(`/manufacturing/plants/${id}/document`),
    },
    graph: {
      entities: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/manufacturing/graph/entities${qs ? `?${qs}` : ''}`);
      },
      network: (entityKey, depth = 1) =>
        apiFetch(`/manufacturing/graph/network/${encodeURIComponent(entityKey)}?depth=${depth}`),
      caseEvidence: (caseKey) =>
        apiFetch(`/manufacturing/graph/cases/${encodeURIComponent(caseKey)}`),
    },
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
  },
  agents: {
    runCycle: () => apiFetch('/agents/run-cycle', { method: 'POST' }),
    actions: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/agents/actions?${qs}`);
    },
    summary: () => apiFetch('/agents/summary'),
    detectTrends: (windowHours = 24, urgencyThreshold = 75) =>
      apiFetch('/agents/detect-trends', {
        method: 'POST',
        body: JSON.stringify({ windowHours, urgencyThreshold }),
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
  workOrders: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/work-orders?${qs}`);
    },
    detail: (id) => apiFetch(`/work-orders/${id}`),
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
    capacityIntelligence: () => apiFetch('/ml/inventory-intelligence'),
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
      apiUploadFile('/import/upload', file, { datasetMutation: true }),
    status: (jobId) => apiFetch(`/import/status/${jobId}`),
    dataset: () => apiFetch('/import/dataset'),
    restoreDemoPreview: () =>
      apiFetch('/import/restore-demo/validate', {
        method: 'POST',
      }),
    restoreDemo: () =>
      apiFetch('/import/restore-demo', {
        method: 'POST',
        headers: DATASET_COMMAND_HEADERS,
      }),
  },
  demo: {
    status: () => apiFetch('/demo/status'),
  },
  health: () => apiFetch('/health'),
};
