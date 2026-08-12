import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, RESTRICTED_DEMO_USER, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Global VPD Admin', color: '#C74634', desc: 'Global access across all Colorado service regions' },
  analyst:         { label: 'Global VPD Analyst', color: '#437C94', desc: 'Global read access across all Colorado service regions' },
  fulfillment_mgr: { label: 'Regional VPD Manager', color: '#4C825C', desc: 'Access to the assigned in-state service region' },
  merchandiser:    { label: 'Restricted VPD Planner', color: '#AA643B', desc: 'No protected regional operational rows' },
  viewer:          { label: 'Restricted Viewer (VPD)', color: '#7A736E', desc: 'No protected regional operational rows' },
};

const RESTRICTED_VIEWER_FALLBACK = Object.freeze({
  USERNAME: RESTRICTED_DEMO_USER,
  FULL_NAME: 'Sam Taylor',
  ROLE: 'viewer',
  REGION: null,
  ACCESS_SCOPE: 'RESTRICTED',
});

const REGION_LABELS = Object.freeze({
  FRONT_RANGE: 'Front Range',
  WESTERN_SLOPE: 'Western Slope',
  SOUTHERN_COLORADO: 'Southern Colorado',
});

export function formatRegionLabel(region) {
  const code = String(region || '').trim().toUpperCase();
  if (!code) return '';
  return REGION_LABELS[code] || code
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function resolveAccessScope(user) {
  const configuredScope = String(user?.ACCESS_SCOPE || '').trim().toUpperCase();
  if (['GLOBAL', 'REGIONAL', 'RESTRICTED'].includes(configuredScope)) return configuredScope;

  // Compatibility fallback while older demo volumes receive idempotent schema setup. Oracle is
  // authoritative once ACCESS_SCOPE is returned by the users API.
  const role = String(user?.ROLE || '').trim().toLowerCase();
  if (role === 'admin' || role === 'analyst') return 'GLOBAL';
  if (role === 'fulfillment_mgr') return 'REGIONAL';
  return 'RESTRICTED';
}

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Establish a signed restricted session first, then let the Oracle-backed
  // directory choose the starting Colorado persona.
  useEffect(() => {
    const initializeIdentity = async () => {
      setApiUser(RESTRICTED_DEMO_USER);
      await api.session.establish(RESTRICTED_DEMO_USER);
      const data = await api.users.list();
      setUsers(data);
      const globalAdmin = data.find(u => u.USERNAME === 'admin_jess');
      const restrictedViewer = data.find(u => u.USERNAME === RESTRICTED_DEMO_USER);
      const initialUser = globalAdmin || restrictedViewer || RESTRICTED_VIEWER_FALLBACK;
      await api.session.establish(initialUser.USERNAME);
      setApiUser(initialUser.USERNAME);
      setCurrentUser(initialUser);
    };
    initializeIdentity()
      .catch(err => {
        console.warn('Failed to load demo users:', err);
        setCurrentUser(RESTRICTED_VIEWER_FALLBACK);
        setApiUser(RESTRICTED_DEMO_USER);
      })
      .finally(() => setLoading(false));
  }, []);

  const switchUser = useCallback(async (username) => {
    const user = users.find(u => u.USERNAME === username);
    if (user) {
      try {
        await api.session.establish(user.USERNAME);
        setApiUser(user.USERNAME);
        setCurrentUser(user);
      } catch (error) {
        setApiUser(null);
        throw error;
      }
    }
  }, [users]);

  const accessScope = resolveAccessScope(currentUser);

  return (
    <UserContext.Provider value={{ currentUser, users, switchUser, loading, accessScope, ROLE_META }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be inside UserProvider');
  return ctx;
}

export { ROLE_META };
