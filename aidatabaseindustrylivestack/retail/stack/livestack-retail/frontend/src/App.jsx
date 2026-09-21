import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './utils/api';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import SocialFeed from './pages/SocialFeed';
import InfluencerGraph from './pages/InfluencerGraph';
import FulfillmentMap from './pages/FulfillmentMap';
import Orders from './pages/Orders';
import OMLAnalytics from './pages/OMLAnalytics';
import DataModel from './pages/DataModel';
import AskData from './pages/AskData';
import AdminEntry from './pages/AdminEntry';
import ReturnsIntelligence from './pages/ReturnsIntelligence';
import AgentConsole from './pages/AgentConsole';
import { OraclePanelProvider } from './context/OraclePanelContext';
import { UserProvider } from './context/UserContext';
import { RetailerProvider, useRetailerName } from './context/RetailerContext';
import RightOraclePanel from './components/RightOraclePanel';
import UserSwitcher from './components/UserSwitcher';
import { JetButton } from './components/JetControls';


class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.pageKey !== this.props.pageKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-card p-6 border border-[var(--color-border)]">
          <p className="section-kicker">Page render error</p>
          <h3 className="mt-2 text-lg font-semibold">The {this.props.pageTitle || this.props.pageKey} page failed to render.</h3>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {this.state.error?.message || 'Unknown frontend render error'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function normalizePageId(pageId) {
  return pageId;
}

const NAV_ITEMS = [
  { id: 'welcome', label: 'Welcome', iconClass: 'oj-fwk-icon oj-fwk-icon-info', features: [] },
  { id: 'datamodel', label: 'Data Foundation', iconClass: 'oj-fwk-icon oj-fwk-icon-folderhierarchy', features: [] },
  { id: 'dashboard', label: 'Retail Command Center', iconClass: 'oj-fwk-icon oj-fwk-icon-grid', features: ['Converged SQL', 'In-Memory'] },
  { id: 'social', label: 'Customer Trend Signals', iconClass: 'oj-fwk-icon oj-fwk-icon-sortrelevancehigh', features: ['Vector Search', 'VECTOR_DISTANCE', 'VPD'] },
  { id: 'graph', label: 'Creator Influence Network', iconClass: 'oj-fwk-icon oj-fwk-icon-node-expand', features: ['Property Graph', 'SQL/PGQ'] },
  { id: 'fulfillment', label: 'Intelligent Fulfillment Network', iconClass: 'oj-fwk-icon oj-fwk-icon-calendar-clock', features: ['Oracle Spatial', 'SDO_DISTANCE'] },
  { id: 'orders', label: 'Unified Order Intelligence', iconClass: 'oj-fwk-icon oj-fwk-icon-tree-document', features: ['JSON Duality', 'ACID', 'VPD'] },
  { id: 'returns', label: 'Returns Intelligence', iconClass: 'oj-fwk-icon oj-fwk-icon-list', features: ['Relational SQL', 'VPD', 'Transactions'] },
  { id: 'oml', label: 'Retail OML Analytics', iconClass: 'oj-fwk-icon oj-fwk-icon-view', features: ['DBMS_DATA_MINING', 'Prediction'] },
  { id: 'askdata', label: 'Ask Retail Data', iconClass: 'oj-fwk-icon oj-fwk-icon-magnifier', features: ['Natural Language SQL', 'Live Schema'] },
  { id: 'agents', label: 'Retail AI Agent Console', iconClass: 'oj-fwk-icon oj-fwk-icon-users', features: ['Agent Routing', 'VPD', 'Vector Search'] },
];

const PAGES = {
  datamodel: DataModel,
  dashboard: Dashboard,
  social: SocialFeed,
  graph: InfluencerGraph,
  fulfillment: FulfillmentMap,
  orders: Orders,
  returns: ReturnsIntelligence,
  oml: OMLAnalytics,
  askdata: AskData,
  agents: AgentConsole,
};

function resolveInitialPage() {
  if (typeof window === 'undefined') return 'welcome';
  const params = new URLSearchParams(window.location.search);
  const page = normalizePageId(params.get('page'));
  if (page === 'welcome') return 'welcome';
  return page && PAGES[page] ? page : 'welcome';
}

function OracleBrand() {
  const { retailerName } = useRetailerName();
  return (
    <button
      type="button"
      className="app-brand-lockup"
      onClick={() => window.location.reload()}
      aria-label={`Reload ${retailerName} LiveStack`}
    >
      <img className="app-brand-logo" src="/oracle-logo.svg" alt="Oracle" />
      <h1 className="app-brand-title">{retailerName} LiveStack</h1>
    </button>
  );
}

function FeatureTagList({ tags, variant = 'default', limit }) {
  const visibleTags = typeof limit === 'number' ? tags?.slice(0, limit) : tags;
  if (!visibleTags?.length) return null;
  return (
    <span className={`feature-tag-list feature-tag-list--${variant}`} aria-label="Oracle Database 26ai features">
      {visibleTags.map((tag) => (
        <span key={tag} className="feature-tag">{tag}</span>
      ))}
    </span>
  );
}

function RetailerNameTool() {
  const { retailerName, defaultRetailerName, isSaved, setRetailerName, resetRetailerName } = useRetailerName();
  const [isOpen, setIsOpen] = useState(false);
  const [draftName, setDraftName] = useState(retailerName);
  const [saveAcrossSessions, setSaveAcrossSessions] = useState(isSaved);

  useEffect(() => {
    setDraftName(retailerName);
    setSaveAcrossSessions(isSaved);
  }, [isSaved, retailerName]);

  const applyName = (event) => {
    event.preventDefault();
    setRetailerName(draftName, { save: saveAcrossSessions });
  };

  return (
    <div className="retailer-name-tool">
      <button
        type="button"
        className="retailer-name-tool__toggle"
        aria-expanded={isOpen}
        aria-controls="retailer-name-tool-panel"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="oj-fwk-icon oj-fwk-icon-user app-nav-icon" aria-hidden="true" />
        <span>Demo retailer name</span>
      </button>
      {isOpen && (
        <form id="retailer-name-tool-panel" className="retailer-name-tool__panel" onSubmit={applyName}>
          <label className="retailer-name-tool__label" htmlFor="retailer-name-input">Demo retailer name</label>
          <input
            id="retailer-name-input"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className="retailer-name-tool__input"
            placeholder={defaultRetailerName}
          />
          <label className="retailer-name-tool__checkbox">
            <input
              type="checkbox"
              checked={saveAcrossSessions}
              onChange={(event) => setSaveAcrossSessions(event.target.checked)}
            />
            <span>Save across sessions</span>
          </label>
          <div className="retailer-name-tool__actions">
            <button type="submit" className="retailer-name-tool__button">Apply</button>
            <button type="button" className="retailer-name-tool__button retailer-name-tool__button--ghost" onClick={resetRetailerName}>Reset</button>
          </div>
          <p className="retailer-name-tool__hint">Changes the visible demo retailer name only. Product, customer, creator, order, and SQL result values stay unchanged.</p>
        </form>
      )}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState(resolveInitialPage);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const [activeDataset, setActiveDataset] = useState(null);
  const [datasetRevision, setDatasetRevision] = useState(0);

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
    if (!activeDataset) return 'Seer Sporting Goods demo data loaded';
    const label = activeDataset.label || (activeDataset.source ? activeDataset.source.toUpperCase() : 'DEMO');
    const timestamp = activeDataset.updatedAt
      ? new Date(activeDataset.updatedAt).toLocaleString()
      : 'Unknown';
    return `${label} · ${timestamp}`;
  }, [activeDataset]);

  const activeNavItem = NAV_ITEMS.find(({ id }) => id === normalizePageId(activePage));
  const activePageTitle = activeNavItem?.label || 'Application';

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
      <RetailerProvider>
        <UserProvider>
          <OraclePanelProvider>
          <div className="app-shell">
            <aside className="app-sidebar">
              <div className="app-sidebar-header">
                <OracleBrand />
              </div>

              <nav className="app-nav" aria-label="Primary">
                {NAV_ITEMS.map(({ id, label, iconClass, features }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActivePage(id)}
                    className={`nav-link ${activePage === id ? 'active' : ''}`}
                  >
                    <span className={`${iconClass} oj-fwk-icon app-nav-icon`} aria-hidden="true" />
                    <span className="nav-link-copy nav-link__body">
                      <span className="nav-link-label">{label}</span>
                      <FeatureTagList tags={features} variant="nav" limit={2} />
                    </span>
                  </button>
                ))}
              </nav>

              <div className="app-sidebar-footer">
                <RetailerNameTool />
                <div className="app-sidebar-note">
                  <p className="app-sidebar-note__label">Active retail dataset</p>
                  <p className="app-sidebar-note__value" title={datasetLabel}>{datasetLabel}</p>
                </div>
                <UserSwitcher />
              </div>
            </aside>

            <div className="app-main">
              <header className="app-topbar">
                <div className="app-topbar-copy">
                  <h2 className="app-topbar-title">{activePageTitle}</h2>
                  <FeatureTagList tags={activeNavItem?.features} variant="topbar" limit={3} />
                </div>
                <JetButton
                  label="Use Your Own Retail Data"
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
                      const canonicalPage = normalizePageId(activePage);
                      const PageComponent = PAGES[canonicalPage];
                      if (!PageComponent) {
                        return (
                          <div className="glass-card p-6">
                            <p className="section-kicker">Navigation mapping issue</p>
                            <h3 className="mt-2 text-lg font-semibold">Missing page mapping for: {canonicalPage}</h3>
                            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                              The selected navigation item does not have a matching page component. Check NAV_ITEMS and PAGES in App.jsx.
                            </p>
                          </div>
                        );
                      }
                      const pageProps = canonicalPage === 'datamodel' ? { onNavigate: setActivePage } : {};
                      return (
                        <PageErrorBoundary key={`${canonicalPage}-${datasetRevision}`} pageKey={canonicalPage} pageTitle={activeNavItem?.label}>
                          <PageComponent {...pageProps} />
                        </PageErrorBoundary>
                      );
                    })()
                  )}
                </div>
              </main>
            </div>

            <RightOraclePanel />
          </div>

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
              setDatasetRevision((revision) => revision + 1);
              window.dispatchEvent(new CustomEvent('retail-dataset-revision'));
              setIsDatasetModalOpen(false);
            }}
          />
        </div>
      )}
          </OraclePanelProvider>
        </UserProvider>
      </RetailerProvider>
    </>
  );
}
