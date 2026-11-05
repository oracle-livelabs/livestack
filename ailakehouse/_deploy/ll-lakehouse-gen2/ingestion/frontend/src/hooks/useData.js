import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { getApiUser } from '../utils/api';

export function useData(fetchFn, deps = [], options = {}) {
  const { currentUser } = useUser();
  const requestId = useRef(0);
  const { autoFetch = true, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    const id = ++requestId.current;
    const username = getApiUser();
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (id === requestId.current && username === getApiUser()) setData(result);
    } catch (err) {
      if (id === requestId.current && username === getApiUser()) setError(err.message);
    } finally {
      if (id === requestId.current && username === getApiUser()) setLoading(false);
    }
  }, [currentUser?.USERNAME, ...deps]);

  useEffect(() => {
    setData(initialData);
    if (autoFetch) refetch();
    return () => { requestId.current += 1; };
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
