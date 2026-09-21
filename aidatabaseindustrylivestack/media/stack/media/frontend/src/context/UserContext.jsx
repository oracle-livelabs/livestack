import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiUser } from '../utils/api';

const UserContext = createContext(null);
const DEFAULT_DEMO_USER = 'admin_jess';

const ROLE_META = {
  admin:           { label: 'Admin',           color: '#C74634', desc: 'Full access to all media data' },
  analyst:         { label: 'Audience Analyst', color: '#437C94', desc: 'Global read and analytics; no operational writes' },
  fulfillment_mgr: { label: 'Distribution Mgr', color: '#4C825C', desc: 'Regional rights capacity and coverage' },
  merchandiser:    { label: 'Campaign Planner', color: '#AA643B', desc: 'Content assets and audience signals' },
  viewer:          { label: 'Viewer',           color: '#7A736E', desc: 'Read-only access' },
};

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [identityError, setIdentityError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch users on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasRequestedIdentity = params.has('demoUser');
    const requestedUsername = params.get('demoUser');
    // Install the caller's exact query identity before the first API request.
    // The normal browser experience starts as Jessica Chen; an explicit empty
    // string remains a real header so Oracle/API can reject it fail-closed.
    setApiUser(hasRequestedIdentity ? requestedUsername : DEFAULT_DEMO_USER);

    api.users.list()
      .then(data => {
        setUsers(data);
        // An explicit URL persona wins; otherwise start with Jessica Chen so
        // dataset administration is immediately available. Oracle still
        // resolves and authorizes every API request independently.
        const requested = hasRequestedIdentity
          ? data.find(u => u.USERNAME === requestedUsername)
          : null;
        const defaultAdmin = data.find(u => u.USERNAME === DEFAULT_DEMO_USER)
          || data.find(u => u.ROLE === 'admin')
          || null;
        const restricted = data.find(u => u.USERNAME === 'viewer_sam')
          || data.find(u => u.ROLE === 'viewer')
          || null;
        if (hasRequestedIdentity && !requested) {
          setApiUser(null);
          setCurrentUser(null);
          setIdentityError({
            code: 'IDENTITY_REJECTED',
            requestedUsername,
          });
          window.dispatchEvent(new CustomEvent('media:identity-changed', {
            detail: {
              username: null,
              requestedUsername,
              state: 'IDENTITY_REJECTED',
            },
          }));
          return;
        }
        const initialUser = hasRequestedIdentity ? requested : (defaultAdmin || restricted);
        if (initialUser) {
          setIdentityError(null);
          setCurrentUser(initialUser);
          setApiUser(initialUser.USERNAME);
          window.dispatchEvent(new CustomEvent('media:identity-changed', {
            detail: {
              username: initialUser.USERNAME,
              state: 'IDENTITY_ACCEPTED',
            },
          }));
        }
      })
      .catch(err => {
        console.warn('Failed to load demo users:', err);
        if (hasRequestedIdentity) {
          setApiUser(null);
          setCurrentUser(null);
          setIdentityError({
            code: 'IDENTITY_REJECTED',
            requestedUsername,
          });
          window.dispatchEvent(new CustomEvent('media:identity-changed', {
            detail: {
              username: null,
              requestedUsername,
              state: 'IDENTITY_REJECTED',
            },
          }));
          return;
        }
        const fallback = { USERNAME: 'viewer_sam', FULL_NAME: 'Sam Taylor', ROLE: 'viewer', REGION: null };
        setIdentityError(null);
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
      window.dispatchEvent(new CustomEvent('media:identity-changed', {
        detail: { username: user.USERNAME },
      }));
    }
  }, [users]);

  if (loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center p-6"
        role="status"
        aria-live="polite"
        data-media-identity-state="IDENTITY_VALIDATING"
      >
        <div className="glass-card p-6 max-w-lg">
          <p className="text-sm font-semibold">Validating the requested Media persona…</p>
        </div>
      </main>
    );
  }

  if (identityError) {
    const requestedLabel = identityError.requestedUsername || '(explicit empty identity)';
    return (
      <main
        className="min-h-screen flex items-center justify-center p-6"
        role="alert"
        aria-live="assertive"
        data-media-identity-state="IDENTITY_REJECTED"
        data-media-identity-code={identityError.code}
      >
        <section className="glass-card p-6 max-w-lg border border-[var(--color-danger)]">
          <p className="text-sm font-semibold tone-red">Requested Media persona rejected</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-2">
            Oracle application context did not accept
            {' '}
            <code>{requestedLabel}</code>
            . No Viewer identity was substituted and no governed scene was opened.
          </p>
        </section>
      </main>
    );
  }

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
