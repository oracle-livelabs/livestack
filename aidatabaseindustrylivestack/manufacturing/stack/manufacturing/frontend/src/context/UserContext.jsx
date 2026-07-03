import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);

const ROLE_META = {
  admin:           { label: 'Global Admin',           color: '#C74634', desc: 'Global access across all regions' },
  analyst:         { label: 'Global Operations Analyst', color: '#437C94', desc: 'Global access across all regions' },
  fulfillment_mgr: { label: 'Plant Capacity Manager', color: '#4C825C', desc: 'Regional capacity and routing' },
  merchandiser:    { label: 'Restricted Production Planner', color: '#AA643B', desc: 'No regional operational rows' },
  viewer:          { label: 'Restricted Viewer', color: '#7A736E', desc: 'No regional operational rows' },
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
        const globalAdmin = data.find(u => u.USERNAME === 'admin_jess');
        if (globalAdmin) {
          setCurrentUser(globalAdmin);
          setApiUser(globalAdmin.USERNAME);
          return;
        }

        const restrictedViewer = data.find(u => u.USERNAME === 'viewer_sam');
        if (restrictedViewer) {
          setCurrentUser(restrictedViewer);
          setApiUser(restrictedViewer.USERNAME);
        }
      })
      .catch(err => {
        console.warn('Failed to load demo users:', err);
        // Fallback so app still works
        const fallback = { USERNAME: 'viewer_sam', FULL_NAME: 'Sam Rivera', ROLE: 'viewer', REGION: null };
        setCurrentUser(fallback);
        setApiUser('viewer_sam');
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
