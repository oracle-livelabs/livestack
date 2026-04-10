import { useState } from 'react';
import {
  LayoutDashboard, TrendingUp, Network, MapPin, Bot,
  ShoppingCart, Package, Zap, Database, BrainCircuit, Home, Table2, MessageSquareText
} from 'lucide-react';
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
import { OraclePanelProvider } from './context/OraclePanelContext';
import { UserProvider } from './context/UserContext';
import RightOraclePanel from './components/RightOraclePanel';
import UserSwitcher from './components/UserSwitcher';

const NAV_ITEMS = [
  { id: 'welcome', label: 'Welcome', icon: Home },
  { id: 'datamodel', label: 'Schema & Data', icon: Table2 },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'social', label: 'Social Vector Trends', icon: TrendingUp },
  { id: 'graph', label: 'Influencer Graph', icon: Network },
  { id: 'fulfillment', label: 'Fulfillment Map', icon: MapPin },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'oml', label: 'OML Analytics', icon: BrainCircuit },
  { id: 'askdata', label: 'Ask Your Data', icon: MessageSquareText },
  { id: 'agents', label: 'Agent Console', icon: Bot },
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

export default function App() {
  const [activePage, setActivePage] = useState('welcome');

  return (
    <UserProvider>
    <OraclePanelProvider>
    <div className="h-screen flex overflow-hidden" style={{ background: '#161616' }}>
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[#161616] overflow-y-auto">
        <div className="p-5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActivePage('welcome')}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-oracle)] flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Social Commerce</h1>
              <p className="text-[10px] text-[var(--color-text-dim)] tracking-wide uppercase">
                Oracle 26ai Demo
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`nav-link w-full ${activePage === id ? 'active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* User Switcher (VPD Demo) */}
        <div className="p-3 border-t border-[var(--color-border)]">
          <UserSwitcher />
        </div>

        <div className="p-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
            <Database size={13} />
            <span>Converged Database</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {['Relational', 'JSON', 'Graph', 'Vector', 'Spatial', 'OML'].map(t => (
              <span key={t} className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                {t}
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-w-0" style={{ background: '#161616' }}>
        <div className="p-6">
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

      {/* Right Oracle Internals Panel */}
      <RightOraclePanel />
    </div>
    </OraclePanelProvider>
    </UserProvider>
  );
}
