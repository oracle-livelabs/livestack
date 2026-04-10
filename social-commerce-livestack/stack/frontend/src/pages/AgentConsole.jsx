import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Clock, CheckCircle, XCircle, AlertTriangle, Zap, Send, Loader2, MessageSquare, Wrench, Database, TrendingUp, Package, ShoppingCart, User, Sparkles, RotateCcw, ChevronDown, BrainCircuit, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

const STATUS_ICONS = {
  completed: <CheckCircle size={14} className="text-green-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
  proposed: <AlertTriangle size={14} className="text-yellow-400" />,
  executing: <Zap size={14} className="text-blue-400 animate-pulse" />,
};

const AGENT_COLORS = {
  trend_detection_agent: '#D4760A',
  inventory_agent: '#1B84ED',
  fulfillment_agent: '#2D9F5E',
  master_orchestrator: '#7B48A5',
  chat_agent: '#1AADA8',
};

const TEAM_INFO = {
  SOCIAL_TREND_TEAM: { label: 'Trend Agent', color: '#D4760A', icon: TrendingUp, desc: 'Social media trend analysis' },
  FULFILLMENT_TEAM:  { label: 'Fulfillment Agent', color: '#1B84ED', icon: Package, desc: 'Inventory & logistics' },
  COMMERCE_TEAM:     { label: 'Commerce Agent', color: '#2D9F5E', icon: ShoppingCart, desc: 'Orders & revenue' },
};

const EXAMPLE_QUESTIONS = [
  { text: 'What products are trending right now?', icon: TrendingUp, team: 'trends' },
  { text: 'Show me revenue breakdown by category', icon: ShoppingCart, team: 'commerce' },
  { text: 'Which products have low inventory?', icon: Package, team: 'fulfillment' },
  { text: 'What percentage of orders are social-driven?', icon: Sparkles, team: 'commerce' },
  { text: 'Find mega_viral posts in the last 24 hours', icon: Zap, team: 'trends' },
  { text: 'Check inventory for Neon Grid Hoodie', icon: Database, team: 'fulfillment' },
  { text: 'Find nearest fulfillment center with AirBud for a customer in Miami', icon: Navigation, team: 'fulfillment' },
];

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

