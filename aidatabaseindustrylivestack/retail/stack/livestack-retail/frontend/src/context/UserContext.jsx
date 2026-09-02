import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Admin',           color: '#C74634', desc: 'Global read and protected write access' },
  analyst:         { label: 'Analyst',          color: '#437C94', desc: 'Global read-only analytics' },
  fulfillment_mgr: { label: 'Fulfillment Mgr', color: '#4C825C', desc: 'Regional read-only operations' },
  merchandiser:    { label: 'Merchandiser',     color: '#AA643B', desc: 'Fail-restricted demo access' },
  viewer:          { label: 'Viewer',           color: '#7A736E', desc: 'Restricted read-only access' },
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
        const admin = data.find(u => u.USERNAME === 'admin_jess') || data.find(u => u.ROLE === 'admin');
        if (admin) {
          setCurrentUser(admin);
          setApiUser(admin.USERNAME);
        }
      })
      .catch(err => {
        console.warn('Failed to load demo users:', err);
        const fallback = {
          USERNAME: 'admin_jess',
          FULL_NAME: 'Jessica Chen',
          ROLE: 'admin',
          REGION: null,
          ACCESS_SCOPE: 'GLOBAL',
        };
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
