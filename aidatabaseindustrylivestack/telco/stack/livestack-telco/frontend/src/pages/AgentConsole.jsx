import { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/TelcoStory';

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

const STATUS_ICONS = {
  completed: { iconClass: 'oj-fwk-icon-checkmark', className: 'tone-pine' },
  failed: { iconClass: 'oj-fwk-icon-message-error', className: 'tone-red' },
  proposed: { iconClass: 'oj-fwk-icon-message-warning', className: 'tone-sienna' },
  executing: { iconClass: 'oj-fwk-icon-sortrelevancehigh', className: 'tone-ocean animate-pulse' },
};

const AGENT_COLORS = {
  trend_detection_agent: '#AA643B',
  inventory_agent: '#437C94',
  fulfillment_agent: '#4C825C',
  master_orchestrator: '#796087',
  chat_agent: '#4F7D7B',
};

const TEAM_INFO = {
  CARE_SIGNAL_TEAM: { label: 'Signal Agent', color: '#AA643B', iconClass: 'oj-fwk-icon-sortrelevancehigh', desc: 'Subscriber and network signal analysis' },
  CARE_ACCESS_TEAM:  { label: 'Network Access Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Capacity and network-site routing' },
  CARE_OPERATIONS_TEAM:     { label: 'Subscriber Operations Agent', color: '#4C825C', iconClass: 'oj-fwk-icon-grid', desc: 'Service orders and service revenue' },
};

const EXAMPLE_QUESTIONS = [
  { text: 'Which telecom services are seeing the highest demand right now?', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'trends' },
  { text: 'Show me service revenue by service category', iconClass: 'oj-fwk-icon-grid', team: 'operations' },
  { text: 'Which telecom services have low capacity?', iconClass: 'oj-fwk-icon-tree-document', team: 'access' },
  { text: 'What percentage of service orders are subscriber-signal-driven?', iconClass: 'oj-fwk-icon-info', team: 'operations' },
  { text: 'Find high-priority subscriber signals in the last 24 hours', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'trends' },
  { text: 'Check capacity for 5G Unlimited Mobile Plan', iconClass: 'oj-fwk-icon-tree-document', team: 'access' },
  { text: 'Find nearest network site with same-day device-support slots for a subscriber in Miami', iconClass: 'oj-fwk-icon-arrowtail-e', team: 'access' },
];

const AGENT_CHAT_STORAGE_PREFIX = 'telecomLivestack.agentConsole.v2';
const MAX_PERSISTED_MESSAGES = 30;

function agentChatStorageKey(username) {
  return `${AGENT_CHAT_STORAGE_PREFIX}.${username || 'anonymous'}`;
}

function restoreAgentConversation(username) {
  if (typeof window === 'undefined' || !username) return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(agentChatStorageKey(username)) || 'null');
    if (!saved || !Array.isArray(saved.messages)) return [];
    return saved.messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
      ...message,
      time: message.time ? new Date(message.time) : new Date(),
    }));
  } catch (_) {
    return [];
  }
}

function buildAgentHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'agent')
    .slice(-12)
    .map((message) => ({
      role: message.role === 'agent' ? 'assistant' : 'user',
      text: message.text || '',
      team: message.team || null,
      intent: message.intent || null,
    }));
}

function persistableAgentMessages(messages) {
  return messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
    ...message,
    data: Array.isArray(message.data) ? message.data.slice(0, 10) : message.data,
    time: message.time instanceof Date ? message.time.toISOString() : message.time,
  }));
}

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

