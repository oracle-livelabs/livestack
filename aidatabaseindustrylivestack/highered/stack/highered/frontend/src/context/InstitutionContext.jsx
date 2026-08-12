import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DEFAULT_INSTITUTION_NAME = 'Seer Higher Education';
const DEFAULT_SHORT_INSTITUTION_NAME = 'Seer Higher Ed';
const STORAGE_KEY = 'higheredLivestack.customerName';

const InstitutionContext = createContext(null);

function loadStoredName() {
 try {
 return localStorage.getItem(STORAGE_KEY) || DEFAULT_INSTITUTION_NAME;
 } catch {
 return DEFAULT_INSTITUTION_NAME;
 }
}

export function InstitutionProvider({ children }) {
 const [institutionName, setInstitutionNameState] = useState(loadStoredName);

 const setInstitutionName = (nextName, persist = false) => {
 const cleanName = (nextName || '').trim() || DEFAULT_INSTITUTION_NAME;
 setInstitutionNameState(cleanName);
 try {
 if (persist) {
 localStorage.setItem(STORAGE_KEY, cleanName);
 }
 } catch {}
 };

 useEffect(() => {
 document.documentElement.dataset.institutionName = institutionName;
 }, [institutionName]);

 const shortInstitutionName = useMemo(() => {
 return institutionName
 .replace(/\bUniversity\b/i, '')
 .replace(/\bCollege\b/i, '')
 .trim() || institutionName;
 }, [institutionName]);

 const replaceInstitutionLabels = (value) => {
 if (typeof value !== 'string') return value;
 return value
 .replace(/\bSeer State University\b/g, institutionName)
 .replace(/\bSeer State\b/g, shortInstitutionName)
 .replace(new RegExp(`\\b${DEFAULT_INSTITUTION_NAME}\\b`, 'g'), institutionName)
 .replace(new RegExp(`\\b${DEFAULT_SHORT_INSTITUTION_NAME}\\b`, 'g'), shortInstitutionName)
 .replace(/\bSeer\b/g, shortInstitutionName);
 };

 const value = useMemo(() => ({
 defaultInstitutionName: DEFAULT_INSTITUTION_NAME,
 defaultShortInstitutionName: DEFAULT_SHORT_INSTITUTION_NAME,
 institutionName,
 replaceInstitutionLabels,
 shortInstitutionName,
 setInstitutionName,
 }), [institutionName, replaceInstitutionLabels, shortInstitutionName]);

 return (
 <InstitutionContext.Provider value={value}>
 {children}
 </InstitutionContext.Provider>
 );
}

export function useInstitution() {
 const context = useContext(InstitutionContext);
 if (!context) throw new Error('useInstitution must be used inside InstitutionProvider');
 return context;
}
