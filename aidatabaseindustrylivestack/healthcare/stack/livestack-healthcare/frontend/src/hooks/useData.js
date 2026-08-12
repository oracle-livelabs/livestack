import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../context/UserContext';

export function useData(fetchFn, deps = [], options = {}) {
  const { autoFetch = true, initialData = null } = options;
  const { scopeVersion } = useUser();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  const requestVersionRef = useRef(0);

  useEffect(() => {
    // Never let a response from the previous governed scope stay visible.
    requestVersionRef.current += 1;
    setData(initialData);
    setError(null);
  }, [scopeVersion, initialData]);

  const refetch = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (requestVersion === requestVersionRef.current) setData(result);
    } catch (err) {
      if (requestVersion === requestVersionRef.current) setError(err);
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [...deps, scopeVersion]);

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
