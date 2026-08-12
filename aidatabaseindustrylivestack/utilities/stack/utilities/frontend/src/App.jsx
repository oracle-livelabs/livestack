import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './utils/api';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import SocialFeed from './pages/SocialFeed';
import InfluencerGraph from './pages/InfluencerGraph';
import FulfillmentMap from './pages/FulfillmentMap';
import AgentConsole from './pages/AgentConsole';
import Orders from './pages/Orders';
import OMLAnalytics from './pages/OMLAnalytics';
import DataModel from './pages/DataModel';
import AskData from './pages/AskData';
import AdminEntry from './pages/AdminEntry';
import { OraclePanelProvider } from './context/OraclePanelContext';
import { UserProvider } from './context/UserContext';
import RightOraclePanel from './components/RightOraclePanel';
import UserSwitcher from './components/UserSwitcher';
import { JetButton } from './components/JetControls';
import { CUSTOMER_DOMAIN, CUSTOMER_NAME, CUSTOMER_SHORT_NAME } from './config/customer';

const CUSTOMER_STORAGE_KEY = 'utilitiesLivestack.customerName';
const CUSTOMER_ALIASES = [
  'Seer Utility Network',
  'Seer Energy & Utilities',
  'Seer Energy Operations',
  'Seer Utility',
];
const REPLACEABLE_ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
const DOM_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

const NAV_ITEMS = [
  { id: 'welcome', label: 'Welcome', iconClass: 'oj-fwk-icon oj-fwk-icon-info', featureTags: [] },
  { id: 'datamodel', label: 'Data Foundation', iconClass: 'oj-fwk-icon oj-fwk-icon-folderhierarchy', featureTags: [] },
  { id: 'dashboard', label: 'Energy Operations Command Center', iconClass: 'oj-fwk-icon oj-fwk-icon-grid', featureTags: ['In-Memory', 'Native JSON'] },
  { id: 'social', label: 'Reliability, Production & Compliance Signals', iconClass: 'oj-fwk-icon oj-fwk-icon-sortrelevancehigh', featureTags: ['Vector Search', 'VPD'] },
  { id: 'graph', label: 'Operational Event Graph', iconClass: 'oj-fwk-icon oj-fwk-icon-node-expand', featureTags: ['Property Graph', 'SQL/PGQ'] },
  { id: 'fulfillment', label: 'Field Operations Logistics Map', iconClass: 'oj-fwk-icon oj-fwk-icon-calendar-clock', featureTags: ['Oracle Spatial', 'VPD'] },
  { id: 'orders', label: 'Utility Service Requests', iconClass: 'oj-fwk-icon oj-fwk-icon-tree-document', featureTags: ['JSON Duality', 'VPD'] },
  { id: 'oml', label: 'Asset Risk & Capacity Analytics', iconClass: 'oj-fwk-icon oj-fwk-icon-view', featureTags: ['OML', 'Vector K-Means'] },
  { id: 'askdata', label: 'Ask Energy & Utilities Data', iconClass: 'oj-fwk-icon oj-fwk-icon-magnifier', featureTags: ['Natural Language SQL', 'Live Schema'] },
  { id: 'agents', label: 'Energy & Utilities AI Agent Console', iconClass: 'oj-fwk-icon oj-fwk-icon-users', featureTags: ['PL/SQL Tools', 'JSON Audit'] },
];

const PAGES = {
  datamodel: DataModel,
  dashboard: Dashboard,
  social: SocialFeed,
  graph: InfluencerGraph,
  fulfillment: FulfillmentMap,
  agents: AgentConsole,
  orders: Orders,
  oml: OMLAnalytics,
  askdata: AskData,
};

function resolveInitialPage() {
  if (typeof window === 'undefined') return 'welcome';
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  if (page === 'welcome') return 'welcome';
  return page && PAGES[page] ? page : 'welcome';
}

function normalizeCustomerName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || CUSTOMER_NAME;
}

function deriveShortName(customerName) {
  if (customerName === CUSTOMER_NAME) return CUSTOMER_SHORT_NAME;
  return customerName.split(/\s+/)[0] || CUSTOMER_SHORT_NAME;
}

