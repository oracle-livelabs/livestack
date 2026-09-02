import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DEFAULT_RETAILER_NAME = 'Seer Sporting Goods';
const STORAGE_KEY = 'retail_livestack_customer_name_v2';

const RetailerContext = createContext({
  retailerName: DEFAULT_RETAILER_NAME,
  defaultRetailerName: DEFAULT_RETAILER_NAME,
  isSaved: false,
  setRetailerName: () => {},
  resetRetailerName: () => {},
});

function normalizeName(value) {
  const next = String(value || '').trim();
  return next || DEFAULT_RETAILER_NAME;
}

export function RetailerProvider({ children }) {
  const [retailerName, setRetailerNameState] = useState(DEFAULT_RETAILER_NAME);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedName = window.localStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setRetailerNameState(normalizeName(savedName));
      setIsSaved(true);
    }
  }, []);

  const setRetailerName = useCallback((value, options = {}) => {
    const nextName = normalizeName(value);
    setRetailerNameState(nextName);
    const shouldSave = Boolean(options.save);
    setIsSaved(shouldSave);
    if (typeof window !== 'undefined') {
      if (shouldSave) {
        window.localStorage.setItem(STORAGE_KEY, nextName);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const resetRetailerName = useCallback(() => {
    setRetailerNameState(DEFAULT_RETAILER_NAME);
    setIsSaved(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(() => ({
    retailerName,
    defaultRetailerName: DEFAULT_RETAILER_NAME,
    isSaved,
    setRetailerName,
    resetRetailerName,
  }), [isSaved, resetRetailerName, retailerName, setRetailerName]);

  return (
    <RetailerContext.Provider value={value}>
      {children}
    </RetailerContext.Provider>
  );
}

export function useRetailerName() {
  return useContext(RetailerContext);
}
