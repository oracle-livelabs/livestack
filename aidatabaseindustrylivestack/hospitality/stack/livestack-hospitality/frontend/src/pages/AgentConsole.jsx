import { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { timeAgo } from '../utils/format';
import { SceneStoryPanel } from '../components/HospitalityStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { useUser } from '../context/UserContext';

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
  trend_detection_agent: '#8A4E2F',
  inventory_agent: '#437C94',
  fulfillment_agent: '#3E6F4D',
  master_orchestrator: '#796087',
  chat_agent: '#4F7D7B',
};

const TEAM_INFO = {
  SOCIAL_TREND_TEAM: { label: 'Guest & Demand Signal Agent', color: '#8A4E2F', iconClass: 'oj-fwk-icon-sortrelevancehigh', desc: 'Guest reviews, OTA discrepancies, demand spikes, and service alert analysis' },
  FULFILLMENT_TEAM:  { label: 'Housekeeping & Maintenance Routing Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Room-readiness capacity, service recovery, and routing' },
  SERVICE_ROUTING_AGENT:  { label: 'Housekeeping & Maintenance Routing Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Room-readiness capacity, service recovery, and routing' },
  CLIENT_SERVICE_ROUTING_AGENT:  { label: 'Housekeeping & Maintenance Routing Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Room-readiness capacity, service recovery, and routing' },
  COMMERCE_TEAM:     { label: 'Reservation Revenue Agent', color: '#3E6F4D', iconClass: 'oj-fwk-icon-grid', desc: 'Reservations, folios, channel mix, and booking activity' },
  REVENUE_OPERATIONS_TEAM: { label: 'Reservation Revenue Agent', color: '#3E6F4D', iconClass: 'oj-fwk-icon-grid', desc: 'Reservations, folios, channel mix, and booking activity' },
};

const ACTION_TYPE_LABELS = {
  chat_query: 'Agent question',
  detect_trends: 'Signal review',
  inventory_check: 'Capacity check',
  fulfillment_route: 'Service routing',
};

const AGENT_NAME_LABELS = {
  chat_agent: 'Agent console',
  trend_detection_agent: 'Guest signal agent',
  inventory_agent: 'Service capacity agent',
  fulfillment_agent: 'Service routing agent',
  master_orchestrator: 'Operations orchestrator',
};

const ENTITY_TYPE_LABELS = {
  trends: 'Guest signals',
  fulfillment: 'Service operations',
  commerce: 'Reservation revenue',
  guest_signals: 'Guest signals',
  service_operations: 'Service operations',
  reservation_revenue: 'Reservation revenue',
  product: 'Room type',
};

const TEAM_REASON_LABELS = {
  SOCIAL_TREND_TEAM: 'Guest & Demand Signal Agent',
  FULFILLMENT_TEAM: 'Housekeeping & Maintenance Routing Agent',
  COMMERCE_TEAM: 'Reservation Revenue Agent',
};