// ── Fulfillment Route Map (rendered inside chat messages) ─────────────────────
function FulfillmentRouteMap({ routeData }) {
  const { customer, centers, product } = routeData;
  if (!customer || !centers || centers.length === 0) return null;

  // Calculate map bounds
  const allPoints = [
    [customer.lat, customer.lon],
    ...centers.map(c => [c.lat, c.lon]),
  ];
  const lats = allPoints.map(p => p[0]);
  const lons = allPoints.map(p => p[1]);
  const bounds = [[Math.min(...lats) - 1, Math.min(...lons) - 1], [Math.max(...lats) + 1, Math.max(...lons) + 1]];

  const best = centers[0];

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--color-border)]" style={{ background: 'rgba(0,0,0,0.2)' }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(27,132,237,0.08)', borderBottom: '1px solid rgba(27,132,237,0.2)' }}>
        <Navigation size={13} className="text-blue-400" />
        <span className="text-xs font-bold text-blue-300">Fulfillment Route — {product}</span>
        <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(45,159,94,0.15)', color: '#2D9F5E' }}>
          Best: {best.name} ({best.distance} mi)
        </span>
      </div>

      {/* Map */}
      <div style={{ height: 240 }}>
        <MapContainer bounds={bounds} style={{ height: '100%', width: '100%', borderRadius: 0 }}
          zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {/* Route lines from customer to each center */}
          {centers.map((c, i) => (
            <Polyline key={i}
              positions={[[customer.lat, customer.lon], [c.lat, c.lon]]}
              pathOptions={{
                color: i === 0 ? '#2D9F5E' : 'rgba(255,255,255,0.15)',
                weight: i === 0 ? 3 : 1,
                dashArray: i === 0 ? null : '6 4',
              }}
            />
          ))}

          {/* Fulfillment center markers */}
          {centers.map((c, i) => (
            <CircleMarker key={i}
              center={[c.lat, c.lon]}
              radius={i === 0 ? 8 : 5}
              pathOptions={{
                fillColor: i === 0 ? '#2D9F5E' : '#1B84ED',
                fillOpacity: i === 0 ? 0.9 : 0.5,
                color: i === 0 ? '#2D9F5E' : '#1B84ED',
                weight: i === 0 ? 2 : 1,
              }}>
              <MapTooltip permanent={i === 0} direction="top" offset={[0, -8]}
                className="route-map-tooltip">
                <div style={{ fontSize: 10, lineHeight: 1.4 }}>
                  <strong>{c.name}</strong><br />
                  {c.city}, {c.state}<br />
                  <span style={{ color: '#2D9F5E' }}>{c.stock} units</span> · {c.distance} mi
                </div>
              </MapTooltip>
            </CircleMarker>
          ))}

          {/* Customer marker */}
          <CircleMarker center={[customer.lat, customer.lon]} radius={7}
            pathOptions={{ fillColor: '#F59E0B', fillOpacity: 0.9, color: '#F59E0B', weight: 2 }}>
            <MapTooltip permanent direction="bottom" offset={[0, 8]}
              className="route-map-tooltip">
              <div style={{ fontSize: 10 }}>
                <strong>📍 Customer</strong><br />{customer.city}, {customer.state}
              </div>
            </MapTooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      {/* Legend / center list */}
      <div className="px-3 py-2 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
        {centers.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: i === 0 ? '#2D9F5E' : '#1B84ED', opacity: i === 0 ? 1 : 0.5 }} />
            <span className={`font-medium ${i === 0 ? 'text-green-400' : 'text-[var(--color-text-dim)]'}`}>
              {c.name}
            </span>
            <span className="text-[var(--color-text-dim)]">{c.city}, {c.state}</span>
            <span className="ml-auto font-mono text-[10px]" style={{ color: c.stock > 50 ? '#2D9F5E' : '#D4760A' }}>
              {c.stock} units
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-dim)]">{c.distance} mi</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Agent Component ─────────────────────────────────────────────────────
function ChatAgent({ onActionLogged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, time: new Date() }]);
    setSending(true);

    try {
      const result = await api.agents.chat(question);
      setMessages(prev => [...prev, {
        role: 'agent',
        text: result.response,
        team: result.team,
        intent: result.intent,
        agentUsed: result.agentUsed,
        toolsUsed: result.toolsUsed,
        data: result.data,
        elapsed: result.elapsed,
        time: new Date(),
      }]);
      if (onActionLogged) onActionLogged();
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'error',
        text: err.message,
        time: new Date(),
      }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, sending, onActionLogged]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setInput('');
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(6,182,212,0.25)' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(6,182,212,0.06)', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.2)' }}>
            <MessageSquare size={16} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Chat with AI Agents</h3>
            <p className="text-[10px] text-[var(--color-text-dim)]">
              Ask questions — auto-routed to <span className="text-yellow-400">Trend</span>, <span className="text-blue-400">Fulfillment</span>, or <span className="text-green-400">Commerce</span> agents
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat}
            className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--color-border)] hover:border-cyan-500/50 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors">
            <RotateCcw size={11} /> Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto min-h-[200px]"
        style={{ background: 'rgba(0,0,0,0.15)' }}>

        {/* Empty state — example questions */}
        {messages.length === 0 && (
          <div className="space-y-3 py-4">
            <div className="text-center mb-4">
              <Bot size={32} className="mx-auto mb-2 text-cyan-400/50" />
              <p className="text-sm text-[var(--color-text-dim)]">Ask me anything about your social commerce data</p>
              <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                Powered by <span className="text-purple-400">Ollama (llama3.2)</span> for reasoning + Oracle SQL and PL/SQL tools
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {EXAMPLE_QUESTIONS.map((eq, i) => {
                const EIcon = eq.icon;
                return (
                  <button key={i} onClick={() => sendMessage(eq.text)}
                    className="text-left p-2.5 rounded-lg border border-[var(--color-border)]/50 hover:border-cyan-500/40 transition-all text-xs group"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <EIcon size={12} className="text-cyan-400/60 group-hover:text-cyan-400 transition-colors" />
                      <span className="text-[9px] text-[var(--color-text-dim)] uppercase">{eq.team}</span>
                    </div>
                    <p className="text-[var(--color-text-dim)] group-hover:text-[var(--color-text)] transition-colors leading-relaxed">
                      {eq.text}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>
              {/* User message */}
              {msg.role === 'user' && (
                <div className="flex items-start gap-2 justify-end">
                  <div className="px-4 py-2.5 rounded-2xl rounded-br-md text-sm"
                    style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}>
                    {msg.text}
                  </div>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(6,182,212,0.2)' }}>
                    <User size={13} className="text-cyan-400" />
                  </div>
                </div>
              )}

              {/* Agent response */}
              {msg.role === 'agent' && (
                <div className="space-y-2">
                  {/* Team badge + timing */}
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${(TEAM_INFO[msg.team] || {}).color || '#C74634'}22` }}>
                      {(() => { const TI = (TEAM_INFO[msg.team] || {}).icon || Bot; return <TI size={13} style={{ color: (TEAM_INFO[msg.team] || {}).color || '#C74634' }} />; })()}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${(TEAM_INFO[msg.team] || {}).color || '#C74634'}22`, color: (TEAM_INFO[msg.team] || {}).color || '#C74634' }}>
                      {(TEAM_INFO[msg.team] || {}).label || msg.team}
                    </span>
                    {msg.agentUsed && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">OLLAMA ROUTED</span>
                    )}
                    <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">{msg.elapsed}ms</span>
                  </div>

                  {/* Response text */}
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                    {msg.text}
                  </div>

                  {/* Route map if present */}
                  {msg.data && msg.data.type === 'route' && (
                    <FulfillmentRouteMap routeData={msg.data} />
                  )}

                  {/* Data table if present */}
                  {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                    <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
                      <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[var(--color-surface)]">
                              {Object.keys(msg.data[0]).map(col => (
                                <th key={col} className="px-3 py-1.5 text-left text-[9px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider whitespace-nowrap border-b border-[var(--color-border)]">
                                  {col.replace(/_/g, ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.data.slice(0, 10).map((row, ri) => (
                              <tr key={ri} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface)]/30">
                                {Object.values(row).map((val, ci) => (
                                  <td key={ci} className="px-3 py-1.5 whitespace-nowrap font-mono">
                                    {val == null ? '—' : typeof val === 'number'
                                      ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2))
                                      : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tools used */}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.toolsUsed.map((t, ti) => (
                        <span key={ti} className="text-[9px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1"
                          style={{
                            background: t.status === 'success' ? 'rgba(45,159,94,0.1)' : t.status === 'fallback' ? 'rgba(212,118,10,0.1)' : 'rgba(199,70,52,0.1)',
                            color: t.status === 'success' ? '#2D9F5E' : t.status === 'fallback' ? '#D4760A' : '#C74634',
                            border: `1px solid ${t.status === 'success' ? 'rgba(45,159,94,0.2)' : t.status === 'fallback' ? 'rgba(212,118,10,0.2)' : 'rgba(199,70,52,0.2)'}`,
                          }}>
                          <Wrench size={9} /> {t.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {msg.role === 'error' && (
                <div className="px-4 py-2.5 rounded-lg text-sm text-red-400"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.2)' }}>
              <Bot size={13} className="text-purple-400" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-[var(--color-text-dim)]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
              <Loader2 size={14} className="animate-spin text-purple-400" />
              Agent thinking…
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-5 py-3" style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--color-border)' }}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder="Ask the agent runtime a question…"
            className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
          />
          <button onClick={() => sendMessage()} disabled={sending || !input.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            style={{ background: 'linear-gradient(135deg, #1AADA8, #C74634)', color: '#fff' }}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Color palette for profiles (rotates for unknown profiles)
const PROFILE_COLORS = ['#D4760A', '#7B48A5', '#1AADA8', '#C74634', '#3B82F6', '#2D9F5E'];
const PROFILE_COLOR_MAP = {
  SC_COHERE_PROFILE: '#D4760A',
  SC_LLAMA_PROFILE:  '#7B48A5',
  SC_VISION_PROFILE: '#1AADA8',
  SC_GROK42_PROFILE: '#C74634',
  SC_EMBED_PROFILE:  '#3B82F6',
};

export default function AgentConsole() {
  const [activeProfile, setActiveProfile] = useState('SC_LLAMA_PROFILE');
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInfo, setProfileInfo] = useState({});
  const profileRef = useRef(null);

  const { data: actions, refetch: refetchActions } = useData(() => api.agents.actions({ limit: 3 }));
  // Fetch profiles from DB on mount
  useEffect(() => {
    api.agents.profiles().then(data => {
      if (data?.activeProfile) {
        // Clean up the profile name (remove schema prefix if present)
        const clean = data.activeProfile.replace(/^".*"\."?|"$/g, '');
        setActiveProfile(clean);
      }
      // Build profileInfo from DB results
      const info = {};
      (data?.profiles || [])
        .filter(p => p.name.startsWith('SC_') && p.status === 'ENABLED' && p.name !== 'SC_EMBED_PROFILE')
        .forEach((p, i) => {
          const label = p.model || getProfileDisplayLabel(p.name, i);
          info[p.name] = {
            label,
            short: label,
            color: PROFILE_COLOR_MAP[p.name] || PROFILE_COLORS[i % PROFILE_COLORS.length],
            type: p.type || p.description || 'Runtime profile',
          };
        });
      if (Object.keys(info).length) setProfileInfo(info);
    }).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const switchProfile = useCallback(async (profileName) => {
    if (profileName === activeProfile || profileSwitching) return;
    setProfileSwitching(true);
    setProfileOpen(false);
    try {
      await api.agents.setProfile(profileName);
      setActiveProfile(profileName);
    } catch (err) {
      console.error('Failed to switch profile:', err);
    } finally {
      setProfileSwitching(false);
    }
  }, [activeProfile, profileSwitching]);

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Agent Console">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              These agent workflows run through the application layer, with <span className="text-purple-400 font-mono">Ollama (llama3.2)</span> handling reasoning
              and Oracle Database executing SQL and PL/SQL tools against live data. Three specialist teams (<code className="text-yellow-300 text-xs">SOCIAL_TREND_TEAM</code>,&nbsp;
              <code className="text-blue-300 text-xs">FULFILLMENT_TEAM</code>, <code className="text-green-300 text-xs">COMMERCE_TEAM</code>) route work across
              trend analysis, fulfillment, and commerce tasks. Oracle stores the source data, runs the queries, and records decisions in
              <code className="text-pink-300 text-xs"> agent_actions</code> and <code className="text-pink-300 text-xs">event_stream</code>;
              the AI runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label="llama3.2" color="pink" />
            <FeatureBadge label="Oracle SQL / PL/SQL Tools" color="orange" />
            <FeatureBadge label="Application Orchestration" color="blue" />
            <FeatureBadge label="agent_actions (Audit Log)" color="blue" />
            <FeatureBadge label="event_stream (Native JSON)" color="yellow" />
            <FeatureBadge label="Vector RAG Retrieval" color="cyan" />
            <FeatureBadge label="In-DB ML Scoring" color="green" />
          </div>
          <SqlBlock code={`-- Agent runtime: app orchestration + Ollama + Oracle Database
-- The app resolves intent -> routes to a specialist team -> executes SQL / PL/SQL in Oracle
-- Ollama (llama3.2) provides reasoning; Oracle remains the data and execution layer

-- Example flow:
-- 1. Classify the request as SOCIAL_TREND_TEAM
-- 2. Call detect_trending_products(p_hours=>24)
-- 3. Join inventory and fulfillment data in Oracle
-- 4. Return recommendations and write actions to audit tables

-- Agent decisions written back atomically:
INSERT INTO agent_actions (agent_name, action_type, entity_type,
  entity_id, decision_payload, confidence, execution_status)
VALUES ('trend_detection_agent','reorder_flag','product',
  :product_id, :json_payload, 0.92, 'proposed');`} />
          {/* Team / Agent / Tools grid */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Teams &amp; Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { team: 'SOCIAL_TREND_TEAM', agent: 'TREND_AGENT', tools: ['TREND_SQL_TOOL', 'DETECT_TRENDS_TOOL', 'INFLUENCER_NETWORK_TOOL', 'LOG_DECISION_TOOL'], color: '#D4549A' },
                { team: 'FULFILLMENT_TEAM', agent: 'FULFILLMENT_AGENT', tools: ['COMMERCE_SQL_TOOL', 'CHECK_INVENTORY_TOOL', 'FULFILLMENT_ROUTE_TOOL', 'LOG_DECISION_TOOL'], color: '#D4760A' },
                { team: 'COMMERCE_TEAM', agent: 'COMMERCE_AGENT', tools: ['COMMERCE_SQL_TOOL', 'LOG_DECISION_TOOL'], color: '#2D9F5E' },
              ].map(t => (
                <div key={t.team} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <div className="px-2 py-1.5 text-center" style={{ background: `${t.color}12`, borderBottom: `2px solid ${t.color}44` }}>
                    <p className="text-[9px] font-semibold font-mono" style={{ color: t.color }}>{t.team}</p>
                  </div>
                  <div className="p-2 space-y-1.5">
                    <span className="text-[9px] font-mono font-semibold text-[var(--color-text)]">{t.agent}</span>
                    <div className="space-y-0.5">
                      {t.tools.map(tool => (
                        <div key={tool} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                          {tool}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-[9px] text-[var(--color-text-dim)] mt-2">
              <span><strong className="text-[var(--color-text)]">1</strong> Runtime Profile</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">7</strong> Tools</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">3</strong> Agents</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">3</strong> Tasks</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">3</strong> Teams</span>
            </div>
          </div>

          {/* Architecture flow */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Architecture</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="Viral Signal Detected" sub="social_posts · virality_score >= 75" color="#D4760A" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="SOCIAL_TREND_TEAM" sub="Ollama reasoning + tool routing" color="#7B48A5" />
              <div className="text-center text-[var(--color-text-dim)]">↓ calls PL/SQL tool</div>
              <DiagramBox label="detect_trending_products()" sub="Vector match · Graph centrality" color="#D4549A" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="FULFILLMENT_TEAM" sub="Inventory check · reorder logic" color="#1B84ED" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="COMMERCE_TEAM" sub="Pricing · promotions · routing" color="#2D9F5E" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="agent_actions + event_stream" sub="Audit trail · JSON events" color="#1AADA8" />
            </div>
            <div className="rounded-lg p-2 text-[9px] mt-2" style={{ background: 'rgba(123,72,165,0.08)', border: '1px dashed rgba(123,72,165,0.3)', color: '#B89AD4' }}>
              <span className="font-semibold">Why keep Oracle in the loop?</span><br/>
              Ollama handles reasoning, but Oracle still owns the live data, SQL execution, PL/SQL tools, and durable action logging.
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="text-purple-400" /> Agent Orchestration Console
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Agent teams use <span className="text-purple-400">Ollama</span> for reasoning and Oracle for data, SQL execution, and action logging
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Profile Selector */}
          <div className="relative" ref={profileRef}>
            <button onClick={() => setProfileOpen(!profileOpen)}
              disabled={profileSwitching}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border"
              style={{
                background: `${(profileInfo[activeProfile]?.color || '#7B48A5')}12`,
                borderColor: `${(profileInfo[activeProfile]?.color || '#7B48A5')}40`,
                color: profileInfo[activeProfile]?.color || '#7B48A5',
              }}>
              {profileSwitching ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <BrainCircuit size={13} />
              )}
              <span className="hidden sm:inline">{profileInfo[activeProfile]?.short || 'Runtime Profile'}</span>
              <span className="text-[9px] opacity-60 hidden md:inline">({profileInfo[activeProfile]?.type || 'Runtime'})</span>
              <ChevronDown size={11} className={`transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl overflow-hidden shadow-2xl z-50"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]"
                  style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--color-border)' }}>
                  Runtime Profile
                </div>
                {Object.entries(profileInfo).map(([name, info]) => {
                  const isActive = name === activeProfile;
                  return (
                    <button key={name} onClick={() => switchProfile(name)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-[var(--color-surface-hover)]"
                      style={isActive ? { background: `${info.color}12` } : {}}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${info.color}22` }}>
                        <BrainCircuit size={14} style={{ color: info.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: isActive ? info.color : 'var(--color-text)' }}>
                            {info.label}
                          </span>
                          {isActive && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: `${info.color}25`, color: info.color }}>
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-dim)]">{info.type}</div>
                        <div className="text-[9px] font-mono text-[var(--color-text-dim)] opacity-60 truncate">Ollama + Oracle SQL</div>
                      </div>
                    </button>
                  );
                })}
                <div className="px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono"
                  style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--color-border)' }}>
                  Active runtime: Ollama (llama3.2)
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Chat Agent ── */}
      <ChatAgent onActionLogged={() => { refetchActions(); }} />

      {/* Recent Actions Feed (last 3) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Clock size={14} /> Recent Agent Actions
        </h3>
        <div className="space-y-2">
          {(actions || []).slice(0, 3).map(a => {
            let payload = null;
            try { payload = typeof a.DECISION_PAYLOAD === 'string' ? JSON.parse(a.DECISION_PAYLOAD) : a.DECISION_PAYLOAD; } catch {}

            return (
              <div key={a.ACTION_ID} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors">
                {STATUS_ICONS[a.EXECUTION_STATUS] || <Clock size={14} className="text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{a.ACTION_TYPE.replace(/_/g, ' ')}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${AGENT_COLORS[a.AGENT_NAME] || '#666'}22`,
                        color: AGENT_COLORS[a.AGENT_NAME] || '#999'
                      }}>
                      {a.AGENT_NAME.replace(/_/g, ' ')}
                    </span>
                    {a.ENTITY_TYPE && (
                      <span className="text-[10px] text-[var(--color-text-dim)]">{a.ENTITY_TYPE} #{a.ENTITY_ID}</span>
                    )}
                  </div>
                  {payload && (
                    <p className="text-xs text-[var(--color-text-dim)] mt-0.5 truncate max-w-lg">
                      {payload.reason || payload.product_name || payload.strategy || JSON.stringify(payload).slice(0, 120)}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(a.CREATED_AT)}</span>
                  <p className="text-[10px] text-[var(--color-text-dim)]">{(a.CONFIDENCE * 100).toFixed(0)}% conf</p>
                </div>
              </div>
            );
          })}
          {(!actions || actions.length === 0) && (
            <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No agent actions yet. Run a cycle to get started.</p>
          )}
        </div>
      </div>

    </div>
  );
}
