import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';

export default function useGenerationRequestGuard(onInvalidate = null) {
  const { currentUser } = useUser();
  const epochRef = useRef(0);
  const requestRef = useRef(new Map());
  const invalidateRef = useRef(onInvalidate);
  const [boundaryKey, setBoundaryKey] = useState(0);
  invalidateRef.current = onInvalidate;

  const invalidate = useCallback(() => {
    epochRef.current += 1;
    requestRef.current.clear();
    setBoundaryKey((value) => value + 1);
    invalidateRef.current?.();
  }, []);

  useEffect(() => {
    invalidate();
  }, [currentUser?.USERNAME, invalidate]);

  useEffect(() => {
    const handleIdentity = () => invalidate();
    const handleGeneration = (event) => {
      if (event?.detail?.preserveSceneState === true) return;
      invalidate();
    };
    window.addEventListener('media:identity-changed', handleIdentity);
    window.addEventListener('media:dataset-revision', handleGeneration);
    return () => {
      window.removeEventListener('media:identity-changed', handleIdentity);
      window.removeEventListener('media:dataset-revision', handleGeneration);
    };
  }, [invalidate]);

  const beginRequest = useCallback((channel = 'default') => {
    const request = (requestRef.current.get(channel) || 0) + 1;
    requestRef.current.set(channel, request);
    return {
      channel,
      epoch: epochRef.current,
      request,
      username: currentUser?.USERNAME || null,
    };
  }, [currentUser?.USERNAME]);

  const isCurrent = useCallback((token) => Boolean(token)
    && token.epoch === epochRef.current
    && token.request === requestRef.current.get(token.channel)
    && token.username === (currentUser?.USERNAME || null), [currentUser?.USERNAME]);

  return { boundaryKey, beginRequest, isCurrent, invalidate };
}
