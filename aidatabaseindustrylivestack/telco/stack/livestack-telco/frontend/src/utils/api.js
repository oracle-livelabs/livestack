const API_BASE = '/api';

// ── Demo User Context (VPD) ──────────────────────────────────────────────
let _currentDemoUser = null;
export function setApiUser(username) { _currentDemoUser = username; }
export function getApiUser() { return _currentDemoUser; }

const DATASET_CONFIRMATIONS = Object.freeze({
  replace: 'REPLACE_DATASET',
  restore: 'RESTORE_DEMO',
});

function datasetConfirmationHeaders(confirmation) {
  return confirmation
    ? { 'X-Telco-Dataset-Confirmation': confirmation }
    : {};
}

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  const res = await fetch(url, {
    headers,
    credentials: 'same-origin',
    ...options,
  });
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
  return error;
}

async function parseApiError(res) {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw buildApiError(err, res.status);
}

export async function apiUploadFile(endpoint, file, { confirmation = '' } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = datasetConfirmationHeaders(confirmation);
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
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

  const res = await fetch(`${API_BASE}${endpoint}`, { headers, credentials: 'same-origin' });
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
    bootstrap: (username) => apiFetch('/session', {
      method: 'POST',
      body: JSON.stringify({ username }),
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
    inmemory: () => apiFetch('/dashboard/inmemory'),
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
    chat: (question, history = []) =>
      apiFetch('/agents/chat', {
        method: 'POST',
        body: JSON.stringify({ question, history }),
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
  },
  selectai: {
    profiles: () => apiFetch('/selectai/profiles'),
    chat: (question, showSql = true, profile, history = []) =>
      apiFetch('/selectai/chat', {
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile, history }),
      }),
    showsql: (question, profile, history = []) =>
      apiFetch('/selectai/showsql', {
        method: 'POST',
        body: JSON.stringify({ question, profile, history }),
      }),
    runsql: (question, profile, history = []) =>
      apiFetch('/selectai/runsql', {
        method: 'POST',
        body: JSON.stringify({ question, profile, history }),
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
    upload: (file) => apiUploadFile('/import/upload', file, {
      confirmation: DATASET_CONFIRMATIONS.replace,
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
        headers: datasetConfirmationHeaders(DATASET_CONFIRMATIONS.restore),
        body: JSON.stringify({
          ...payload,
          confirmation: DATASET_CONFIRMATIONS.restore,
        }),
      }),
  },
  health: () => apiFetch('/health'),
};
