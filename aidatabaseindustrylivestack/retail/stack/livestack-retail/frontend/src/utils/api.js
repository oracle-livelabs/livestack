const API_BASE = '/api';

// ── Demo User Context (VPD) ──────────────────────────────────────────────
let _currentDemoUser = null;
export function setApiUser(username) {
  const next = username || null;
  const changed = next !== _currentDemoUser;
  _currentDemoUser = next;
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('retail-demo-user-changed', { detail: { username: next } }));
  }
}
export function getApiUser() { return _currentDemoUser; }

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...options.headers,
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  const requestUrl = method === 'GET'
    ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`
    : url;
  let res = await fetch(requestUrl, {
    ...options,
    cache: options.cache || 'no-store',
    headers,
  });
  if (res.status === 304) {
    res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_retry=${Date.now()}`, {
      ...options,
      cache: 'reload',
      headers,
    });
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
  error.category = payload.category || null;
  error.code = payload.code || null;
  error.correlationId = payload.correlationId || null;
  error.feature = payload.feature || null;
  error.available = payload.available;
  error.status = status;
  return error;
}

async function parseApiError(res) {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw buildApiError(err, res.status);
}

export async function apiUploadFile(endpoint, file, { mutation = false } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = {};
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }
  if (mutation) {
    headers['X-Dataset-Command'] = 'confirm-dataset-mutation';
  }

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
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  if (_currentDemoUser) {
    headers['X-Demo-User'] = _currentDemoUser;
  }

  const res = await fetch(`${API_BASE}${endpoint}?_=${Date.now()}`, { cache: 'no-store', headers });
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
    velocity: (hours = 48) => apiFetch(`/dashboard/social-velocity?hours=${hours}`),
    revenueByCategory: () => apiFetch('/dashboard/revenue-by-category'),
    demandMap: () => apiFetch('/dashboard/demand-map'),
    inmemory: () => apiFetch('/dashboard/inmemory'),
    nativeJson: () => apiFetch('/dashboard/native-json'),
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
    vectorReadiness: () => apiFetch('/social/vector-readiness'),
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
    spatialReadiness: () => apiFetch('/fulfillment/spatial-readiness'),
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
    runCycle: () => apiFetch('/agents/run-cycle', {
      method: 'POST',
      headers: { 'X-Agent-Command': 'confirm-agent-proposals' },
    }),
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
    conversations: (limit = 20) => apiFetch(`/agents/conversations?limit=${Math.min(Math.max(Number(limit) || 20, 1), 50)}`),
    createConversation: (title) => apiFetch('/agents/conversations', {
      method: 'POST',
      body: JSON.stringify({ ...(title && { title }) }),
    }),
    conversation: (conversationId) => apiFetch(`/agents/conversations/${encodeURIComponent(conversationId)}`),
    archiveConversation: (conversationId) => apiFetch(`/agents/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    }),
    chat: (question, conversationId = null) =>
      apiFetch('/agents/chat', {
        method: 'POST',
        body: JSON.stringify({ question, ...(conversationId && { conversationId }) }),
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
    scoringEvidence: () => apiFetch('/ml/scoring-evidence'),
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
  },
  selectai: {
    profiles: () => apiFetch('/selectai/profiles'),
    chat: (question, showSql = true, profile, conversation = null, options = {}) =>
      apiFetch('/selectai/chat', {
        ...options,
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile, conversation }),
      }),
    showsql: (question, profile, conversation = null, options = {}) =>
      apiFetch('/selectai/showsql', {
        ...options,
        method: 'POST',
        body: JSON.stringify({ question, profile, conversation }),
      }),
    runsql: (question, profile, conversation = null, options = {}) =>
      apiFetch('/selectai/runsql', {
        ...options,
        method: 'POST',
        body: JSON.stringify({ question, profile, conversation }),
      }),
    chatMode: (question, showSql = true, profile, conversation = null, options = {}) =>
      apiFetch('/selectai/chat-mode', {
        ...options,
        method: 'POST',
        body: JSON.stringify({ question, showSql, profile, conversation }),
      }),
  },
  users: {
    list: () => apiFetch('/users'),
  },
  demo: {
    status: (options = {}) => apiFetch('/demo/status', options),
    legacyStart: () => apiFetch('/demo/start'),
  },

  returns: {
    summary: () => apiFetch('/returns/summary'),
    evidenceReadiness: () => apiFetch('/returns/evidence-readiness'),
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/returns/requests?${qs}`);
    },
    detail: (id) => apiFetch(`/returns/requests/${id}`),
    analyze: (id) => apiFetch(`/returns/requests/${id}/analyze`, { method: 'POST' }),
    decide: (id, decision) =>
      apiFetch(`/returns/requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    customerGraph: (customerId) => apiFetch(`/returns/customers/${customerId}/graph`),
    ask: (question, returnId) =>
      apiFetch('/returns/ask', {
        method: 'POST',
        body: JSON.stringify({ question, returnId }),
      }),
  },
  import: {
    template: () => apiDownload('/import/template'),
    validate: (file) => apiUploadFile('/import/validate', file, { mutation: true }),
    upload: (file) => apiUploadFile('/import/upload', file, { mutation: true }),
    status: (jobId) => apiFetch(`/import/status/${jobId}`),
    dataset: () => apiFetch('/import/dataset'),
    restoreDemoPreview: () =>
      apiFetch('/import/restore-demo/validate', {
        method: 'POST',
        headers: { 'X-Dataset-Command': 'confirm-dataset-mutation' },
      }),
    restoreDemo: () =>
      apiFetch('/import/restore-demo', {
        method: 'POST',
        headers: { 'X-Dataset-Command': 'confirm-dataset-mutation' },
      }),
  },
  health: () => apiFetch('/health'),
};
