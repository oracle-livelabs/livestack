import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Admin',           color: '#C74634', desc: 'Full access to all data' },
  analyst:         { label: 'Analyst',          color: '#437C94', desc: 'Read all, write forecasts' },
  fulfillment_mgr: { label: 'Network Ops Mgr', color: '#4C825C', desc: 'Regional capacity, routing, and site operations' },
  field_supervisor:    { label: 'Field Supervisor', color: '#AA643B', desc: 'Field services and reliability signals' },
  viewer:          { label: 'Viewer',           color: '#7A736E', desc: 'Read-only access' },
};

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switchingIdentity, setSwitchingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState(null);
  const [scopeVersion, setScopeVersion] = useState(0);

  // Fetch users on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.users.list();
        if (!active) return;
        setUsers(data);
        // Default to admin for full access on first load
        const admin = data.find(u => u.ROLE === 'admin') || data[0];
        if (admin) {
          await api.session.establish(admin.USERNAME);
          if (!active) return;
          setCurrentUser(admin);
          setApiUser(admin.USERNAME);
          setIdentityError(null);
          setScopeVersion((version) => version + 1);
        } else {
          throw new Error('No active demo identity is available.');
        }
      } catch (err) {
        console.warn('Failed to load demo users:', err);
        await api.session.end().catch(() => {});
        if (!active) return;
        // Do not invent an elevated persona if the governed identity list is unavailable.
        setUsers([]);
        setCurrentUser(null);
        setApiUser(null);
        setIdentityError('Identity selection is unavailable. Reload before viewing governed data.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const switchUser = useCallback(async (username) => {
    const user = users.find(u => u.USERNAME === username);
    if (!user || switchingIdentity) return false;
    setSwitchingIdentity(true);
    setIdentityError(null);
    try {
      await api.session.establish(user.USERNAME);
      setCurrentUser(user);
      setApiUser(user.USERNAME);
      setScopeVersion((version) => version + 1);
      return true;
    } catch (err) {
      console.warn('Failed to establish governed demo identity:', err);
      await api.session.end().catch(() => {});
      setCurrentUser(null);
      setApiUser(null);
      setIdentityError('The selected governed identity could not be established. Choose again after reloading.');
      setScopeVersion((version) => version + 1);
      return false;
    } finally {
      setSwitchingIdentity(false);
    }
  }, [switchingIdentity, users]);

  return (
    <UserContext.Provider value={{
      currentUser,
      users,
      switchUser,
      loading,
      switchingIdentity,
      identityError,
      scopeVersion,
      ROLE_META,
    }}>
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