function deriveDomain(customerName) {
  if (customerName === CUSTOMER_NAME) return CUSTOMER_DOMAIN;
  const slug = customerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'customer';
  return `${slug}.example`;
}

function makeCustomerProfile(customerName) {
  const normalized = normalizeCustomerName(customerName);
  return {
    customerName: normalized,
    customerShortName: deriveShortName(normalized),
    customerDomain: deriveDomain(normalized),
    isDefault: normalized === CUSTOMER_NAME,
  };
}

function escapeRegExp(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function hasReplaceableCustomerTerms(value) {
  if (typeof value !== 'string' || !value) return false;
  if (/\bseer-health\.example\b/i.test(value) || /\bseer-equity\.example\b/i.test(value)) return true;
  if (/\bSeer\b/.test(value)) return true;
  return CUSTOMER_ALIASES.some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(value));
}

function replaceCustomerTerms(value, profile) {
  if (typeof value !== 'string' || profile.isDefault) return value;
  let next = value.replace(/\bseer-health\.example\b/gi, profile.customerDomain);
  next = next.replace(/\bseer-equity\.example\b/gi, profile.customerDomain);
  for (const alias of CUSTOMER_ALIASES) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g'), profile.customerName);
  }
  next = next.replace(/\bSeer\b/g, profile.customerShortName);
  return next;
}

function loadInitialCustomerName() {
  if (typeof window === 'undefined') return CUSTOMER_NAME;
  return normalizeCustomerName(window.localStorage.getItem(CUSTOMER_STORAGE_KEY) || CUSTOMER_NAME);
}

function useCustomerTextReplacement(profile, dependencyKey) {
  const textOriginalsRef = useRef(new WeakMap());
  const attrOriginalsRef = useRef(new WeakMap());

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const textOriginals = textOriginalsRef.current;
    const attrOriginals = attrOriginalsRef.current;

    const replaceTextNode = (node) => {
      const parent = node.parentElement;
      if (!parent || DOM_SKIP_TAGS.has(parent.tagName)) return;

      if (profile.isDefault) {
        if (textOriginals.has(node)) {
          const original = textOriginals.get(node);
          if (node.nodeValue !== original) node.nodeValue = original;
          textOriginals.delete(node);
        }
        return;
      }

      let original = textOriginals.get(node);
      if (original === undefined) {
        original = node.nodeValue || '';
        if (!hasReplaceableCustomerTerms(original)) return;
        textOriginals.set(node, original);
      }

      const next = replaceCustomerTerms(original, profile);
      if (node.nodeValue !== next) node.nodeValue = next;
    };

    const replaceAttributes = (element) => {
      if (!element || DOM_SKIP_TAGS.has(element.tagName)) return;
      let originals = attrOriginals.get(element);

      for (const attribute of REPLACEABLE_ATTRIBUTES) {
        if (!element.hasAttribute(attribute)) continue;

        if (profile.isDefault) {
          if (originals && attribute in originals) {
            const original = originals[attribute];
            if (element.getAttribute(attribute) !== original) element.setAttribute(attribute, original);
            delete originals[attribute];
          }
          continue;
        }

        if (!originals) {
          originals = {};
          attrOriginals.set(element, originals);
        }

        if (!(attribute in originals)) {
          const current = element.getAttribute(attribute) || '';
          if (!hasReplaceableCustomerTerms(current)) continue;
          originals[attribute] = current;
        }

        const next = replaceCustomerTerms(originals[attribute], profile);
        if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
      }
    };

    const applyReplacement = (root = document.body) => {
      if (!root) return;
      if (root.nodeType === Node.TEXT_NODE) {
        replaceTextNode(root);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

      if (root.nodeType === Node.ELEMENT_NODE) replaceAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) replaceTextNode(node);
        if (node.nodeType === Node.ELEMENT_NODE) replaceAttributes(node);
        node = walker.nextNode();
      }
    };

    let scheduled = false;
    const scheduleReplacement = () => {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        applyReplacement(document.getElementById('root') || document.body);
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
      } else {
        window.setTimeout(run, 0);
      }
    };

    applyReplacement(document.getElementById('root') || document.body);
    const target = document.getElementById('root') || document.body;
    const observer = new MutationObserver(scheduleReplacement);
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [profile.customerName, profile.customerShortName, profile.customerDomain, profile.isDefault, dependencyKey]);
}

