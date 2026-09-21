import { getApiUser } from './api';

const API_BASE = '/api/returns/requests';
export const RETURN_DECISION_CONFIRMATION = 'confirm-return-decision';

function buildDecisionLifecycleError(payload, status) {
  const error = new Error(payload?.error || payload?.message || `Decision lifecycle API error: ${status}`);
  error.code = payload?.code || 'RETURN_DECISION_LIFECYCLE_FAILED';
  error.status = status;
  error.details = payload?.details || null;
  error.correlationId = payload?.correlationId || null;
  return error;
}

async function lifecycleFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...options.headers,
  };
  const username = getApiUser();
  if (username) headers['X-Demo-User'] = username;
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
    throw buildDecisionLifecycleError(payload, response.status);
  }
  return response.status === 204 ? null : response.json();
}

export const returnDecisionLifecycleApi = Object.freeze({
  load(returnId) {
    return lifecycleFetch(`/${encodeURIComponent(returnId)}/decision-lifecycle`);
  },

  createProposal(returnId, {
    decisionType,
    reviewerNotes,
    customerResponse,
    clientRequestId,
    expectedVersion,
  }) {
    return lifecycleFetch(`/${encodeURIComponent(returnId)}/decision-proposals`, {
      method: 'POST',
      body: JSON.stringify({ decisionType, reviewerNotes, customerResponse, clientRequestId, expectedVersion }),
    });
  },

  updateProposal(returnId, proposalId, {
    decisionType,
    reviewerNotes,
    customerResponse,
    clientRequestId,
    expectedVersion,
  }) {
    return lifecycleFetch(`/${encodeURIComponent(returnId)}/decision-proposals/${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decisionType, reviewerNotes, customerResponse, clientRequestId, expectedVersion }),
    });
  },

  commitProposal(returnId, proposalId, {
    clientRequestId,
    expectedVersion,
  }) {
    return lifecycleFetch(`/${encodeURIComponent(returnId)}/decision-proposals/${encodeURIComponent(proposalId)}/commit`, {
      method: 'POST',
      headers: { 'X-Return-Decision-Command': RETURN_DECISION_CONFIRMATION },
      body: JSON.stringify({
        confirmation: true,
        clientRequestId,
        expectedVersion,
      }),
    });
  },
});

export { buildDecisionLifecycleError, lifecycleFetch };