function formatActionType(type) {
  return ACTION_TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

function formatAgentName(name) {
  return AGENT_NAME_LABELS[name] || String(name || '').replace(/_/g, ' ');
}

function formatEntityLabel(type, id) {
  const label = ENTITY_TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
  return id == null ? label : `${label} #${id}`;
}

function formatActionReason(payload) {
  const raw = payload?.reason || payload?.product_name || payload?.strategy || JSON.stringify(payload || {}).slice(0, 120);
  return Object.entries(TEAM_REASON_LABELS)
    .reduce((text, [team, label]) => text.replaceAll(team, label), raw)
    .replace('(intent: fulfillment)', '(service operations)')
    .replace('(intent: trends)', '(guest signals)')
    .replace('(intent: commerce)', '(reservation revenue)');
}

const EXAMPLE_QUESTIONS = [
  { text: 'Which portfolio room types have the highest guest and channel signal severity?', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'signals' },
  { text: 'Show reservation revenue by room type category', iconClass: 'oj-fwk-icon-grid', team: 'revenue impact' },
  { text: 'Find property hotels with rising investigation SLA pressure.', iconClass: 'oj-fwk-icon-tree-document', team: 'service' },
  { text: 'Show revenue impact from signal-linked reservations.', iconClass: 'oj-fwk-icon-info', team: 'revenue impact' },
  { text: 'Find critical guest and operations signals in the last 24 hours', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'signals' },
  { text: 'Which service requests have the highest connected guest value?', iconClass: 'oj-fwk-icon-node-expand', team: 'service recovery' },
  { text: 'Find the nearest available property hotel for a service recovery case in Miami', iconClass: 'oj-fwk-icon-arrowtail-e', team: 'service' },
];
const AGENT_CONSOLE_STORAGE_PREFIX = 'hospitality.agentconsole.messages.v2';
const AGENT_CONSOLE_LEGACY_SESSION_STORAGE_PREFIX = 'hospitality.agentconsole.messages.v1';
const MAX_PERSISTED_MESSAGES = 40;
const MAX_PERSISTED_AGENT_ROWS = 12;

function getAgentConsoleStorageKey(username) {
  return `${AGENT_CONSOLE_STORAGE_PREFIX}:${username || 'anonymous'}`;
}

function prunePersistedAgentMessage(message) {
  const next = { ...message };
  if (Array.isArray(next.data) && next.data.length > MAX_PERSISTED_AGENT_ROWS) {
    next.data = next.data.slice(0, MAX_PERSISTED_AGENT_ROWS);
    next.dataTruncatedForStorage = true;
  }
  return next;
}

function loadStoredAgentMessages(storageKey) {
  if (typeof window === 'undefined') return [];
  try {
    let raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      const legacyKey = storageKey.replace(AGENT_CONSOLE_STORAGE_PREFIX, AGENT_CONSOLE_LEGACY_SESSION_STORAGE_PREFIX);
      raw = window.sessionStorage.getItem(legacyKey);
      if (raw) {
        window.localStorage.setItem(storageKey, raw);
        window.sessionStorage.removeItem(legacyKey);
      }
    }
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((message) => message && typeof message === 'object').slice(-MAX_PERSISTED_MESSAGES)
      : [];
  } catch (_) {
    return [];
  }
}

function saveStoredAgentMessages(storageKey, messages) {
  if (typeof window === 'undefined') return;
  try {
    const payload = (messages || [])
      .slice(-MAX_PERSISTED_MESSAGES)
      .map(prunePersistedAgentMessage);
    if (payload.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    }
  } catch (_) {}
}

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  if (name === 'SC_LLAMA_PROFILE') return 'llama3.2';
  return String(name)
    .replace(/^SC_/, '')
    .replace(/_PROFILE$/, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

// ── Fulfillment Route Map (rendered inside chat messages) ─────────────────────
function FulfillmentRouteMap({ routeData }) {
  const { guest, centers, product } = routeData;
  if (!guest || !centers || centers.length === 0) return null;

  // Calculate map bounds
  const allPoints = [
    [guest.lat, guest.lon],
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
        <span className="text-xs font-bold tone-ocean">Service Route - {product}</span>
        <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(62, 111, 77,0.15)', color: '#3E6F4D' }}>
          Best: {best.name} ({best.distance} mi)
        </span>
      </div>

      {/* Map */}
      <div style={{ height: 240 }}>
        <MapContainer bounds={bounds} style={{ height: '100%', width: '100%', borderRadius: 0 }}
          zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {/* Route lines from guest to each center */}
          {centers.map((c, i) => (
            <Polyline key={i}
              positions={[[guest.lat, guest.lon], [c.lat, c.lon]]}
              pathOptions={{
                color: i === 0 ? '#3E6F4D' : 'rgba(255,255,255,0.15)',
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
                fillColor: i === 0 ? '#3E6F4D' : '#437C94',
                fillOpacity: i === 0 ? 0.9 : 0.5,
                color: i === 0 ? '#3E6F4D' : '#437C94',
                weight: i === 0 ? 2 : 1,
              }}>
              <MapTooltip permanent={i === 0} direction="top" offset={[0, -8]}
                className="route-map-tooltip">
                <div style={{ fontSize: 10, lineHeight: 1.4 }}>
                  <strong>{c.name}</strong><br />
                  {c.city}, {c.state}<br />
                  <span style={{ color: '#3E6F4D' }}>{c.capacity} units</span> · {c.distance} mi
                </div>
              </MapTooltip>
            </CircleMarker>
          ))}

          {/* Guest marker */}
          <CircleMarker center={[guest.lat, guest.lon]} radius={7}
            pathOptions={{ fillColor: '#8A4E2F', fillOpacity: 0.9, color: '#8A4E2F', weight: 2 }}>
            <MapTooltip permanent direction="bottom" offset={[0, 8]}
              className="route-map-tooltip">
              <div style={{ fontSize: 10 }}>
                <strong>Guest</strong><br />{guest.city}, {guest.state}
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
              style={{ background: i === 0 ? '#3E6F4D' : '#437C94', opacity: i === 0 ? 1 : 0.5 }} />
            <span className={`font-medium ${i === 0 ? 'tone-pine' : 'text-[var(--color-text-dim)]'}`}>
              {c.name}
            </span>
            <span className="text-[var(--color-text-dim)]">{c.city}, {c.state}</span>
            <span className="ml-auto font-mono text-[10px]" style={{ color: c.capacity > 50 ? '#3E6F4D' : '#8A4E2F' }}>
              {c.capacity} units
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-dim)]">{c.distance} mi</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizeAgentData(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    return {
      type: 'rows',
      rowCount: data.length,
      columns: data[0] ? Object.keys(data[0]).slice(0, 8) : [],
      preview: data.slice(0, 3),
    };
  }
  if (data.type === 'route') {
    return {
      type: 'route',
      product: data.product,
      guest: data.guest,
      centers: Array.isArray(data.centers) ? data.centers.slice(0, 3) : [],
    };
  }
  return null;
}

function buildAgentConversationHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'agent')
    .slice(-12)
    .map((message) => ({
      role: message.role,
      text: message.text || '',
      team: message.team || null,
      intent: message.intent || null,
      data: message.role === 'agent' ? summarizeAgentData(message.data) : null,
    }))
    .filter((message) => message.text);
}

// ── Chat Agent Component ─────────────────────────────────────────────────────
function ChatAgent({ activeProfile, onActionLogged }) {
  const { currentUser } = useUser();
  const storageKey = getAgentConsoleStorageKey(currentUser?.USERNAME);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const storageHydrationKeyRef = useRef(null);

  useEffect(() => {
    storageHydrationKeyRef.current = storageKey;
    setMessages(loadStoredAgentMessages(storageKey));
    setInput('');
  }, [storageKey]);

  useEffect(() => {
    if (storageHydrationKeyRef.current === storageKey) {
      storageHydrationKeyRef.current = null;
      return;
    }
    saveStoredAgentMessages(storageKey, messages);
  }, [storageKey, messages]);

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
      const result = await api.agents.chat(question, buildAgentConversationHistory(messages), activeProfile);
      setMessages(prev => [...prev, {
        role: 'agent',
        text: result.response,
        team: result.team,
        intent: result.intent,
        contextApplied: result.contextApplied,
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
  }, [input, sending, messages, activeProfile, onActionLogged]);

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
            <h3 className="text-sm font-bold">Coordinate AI Operations Agents</h3>
            <p className="text-[10px] text-[var(--color-text-dim)]">
              Ask hospitality operations questions - auto-routed to <span className="font-semibold text-[var(--color-text)]">Guest & Demand</span>, <span className="font-semibold text-[var(--color-text)]">Housekeeping & Maintenance</span>, or <span className="font-semibold text-[var(--color-text)]">Reservation Revenue</span> agents
            </p>
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
              <p className="text-sm text-[var(--color-text-dim)]">Ask me to investigate guest signals, revenue impact, service pressure, or agent actions</p>
              <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                Governed reasoning with Oracle-managed data access, workflow tools, and durable action logging
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
                      style={{ background: `${(TEAM_INFO[msg.team] || {}).color || '#A73529'}22` }}>
                      <JetGlyph
                        iconClass={(TEAM_INFO[msg.team] || {}).iconClass || 'oj-fwk-icon-grid'}
                        style={{ color: (TEAM_INFO[msg.team] || {}).color || '#A73529' }}
                      />
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${(TEAM_INFO[msg.team] || {}).color || '#A73529'}22`, color: (TEAM_INFO[msg.team] || {}).color || '#A73529' }}>
                      {(TEAM_INFO[msg.team] || {}).label || msg.team}
                    </span>
                    {msg.agentUsed && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded surface-plum-soft tone-plum">AI ROUTED</span>
                    )}
                    <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">{msg.elapsed}ms</span>
                  </div>

                  {/* Response text */}
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
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
                            background: t.status === 'success' ? 'rgba(62, 111, 77,0.1)' : t.status === 'fallback' ? 'rgba(138, 78, 47,0.1)' : 'rgba(167, 53, 41,0.1)',
                            color: t.status === 'success' ? '#3E6F4D' : t.status === 'fallback' ? '#8A4E2F' : '#A73529',
                            border: `1px solid ${t.status === 'success' ? 'rgba(62, 111, 77,0.2)' : t.status === 'fallback' ? 'rgba(138, 78, 47,0.2)' : 'rgba(167, 53, 41,0.2)'}`,
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
                  style={{ background: 'rgba(167, 53, 41,0.1)', border: '1px solid rgba(167, 53, 41,0.25)' }}>
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
              Agent thinking…
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
              ariaLabel="Ask an operations agent question"
              placeholder="Ask a guest, revenue, service, or operations question..."
              onValueChange={setInput}
            />
          </div>
          <JetButton
            label={sending ? 'Sending…' : 'Send'}
            iconClass={sending ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-arrow-end'}
            chroming="callToAction"
            disabled={sending || !input.trim()}
            onAction={() => sendMessage()}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--color-text-dim)]">
          Conversation context is saved for this user across scene changes and browser restarts.
          {messages.length > 0 ? ' Follow-up questions continue from the prior agent response and team context.' : ''}
        </p>
      </div>
    </div>
  );
}

// Color palette for profiles (rotates for unknown profiles)
const PROFILE_COLORS = ['#8A4E2F', '#796087', '#4F7D7B', '#A73529', '#437C94', '#3E6F4D'];
const PROFILE_COLOR_MAP = {
  SC_COHERE_PROFILE: '#8A4E2F',
  SC_LLAMA_PROFILE:  '#796087',
  SC_VISION_PROFILE: '#4F7D7B',
  SC_GROK42_PROFILE: '#A73529',
  SC_EMBED_PROFILE:  '#437C94',
};

const FALLBACK_PROFILE_INFO = {
  SC_LLAMA_PROFILE: {
    label: 'llama3.2',
    short: 'llama3.2',
    color: PROFILE_COLOR_MAP.SC_LLAMA_PROFILE,
    type: 'Ollama Runtime',
  },
};

export default function AgentConsole() {
  const { currentUser } = useUser();
  const userKey = currentUser?.USERNAME;
  const [activeProfile, setActiveProfile] = useState('SC_LLAMA_PROFILE');
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [profileInfo, setProfileInfo] = useState(FALLBACK_PROFILE_INFO);
  const activeProfileInfo = profileInfo[activeProfile] || FALLBACK_PROFILE_INFO[activeProfile] || {
    label: 'Runtime Profile',
    short: 'Runtime Profile',
    color: '#796087',
    type: 'Runtime Profile',
  };
  const profileOptions = Object.entries(profileInfo).map(([name, info], index) => ({
    value: name,
    label: info.label || info.model || getProfileDisplayLabel(name, index),
  }));

  const { data: actions, refetch: refetchActions } = useData(() => api.agents.actions({ limit: 3 }), [userKey]);
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
  }, [userKey]);

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
      <RegisterOraclePanel title="Agent Console">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              These agent workflows run through the application layer, with <span className="font-mono text-[var(--color-text)]">Ollama (llama3.2)</span> handling reasoning
              and Oracle AI Database 26ai executing SQL and PL/SQL tools against live data. Three specialist teams (<code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #8A4E2F' }}>SIGNAL_INTELLIGENCE_TEAM</code>,&nbsp;
              <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #437C94' }}>SERVICE_ROUTING_AGENT</code>, <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #3E6F4D' }}>REVENUE_OPERATIONS_TEAM</code>) route work across
              signal analysis, service coverage, reservation revenue, and guest recovery tasks. Oracle stores the source data, runs the queries, and records decisions in
              <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #A36472' }}> agent_actions</code> and <code className="text-xs font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid #A36472' }}>event_stream</code>;
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
          <SqlBlock code={`-- Agent runtime: app orchestration + Ollama + Oracle AI Database 26ai
-- The app resolves intent -> routes to a specialist team -> executes SQL / PL/SQL in Oracle
-- Ollama (llama3.2) provides reasoning; Oracle remains the data and execution layer

-- Example flow:
-- 1. Classify the request as SIGNAL_INTELLIGENCE_TEAM
-- 2. Call the PL/SQL risk-signal detector
-- 3. Join service-capacity and hotel data in Oracle
-- 4. Return recommendations and write actions to audit tables

-- Self-contained audit example. The final ROLLBACK keeps repeated demos clean.
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/

INSERT INTO agent_actions (agent_name, action_type, entity_type,
  entity_id, decision_payload, confidence, execution_status)
VALUES ('GUEST_SIGNAL_AGENT', 'RISK_ALERT', 'ROOM_TYPE',
  (SELECT MIN(product_id) FROM products),
  JSON_SERIALIZE(JSON_OBJECT(
    'reason' VALUE 'Copy-paste validation example',
    'source' VALUE 'Hospitality Agent Console'
    RETURNING JSON) RETURNING CLOB),
  0.92, 'proposed');

ROLLBACK;`} />
          {/* Team / Agent / Tools grid */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Teams &amp; Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { team: 'SIGNAL_INTELLIGENCE_TEAM', agent: 'GUEST_SIGNAL_AGENT', tools: ['SIGNAL_SQL_TOOL', 'DETECT_TRENDS_TOOL', 'SIGNAL_NETWORK_TOOL', 'LOG_DECISION_TOOL'], color: '#A36472' },
                { team: 'SERVICE_ROUTING_AGENT', agent: 'SERVICE_ROUTING_AGENT', tools: ['HOSPITALITY_SQL_TOOL', 'CHECK_SERVICE_CAPACITY_TOOL', 'ROUTE_SERVICE_CASE_TOOL', 'LOG_DECISION_TOOL'], color: '#8A4E2F' },
                { team: 'REVENUE_OPERATIONS_TEAM', agent: 'REVENUE_AGENT', tools: ['HOSPITALITY_SQL_TOOL', 'LOG_DECISION_TOOL'], color: '#3E6F4D' },
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
              <DiagramBox label="Critical Hospitality LiveStack Guest Signal Detected" sub="social_posts · issue severity >= 75" color="#8A4E2F" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="SIGNAL_INTELLIGENCE_TEAM" sub="Ollama reasoning + tool routing" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓ calls PL/SQL tool</div>
              <DiagramBox label="Guest signal detector" sub="Vector match · property graph centrality" color="#A36472" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="SERVICE_ROUTING_AGENT" sub="Service-capacity check · SLA routing" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="REVENUE_OPERATIONS_TEAM" sub="Revenue impact · reservation routing" color="#3E6F4D" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="agent_actions + event_stream" sub="Audit trail · JSON events" color="#4F7D7B" />
            </div>
            <div className="rounded-lg p-2 text-[9px] mt-2" style={{ background: 'rgba(121,96,135,0.08)', border: '1px dashed rgba(121,96,135,0.3)', color: 'var(--color-text)' }}>
              <span className="font-semibold">Why keep Oracle in the loop?</span><br/>
              Ollama handles reasoning, but Oracle still owns the live data, SQL execution, PL/SQL tools, and durable action logging.
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-page-glyph tone-plum" /> AI Operations Agent Console
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Hospitality LiveStack agent teams coordinate guest, revenue, service, and operations decisions while Oracle governs data access, workflow execution, and action logging.
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
              {profileSwitching ? 'Switching runtime profile' : `${activeProfileInfo.type} - Governed AI + Oracle Data`}
            </p>
          </div>

        </div>
      </div>

      <SceneStoryPanel scene="agents" />

      {/* ── Chat Agent ── */}
      <ChatAgent activeProfile={activeProfile} onActionLogged={() => { refetchActions(); }} />

      {/* Recent Actions Feed (last 3) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" /> Recent Agent Actions
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
                    <span className="text-sm font-medium">{formatActionType(a.ACTION_TYPE)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}22`,
                        color: 'var(--color-text)',
                        border: `1px solid ${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}33`,
                      }}>
                      {formatAgentName(a.AGENT_NAME)}
                    </span>
                    {a.ENTITY_TYPE && (
                      <span className="text-[10px] text-[var(--color-text-dim)]">{formatEntityLabel(a.ENTITY_TYPE, a.ENTITY_ID)}</span>
                    )}
                  </div>
                  {payload && (
                    <p className="text-xs text-[var(--color-text-dim)] mt-0.5 truncate max-w-lg">
                      {formatActionReason(payload)}
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
