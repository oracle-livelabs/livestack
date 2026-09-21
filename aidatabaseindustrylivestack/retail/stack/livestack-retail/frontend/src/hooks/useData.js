import { useState, useEffect, useCallback, useRef } from 'react';

export function useData(fetchFn, deps = [], options = {}) {
  const { autoFetch = true, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const [identityVersion, setIdentityVersion] = useState(0);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const requestGeneration = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    const refreshForIdentity = () => setIdentityVersion((value) => value + 1);
    const refreshForDataset = () => setDatasetRevision((value) => value + 1);
    window.addEventListener('retail-demo-user-changed', refreshForIdentity);
    window.addEventListener('retail-dataset-revision', refreshForDataset);
    return () => {
      window.removeEventListener('retail-demo-user-changed', refreshForIdentity);
      window.removeEventListener('retail-dataset-revision', refreshForDataset);
    };
  }, []);

  const refetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setData(initialData);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn({ signal: controller.signal });
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setData(result);
      }
    } catch (err) {
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setError(err);
      }
    } finally {
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [...deps, identityVersion, datasetRevision]);

  useEffect(() => {
    if (autoFetch) refetch();
    return () => {
      requestGeneration.current += 1;
      abortRef.current?.abort();
    };
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