// ── Network Access Route Map (rendered inside chat messages) ─────────────────────
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
    <div className="rounded-xl overflow-hidden border border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(67,124,148,0.08)', borderBottom: '1px solid rgba(67,124,148,0.2)' }}>
        <JetGlyph iconClass="oj-fwk-icon-arrowtail-e" className="tone-ocean" />
        <span className="text-xs font-bold tone-ocean">Network Access Route - {product}</span>
        <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(76,130,92,0.15)', color: '#4C825C' }}>
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
                color: i === 0 ? '#4C825C' : 'rgba(255,255,255,0.15)',
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
                fillColor: i === 0 ? '#4C825C' : '#437C94',
                fillOpacity: i === 0 ? 0.9 : 0.5,
                color: i === 0 ? '#4C825C' : '#437C94',
                weight: i === 0 ? 2 : 1,
              }}>
              <MapTooltip permanent={i === 0} direction="top" offset={[0, -8]}
                className="route-map-tooltip">
                <div style={{ fontSize: 10, lineHeight: 1.4 }}>
                  <strong>{c.name}</strong><br />
                  {c.city}, {c.state}<br />
                  <span style={{ color: '#4C825C' }}>{c.stock} capacity units</span> · {c.distance} mi
                </div>
              </MapTooltip>
            </CircleMarker>
          ))}

          {/* Subscriber marker */}
          <CircleMarker center={[customer.lat, customer.lon]} radius={7}
            pathOptions={{ fillColor: '#AA643B', fillOpacity: 0.9, color: '#AA643B', weight: 2 }}>
            <MapTooltip permanent direction="bottom" offset={[0, 8]}
              className="route-map-tooltip">
              <div style={{ fontSize: 10 }}>
                <strong>Subscriber</strong><br />{customer.city}, {customer.state}
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
              style={{ background: i === 0 ? '#4C825C' : '#437C94', opacity: i === 0 ? 1 : 0.5 }} />
            <span className={`font-medium ${i === 0 ? 'tone-pine' : 'text-[var(--color-text-dim)]'}`}>
              {c.name}
            </span>
            <span className="text-[var(--color-text-dim)]">{c.city}, {c.state}</span>
            <span className="ml-auto font-mono text-[10px]" style={{ color: c.stock > 50 ? '#4C825C' : '#AA643B' }}>
              {c.stock} capacity units
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
  const { currentUser } = useUser();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const skipNextPersistenceRef = useRef(true);
  const userKey = currentUser?.USERNAME || '';

  useEffect(() => {
    if (!userKey) return;
    skipNextPersistenceRef.current = true;
    setMessages(restoreAgentConversation(userKey));
    setInput('');
  }, [userKey]);

  useEffect(() => {
    if (!userKey || typeof window === 'undefined') return;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(agentChatStorageKey(userKey), JSON.stringify({
        version: 2,
        messages: persistableAgentMessages(messages),
      }));
    } catch (_) {
      // The active conversation remains available in memory if storage is unavailable.
    }
  }, [messages, userKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    const history = buildAgentHistory(messages);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, time: new Date() }]);
    setSending(true);

    try {
      const result = await api.agents.chat(question, history);
      setMessages(prev => [...prev, {
        role: 'agent',
        text: result.response,
        team: result.team,
        intent: result.intent,
        agentUsed: result.agentUsed,
        toolsUsed: result.toolsUsed,
        engagedAgents: result.engagedAgents,
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
  }, [input, messages, sending, onActionLogged]);

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
    <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
            <JetGlyph iconClass="oj-fwk-icon-message-info" className="tone-teal" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Chat with AI Agents</h3>
            <p className="text-[10px] text-[var(--color-text-dim)]">
              Ask questions - auto-routed to <span className="font-semibold text-[var(--color-text)]">Signal</span>, <span className="font-semibold text-[var(--color-text)]">Access</span>, or <span className="font-semibold text-[var(--color-text)]">Operations</span> agents
            </p>
            <p className="text-[9px] tone-teal mt-0.5">Conversation memory on · saved for {currentUser?.FULL_NAME || 'this demo user'}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <JetButton
            label="Clear"
            iconClass="oj-fwk-icon oj-fwk-icon-cross"
            chroming="outlined"
            className="agent-console-clear-button"
            onAction={clearChat}
          />
        )}
      </div>

      {/* Messages area */}
      <div className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto min-h-[200px]"
        style={{ background: 'var(--color-surface)' }}>

        {/* Empty state - example questions */}
        {messages.length === 0 && (
          <div className="space-y-3 py-4">
            <div className="text-center mb-4">
              <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-empty-glyph tone-teal" />
              <p className="text-sm text-[var(--color-text-dim)]">Ask me anything about your telecommunications network experience data</p>
              <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                Powered by the selected runtime profile for reasoning + Oracle SQL and PL/SQL tools
              </p>
            </div>
            <div className="agent-console-example-grid">
              {EXAMPLE_QUESTIONS.map((eq, i) => (
                <div key={i} className="agent-console-example-tile">
                  <div className="agent-console-example-meta">
                    <JetGlyph iconClass={eq.iconClass} className="tone-teal" />
                    <span className="text-[9px] text-[var(--color-text-dim)] uppercase">{eq.team}</span>
                  </div>
                  <p className="agent-console-example-question">
                    {eq.text}
                  </p>
                  <JetButton
                    label="Ask"
                    iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                    chroming="outlined"
                    className="agent-console-example-button oj-button-sm"
                    onAction={() => sendMessage(eq.text)}
                  />
                </div>
              ))}
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
                    style={{ background: 'rgba(79,125,123,0.15)', border: '1px solid rgba(79,125,123,0.25)' }}>
                    {msg.text}
                  </div>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(79,125,123,0.2)' }}>
                    <JetGlyph iconClass="oj-fwk-icon-users" className="tone-teal" />
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
                      <JetGlyph
                        iconClass={(TEAM_INFO[msg.team] || {}).iconClass || 'oj-fwk-icon-grid'}
                        style={{ color: (TEAM_INFO[msg.team] || {}).color || '#C74634' }}
                      />
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${(TEAM_INFO[msg.team] || {}).color || '#C74634'}22`, color: (TEAM_INFO[msg.team] || {}).color || '#C74634' }}>
                      {(TEAM_INFO[msg.team] || {}).label || msg.team}
                    </span>
                    {msg.agentUsed && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded surface-plum-soft tone-plum">OLLAMA ROUTED</span>
                    )}
                    <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">{msg.elapsed}ms</span>
                  </div>

                  {/* Response text */}
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                    {msg.text}
                  </div>

                  {/* Visible specialist collaboration, backed by live Oracle context checks. */}
                  {msg.engagedAgents && msg.engagedAgents.length > 0 && (
                    <div className="agent-collaboration" aria-label="Agent collaboration trail">
                      <p className="agent-collaboration__title">Agent collaboration</p>
                      <div className="agent-collaboration__grid">
                        {msg.engagedAgents.map((agent) => {
                          const info = TEAM_INFO[agent.team] || {};
                          return (
                            <div key={agent.team} className="agent-collaboration__card" style={{ borderTopColor: info.color || '#796087' }}>
                              <div className="agent-collaboration__meta">
                                <span style={{ color: info.color || '#796087' }}>{info.label || agent.label || agent.team}</span>
                                <span>{String(agent.status || 'consulted').toUpperCase()}</span>
                              </div>
                              <p>{agent.contribution}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                                    {val == null ? '-' : typeof val === 'number'
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
                            background: t.status === 'success' ? 'rgba(76,130,92,0.1)' : t.status === 'fallback' ? 'rgba(170,100,59,0.1)' : 'rgba(199,70,52,0.1)',
                            color: t.status === 'success' ? '#4C825C' : t.status === 'fallback' ? '#AA643B' : '#C74634',
                            border: `1px solid ${t.status === 'success' ? 'rgba(76,130,92,0.2)' : t.status === 'fallback' ? 'rgba(170,100,59,0.2)' : 'rgba(199,70,52,0.2)'}`,
                          }}>
                          <JetGlyph iconClass="oj-fwk-icon-tree-document" /> {t.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {msg.role === 'error' && (
                <div className="px-4 py-2.5 rounded-lg text-sm tone-red"
                  style={{ background: 'rgba(199,70,52,0.1)', border: '1px solid rgba(199,70,52,0.25)' }}>
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(121,96,135,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-plum" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-[var(--color-text-dim)]"
              style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
              <JetProgressCircle size="sm" className="agent-console-loading-progress" ariaLabel="Agent thinking" />
              Agent thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-5 py-3" style={{ background: 'var(--color-surface-muted)', borderTop: '1px solid var(--color-border)' }}>
        <div className="jet-control-row">
          <div className="flex-1 min-w-[260px]" onKeyDown={handleKeyDown}>
            <JetInputText
              value={input}
              disabled={sending}
              elementRef={inputRef}
              ariaLabel="Ask an agent runtime question"
              placeholder="Ask the agent runtime a question..."
              onValueChange={setInput}
            />
          </div>
          <JetButton
            label={sending ? 'Sending...' : 'Send'}
            iconClass={sending ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-arrow-end'}
            chroming="callToAction"
            disabled={sending || !input.trim()}
            onAction={() => sendMessage()}
          />
        </div>
      </div>
    </div>
  );
}

// Color palette for profiles (rotates for unknown profiles)
const PROFILE_COLORS = ['#AA643B', '#796087', '#4F7D7B', '#C74634', '#437C94', '#4C825C'];
const PROFILE_COLOR_MAP = {
  SC_COHERE_PROFILE: '#AA643B',
  SC_LLAMA_PROFILE:  '#796087',
  SC_VISION_PROFILE: '#4F7D7B',
  SC_GROK42_PROFILE: '#C74634',
  SC_EMBED_PROFILE:  '#437C94',
};

const FALLBACK_PROFILE_INFO = {
  SC_LLAMA_PROFILE: {
    label: 'llama3.2',
    short: 'llama3.2',
    color: PROFILE_COLOR_MAP.SC_LLAMA_PROFILE,
    type: 'Runtime Profile + Oracle SQL',
  },
};

export default function AgentConsole() {
  const [activeProfile, setActiveProfile] = useState('SC_LLAMA_PROFILE');
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [profileInfo, setProfileInfo] = useState(FALLBACK_PROFILE_INFO);
  const activeProfileInfo = profileInfo[activeProfile] || FALLBACK_PROFILE_INFO[activeProfile] || {
    label: 'Runtime Profile',
    short: 'Runtime Profile',
    color: '#796087',
    type: 'Runtime Profile + Oracle SQL',
  };
  const profileOptions = Object.entries(profileInfo).map(([name, info], index) => ({
    value: name,
    label: info.short || info.label || getProfileDisplayLabel(name, index),
  }));

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
      if (Object.keys(info).length) setProfileInfo({ ...FALLBACK_PROFILE_INFO, ...info });
    }).catch(() => {});
  }, []);

  const switchProfile = useCallback(async (profileName) => {
    if (profileName === activeProfile || profileSwitching) return;
    setProfileSwitching(true);
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
      <RegisterOraclePanel title="AI-Assisted Service Assurance">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              These agent workflows run through the application layer, with the selected runtime profile handling reasoning
              and Oracle AI Database 26ai executing SQL and PL/SQL tools against live telecom operations data. Three specialist teams (<code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #AA643B' }}>CARE_SIGNAL_TEAM</code>,&nbsp;
              <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #437C94' }}>CARE_ACCESS_TEAM</code>, <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #4C825C' }}>CARE_OPERATIONS_TEAM</code>) route work across
              signal analysis, network access, and subscriber operations tasks. Oracle stores the source data, runs the queries, and records decisions in
              <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #A36472' }}> agent_actions</code> and <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #A36472' }}>event_stream</code>;
              the AI runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Runtime Profile" color="purple" />
            <FeatureBadge label="llama3.2" color="pink" />
            <FeatureBadge label="Oracle SQL / PL/SQL Tools" color="orange" />
            <FeatureBadge label="Application Orchestration" color="blue" />
            <FeatureBadge label="agent_actions (Audit Log)" color="blue" />
            <FeatureBadge label="event_stream (Native JSON)" color="yellow" />
            <FeatureBadge label="Vector RAG Retrieval" color="cyan" />
            <FeatureBadge label="In-DB ML Scoring" color="green" />
          </div>
          <SqlBlock code={`-- Agent runtime: app orchestration + runtime profile + Oracle AI Database 26ai
-- The app resolves intent -> routes to a specialist team -> executes SQL / PL/SQL in Oracle
-- The runtime profile provides reasoning; Oracle remains the data and execution layer

-- Example flow:
-- 1. Classify the request as CARE_SIGNAL_TEAM
-- 2. Call detect_trending_products(p_hours=>24)
-- 3. Join capacity and network-access data in Oracle
-- 4. Return service assurance recommendations and write actions to audit tables

-- Agent decisions written back atomically:
INSERT INTO agent_actions (agent_name, action_type, entity_type,
  entity_id, decision_payload, confidence, execution_status)
VALUES ('trend_detection_agent','capacity_flag','service',
  :product_id, :json_payload, 0.92, 'proposed');`} />
          {/* Team / Agent / Tools grid */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Teams &amp; Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { team: 'CARE_SIGNAL_TEAM', agent: 'TREND_AGENT', tools: ['TREND_SQL_TOOL', 'DETECT_TRENDS_TOOL', 'INFLUENCER_NETWORK_TOOL', 'LOG_DECISION_TOOL'], color: '#A36472' },
                { team: 'CARE_ACCESS_TEAM', agent: 'ACCESS_AGENT', tools: ['SERVICE_SQL_TOOL', 'CHECK_CAPACITY_TOOL', 'NETWORK_ROUTE_TOOL', 'LOG_DECISION_TOOL'], color: '#AA643B' },
                { team: 'CARE_OPERATIONS_TEAM', agent: 'OPERATIONS_AGENT', tools: ['SERVICE_SQL_TOOL', 'LOG_DECISION_TOOL'], color: '#4C825C' },
              ].map(t => (
                <div key={t.team} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <div className="px-2 py-1.5 text-center" style={{ background: `${t.color}12`, borderBottom: `2px solid ${t.color}44` }}>
                    <p className="text-[9px] font-semibold font-mono text-[var(--color-text)]">{t.team}</p>
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
              <DiagramBox label="High-Priority Subscriber Signal Detected" sub="subscriber signals · urgency score >= 75" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="CARE_SIGNAL_TEAM" sub="Runtime reasoning + tool routing" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓ calls PL/SQL tool</div>
              <DiagramBox label="detect_trending_products()" sub="Vector match · Graph centrality" color="#A36472" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="CARE_ACCESS_TEAM" sub="Capacity check · access risk" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="CARE_OPERATIONS_TEAM" sub="Retention · service orders · routing" color="#4C825C" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="agent_actions + event_stream" sub="Audit trail · JSON events" color="#4F7D7B" />
            </div>
            <div className="rounded-lg p-2 text-[9px] mt-2" style={{ background: 'rgba(121,96,135,0.08)', border: '1px dashed rgba(121,96,135,0.3)', color: 'var(--color-text)' }}>
              <span className="font-semibold">Why keep Oracle in the loop?</span><br/>
              The runtime handles reasoning, but Oracle still owns the live data, SQL execution, PL/SQL tools, and durable action logging.
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <SceneStoryPanel scene="agents" />

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-page-glyph tone-plum" /> AI-Assisted Service Assurance
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Agent teams recommend governed interventions for mobile signals, access risk, service orders, and retention while Oracle owns data, SQL execution, and action logging.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Profile Selector */}
          <div className="agent-console-profile-select">
            <JetSelectSingle
              value={activeProfile}
              options={profileOptions}
              ariaLabel="Agent runtime profile"
              className="agent-console-profile-select__control"
              disabled={profileSwitching}
              onValueChange={switchProfile}
            />
            <p className="agent-console-profile-select__meta">
              {profileSwitching ? 'Switching runtime profile' : activeProfileInfo.type}
            </p>
          </div>

        </div>
      </div>

      {/* ── Chat Agent ── */}
      <ChatAgent onActionLogged={() => { refetchActions(); }} />

      {/* Recent Actions Feed (last 3) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" /> Recent AI-Assisted Interventions
        </h3>
        <div className="space-y-2">
          {(actions || []).slice(0, 3).map(a => {
            let payload = null;
            try { payload = typeof a.DECISION_PAYLOAD === 'string' ? JSON.parse(a.DECISION_PAYLOAD) : a.DECISION_PAYLOAD; } catch {}
            const statusIcon = STATUS_ICONS[a.EXECUTION_STATUS] || { iconClass: 'oj-fwk-icon-clock', className: 'tone-neutral' };

            return (
              <div key={a.ACTION_ID} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors">
                <JetGlyph iconClass={statusIcon.iconClass} className={statusIcon.className} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{a.ACTION_TYPE.replace(/_/g, ' ')}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}22`,
                        color: 'var(--color-text)',
                        border: `1px solid ${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}33`,
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
