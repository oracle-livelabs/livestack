import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Admin',           color: '#C74634', desc: 'Full access to all data' },
  analyst:         { label: 'Analyst',          color: '#1B84ED', desc: 'Read all, write forecasts' },
  fulfillment_mgr: { label: 'Fulfillment Mgr', color: '#2D9F5E', desc: 'Regional inventory & shipping' },
  merchandiser:    { label: 'Merchandiser',     color: '#D4760A', desc: 'Products & social data' },
  viewer:          { label: 'Viewer',           color: '#6B6560', desc: 'Read-only access' },
};

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch users on mount
  useEffect(() => {
    api.users.list()
      .then(data => {
        setUsers(data);
        // Default to admin for full access on first load
        const admin = data.find(u => u.ROLE === 'admin') || data[0];
        if (admin) {
          setCurrentUser(admin);
          setApiUser(admin.USERNAME);
        }
      })
      .catch(err => {
        console.warn('Failed to load demo users:', err);
        // Fallback so app still works
        const fallback = { USERNAME: 'admin_jess', FULL_NAME: 'Jessica Chen', ROLE: 'admin', REGION: null };
        setCurrentUser(fallback);
        setApiUser('admin_jess');
      })
      .finally(() => setLoading(false));
  }, []);

  const switchUser = useCallback((username) => {
    const user = users.find(u => u.USERNAME === username);
    if (user) {
      setCurrentUser(user);
      setApiUser(user.USERNAME);
    }
  }, [users]);

  return (
    <UserContext.Provider value={{ currentUser, users, switchUser, loading, ROLE_META }}>
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