function OracleBrand({ profile }) {
  const title = replaceCustomerTerms(`${CUSTOMER_NAME} LiveStack`, profile);
  return (
    <button
      type="button"
      className="app-brand-lockup"
      onClick={() => window.location.reload()}
      aria-label={`Reload ${title}`}
    >
      <img className="app-brand-logo" src="/oracle-logo.svg" alt="Oracle" />
      <h1 className="app-brand-title">{title}</h1>
    </button>
  );
}

function FeatureTagList({ tags, variant = 'default' }) {
  if (!tags?.length) return null;
  return (
    <span className={`feature-tag-list feature-tag-list--${variant}`} aria-label="Oracle Database 26ai features">
      {tags.map((tag) => (
        <span key={tag} className="feature-tag">{tag}</span>
      ))}
    </span>
  );
}

function CustomerNameTool({ customerName, savedAcrossSessions, onApply }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(customerName);
  const [persist, setPersist] = useState(savedAcrossSessions);

  useEffect(() => {
    setDraft(customerName);
    setPersist(savedAcrossSessions);
  }, [customerName, savedAcrossSessions]);

  const submit = (event) => {
    event.preventDefault();
    onApply(draft, persist);
  };

  return (
    <div className="customer-name-tool">
      <button
        type="button"
        className="customer-name-tool__toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="oj-fwk-icon oj-fwk-icon-user app-nav-icon" aria-hidden="true" />
        <span>Customer name</span>
      </button>
      {isOpen && (
        <form className="customer-name-tool__panel" onSubmit={submit}>
          <label className="customer-name-tool__label" htmlFor="customer-name-input">Replace demo customer</label>
          <input
            id="customer-name-input"
            className="customer-name-tool__input"
            value={draft}
            placeholder={CUSTOMER_NAME}
            onChange={(event) => setDraft(event.target.value)}
          />
          <label className="customer-name-tool__check">
            <input
              type="checkbox"
              checked={persist}
              onChange={(event) => setPersist(event.target.checked)}
            />
            <span>Save across sessions</span>
          </label>
          <div className="customer-name-tool__actions">
            <button type="submit" className="customer-name-tool__apply">Apply</button>
            <button
              type="button"
              className="customer-name-tool__reset"
              onClick={() => {
                setDraft(CUSTOMER_NAME);
                setPersist(false);
                onApply(CUSTOMER_NAME, false);
              }}
            >
              Reset
            </button>
          </div>
          <p className="customer-name-tool__hint">Replaces visible Seer Utility, Seer Energy & Utilities, Seer Energy Operations, and Seer labels. Seed-data participants such as NorthStar Utility Operations remain part of the demo ecosystem.</p>
        </form>
      )}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState(resolveInitialPage);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const [activeDataset, setActiveDataset] = useState(null);
  const [customerName, setCustomerName] = useState(loadInitialCustomerName);
  const [savedAcrossSessions, setSavedAcrossSessions] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.localStorage.getItem(CUSTOMER_STORAGE_KEY))
  ));

  const customerProfile = useMemo(() => makeCustomerProfile(customerName), [customerName]);

  const applyCustomerName = useCallback((nextName, persist) => {
    const normalized = normalizeCustomerName(nextName);
    const shouldPersist = Boolean(persist && normalized !== CUSTOMER_NAME);
    setCustomerName(normalized);
    setSavedAcrossSessions(shouldPersist);
    if (typeof window !== 'undefined') {
      if (shouldPersist) {
        window.localStorage.setItem(CUSTOMER_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(CUSTOMER_STORAGE_KEY);
      }
    }
  }, []);

  const refreshActiveDataset = useCallback(async () => {
    try {
      const data = await api.import.dataset();
      setActiveDataset(data?.activeDataset || null);
    } catch {
      setActiveDataset(null);
    }
  }, []);

  useEffect(() => {
    refreshActiveDataset();
  }, [refreshActiveDataset]);

  const datasetLabel = useMemo(() => {
    if (!activeDataset) return `${customerProfile.customerName} demo data loaded`;
    const label = activeDataset.label || (activeDataset.source ? activeDataset.source.toUpperCase() : 'DEMO');
    const timestamp = activeDataset.updatedAt
      ? new Date(activeDataset.updatedAt).toLocaleString()
      : 'Unknown';
    return `${replaceCustomerTerms(label, customerProfile)} · ${timestamp}`;
  }, [activeDataset, customerProfile]);

  const activeNavItem = NAV_ITEMS.find(({ id }) => id === activePage);
  const activePageTitle = replaceCustomerTerms(activeNavItem?.label || 'Application', customerProfile);
  const replacementDependency = `${activePage}:${activeDataset?.updatedAt || 'dataset'}:${customerName}`;

  useCustomerTextReplacement(customerProfile, replacementDependency);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (activePage === 'welcome') {
      params.delete('page');
    } else {
      params.set('page', activePage);
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [activePage]);

  return (
    <>
      <UserProvider>
        <OraclePanelProvider>
          <div className="app-shell">
            <aside className="app-sidebar">
              <div className="app-sidebar-header">
                <OracleBrand profile={customerProfile} />
              </div>

              <nav className="app-nav" aria-label="Primary">
                {NAV_ITEMS.map(({ id, label, iconClass, featureTags }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActivePage(id)}
                    className={`nav-link ${activePage === id ? 'active' : ''}`}
                  >
                    <span className={`${iconClass} oj-fwk-icon app-nav-icon`} aria-hidden="true" />
                    <span className="nav-link__body">
                      <span>{replaceCustomerTerms(label, customerProfile)}</span>
                      <FeatureTagList tags={featureTags?.slice(0, 2)} variant="nav" />
                    </span>
                  </button>
                ))}
              </nav>

              <div className="app-sidebar-footer">
                <CustomerNameTool
                  customerName={customerName}
                  savedAcrossSessions={savedAcrossSessions}
                  onApply={applyCustomerName}
                />
                <div className="app-sidebar-note">
                  <p className="app-sidebar-note__label">Active dataset</p>
                  <p className="app-sidebar-note__value">{datasetLabel}</p>
                </div>
                <UserSwitcher />
              </div>
            </aside>

            <div className="app-main">
              <header className="app-topbar">
                <div className="app-topbar-copy">
                  <h2 className="app-topbar-title">{activePageTitle}</h2>
                  <FeatureTagList tags={activeNavItem?.featureTags} variant="topbar" />
                </div>
                <JetButton
                  label="Use Your Own Utility Data"
                  iconClass="oj-fwk-icon oj-fwk-icon-tree-document"
                  chroming="outlined"
                  className="app-topbar-action"
                  onAction={() => setIsDatasetModalOpen(true)}
                />
              </header>

              <main className="app-content">
                <div className="app-page-frame">
                  {activePage === 'welcome' ? (
                    <Welcome onNavigate={setActivePage} />
                  ) : (
                    (() => {
                      const PageComponent = PAGES[activePage];
                      if (!PageComponent) return null;
                      const pageProps = activePage === 'datamodel' ? { onNavigate: setActivePage } : {};
                      return <PageComponent {...pageProps} />;
                    })()
                  )}
                </div>
              </main>
            </div>

            <RightOraclePanel />
          </div>
        </OraclePanelProvider>
      </UserProvider>

      {isDatasetModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dataset-tool-title"
        >
          <div className="absolute inset-0 surface-bark-overlay" onClick={() => setIsDatasetModalOpen(false)} />
          <AdminEntry
            mode="overlay"
            activeDataset={activeDataset}
            onClose={() => setIsDatasetModalOpen(false)}
            onDatasetChanged={() => {
              void refreshActiveDataset();
              setIsDatasetModalOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}
