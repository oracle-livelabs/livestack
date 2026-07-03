import { useState, useEffect, useCallback } from 'react';

export function useData(fetchFn, deps = [], options = {}) {
  const { autoFetch = true, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const [identityVersion, setIdentityVersion] = useState(0);

  useEffect(() => {
    const handleIdentityChange = () => setIdentityVersion((version) => version + 1);
    window.addEventListener('manufacturing-demo-user-changed', handleIdentityChange);
    return () => window.removeEventListener('manufacturing-demo-user-changed', handleIdentityChange);
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [...deps, identityVersion]);

  useEffect(() => {
    if (autoFetch) refetch();
  }, [refetch, autoFetch]);

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
