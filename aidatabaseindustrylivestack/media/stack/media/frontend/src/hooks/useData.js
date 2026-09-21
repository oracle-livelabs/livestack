import { useState, useEffect, useCallback, useRef } from 'react';

function structuredClientError(error) {
  return Object.freeze({
    message: error?.message || 'The requested feature is unavailable.',
    status: error?.status || null,
    code: error?.code || null,
    category: error?.category || 'UNEXPECTED_BACKEND_RESPONSE',
    feature: error?.feature || null,
    available: error?.available === false ? false : null,
    correlationId: error?.correlationId || null,
    details: error?.details || null,
  });
}

export function useData(fetchFn, deps = [], options = {}) {
  const { autoFetch = true, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const requestGeneration = useRef(0);

  const refetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setData(null);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (requestGeneration.current !== generation) return;
      setData(result);
    } catch (err) {
      if (requestGeneration.current !== generation) return;
      setError(structuredClientError(err));
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    if (autoFetch) refetch();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refetch, autoFetch]);

  useEffect(() => {
    const invalidate = () => void refetch();
    window.addEventListener('media:dataset-revision', invalidate);
    window.addEventListener('media:identity-changed', invalidate);
    return () => {
      window.removeEventListener('media:dataset-revision', invalidate);
      window.removeEventListener('media:identity-changed', invalidate);
    };
  }, [refetch]);

  return { data, loading, error, refetch, setData };
}

export function usePolling(fetchFn, intervalMs = 30000, deps = []) {
  const result = useData(fetchFn, deps);

  useEffect(() => {
    const timer = setInterval(() => result.refetch(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, result.refetch]);

  return result;
}
