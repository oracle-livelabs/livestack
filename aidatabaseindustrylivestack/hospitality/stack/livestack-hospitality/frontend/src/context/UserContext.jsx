import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Admin', color: '#A73529', desc: 'Full access to all properties and settings' },
  analyst:         { label: 'Revenue Manager', color: '#437C94', desc: 'Read all, manage forecasts and pricing analytics' },
  fulfillment_mgr: { label: 'Operations Manager', color: '#3E6F4D', desc: 'Housekeeping, maintenance, and service routing by region' },
  merchandiser:    { label: 'Guest Experience Manager', color: '#8A4E2F', desc: 'Guest signals, service recovery, and revenue-center impact' },
  viewer:          { label: 'Restricted Viewer', color: '#7A736E', desc: 'Read-only catalog access with no regional operational rows' },
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
        const fallback = { USERNAME: 'admin_ava', FULL_NAME: 'Ava Chen', ROLE: 'admin', REGION: null };
        setCurrentUser(fallback);
        setApiUser('admin_ava');
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
