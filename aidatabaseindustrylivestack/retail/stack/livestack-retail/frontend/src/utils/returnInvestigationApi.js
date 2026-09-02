import { getApiUser } from './api';

const API_BASE = '/api/returns';

function buildError(payload, status) {
  const error = new Error(payload?.error || payload?.message || `Investigation API error: ${status}`);
  error.code = payload?.code || 'RETURN_INVESTIGATION_FAILED';
  error.status = status;
  error.details = payload?.details || null;
  return error;
}

async function investigationFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...options.headers,
  };
  const username = getApiUser();
  if (username) headers['X-Demo-User'] = username;
  const method = String(options.method || 'GET').toUpperCase();
  const baseUrl = `${API_BASE}${path}`;
  const url = method === 'GET'
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_=${Date.now()}`
    : baseUrl;
  const response = await fetch(url, {
    ...options,
    method,
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw buildError(payload, response.status);
  }
  return response.json();
}

export const returnInvestigationApi = Object.freeze({
  list(returnId) {
    const query = new URLSearchParams({ returnId: String(returnId) });
    return investigationFetch(`/investigations?${query}`);
  },

  create({ returnId, title }) {
    return investigationFetch('/investigations', {
      method: 'POST',
      body: JSON.stringify({ returnId, ...(title && { title }) }),
    });
  },

  load(investigationId) {
    return investigationFetch(`/investigations/${encodeURIComponent(investigationId)}`);
  },

  submitTurn(investigationId, {
    question,
    clientRequestId,
    expectedVersion,
    returnId,
  }) {
    return investigationFetch(`/investigations/${encodeURIComponent(investigationId)}/turns`, {
      method: 'POST',
      body: JSON.stringify({ question, clientRequestId, expectedVersion, returnId }),
    });
  },

  archive(investigationId, expectedVersion) {
    return investigationFetch(`/investigations/${encodeURIComponent(investigationId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    });
  },
});

export { buildError, investigationFetch };
