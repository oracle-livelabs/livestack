import { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { timeAgo } from '../utils/format';
import { SceneStoryPanel } from '../components/HealthcareStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';

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
  SOCIAL_TREND_TEAM: '#AA643B',
  FULFILLMENT_TEAM: '#437C94',
  COMMERCE_TEAM: '#4C825C',
};


const AGENT_NAME_LABELS = {
  SOCIAL_TREND_TEAM: 'Quality Signal Agent',
  FULFILLMENT_TEAM: 'Care Logistics Agent',
  COMMERCE_TEAM: 'Care Service Request Agent',
  trend_detection_agent: 'Quality Signal Agent',
  inventory_agent: 'Care Logistics Agent',
  fulfillment_agent: 'Care Logistics Agent',
  master_orchestrator: 'AI Agent Orchestrator',
  chat_agent: 'Healthcare Chat Agent',
  TREND_AGENT: 'Quality Signal Agent',
  FULFILLMENT_AGENT: 'Care Logistics Agent',
  COMMERCE_AGENT: 'Care Service Request Agent',
};

const TOOL_NAME_LABELS = {
  'detect_trending_products()': 'Quality signal detection tool',
  'get_influencer_network()': 'Care signal network tool',
  'find_best_fulfillment()': 'Care logistics routing tool',
  'check_product_inventory()': 'Capacity and supply check tool',
  'COMMERCE_SQL_TOOL (fallback)': 'Service request SQL tool (fallback)',
  'COMMERCE_SQL_TOOL (direct)': 'Service request SQL tool (direct)',
  'COMMERCE_SQL_TOOL (category)': 'Service request SQL tool (category)',
  COMMERCE_SQL_TOOL: 'Service request SQL tool',
  TREND_SQL_TOOL: 'Quality signal SQL tool',
  DETECT_TRENDS_TOOL: 'Quality signal detection tool',
  CHECK_INVENTORY_TOOL: 'Capacity and supply check tool',
  FULFILLMENT_ROUTE_TOOL: 'Care logistics routing tool',
  INFLUENCER_NETWORK_TOOL: 'Care signal network tool',
  LOG_DECISION_TOOL: 'Decision audit tool',
};

const ENTITY_TYPE_LABELS = {
  product: 'care service',
  order: 'service request',
  inventory: 'capacity/supply',
  shipment: 'logistics move',
  customer: 'care site',
  influencer: 'signal source',
  manufacturer: 'healthcare partner',
};

const COLUMN_LABELS = {
  product_id: 'care service id',
  product_name: 'care service',
  brand_name: 'partner',
  customer_id: 'care site id',
  customer_name: 'care site',
  order_id: 'service request id',
  order_total: 'service value',
  shipping_cost: 'logistics cost',
  influencer_id: 'signal source id',
  influencer_handle: 'signal source',
  fulfillment_center: 'care logistics site',
  center_name: 'care logistics site',
};

function titleCaseWords(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function displayAgentName(name) {
  return AGENT_NAME_LABELS[name] || titleCaseWords(name);
}

function displayToolName(name) {
  return TOOL_NAME_LABELS[name] || titleCaseWords(name);
}

function displayEntityType(type) {
  return ENTITY_TYPE_LABELS[type] || titleCaseWords(type);
}

function displayColumnName(name) {
  return COLUMN_LABELS[name] || titleCaseWords(name);
}

function displayPayloadSnippet(payload) {
  if (!payload) return '';
  if (payload.reason) return payload.reason;
  if (payload.care_service_name) return `Care service: ${payload.care_service_name}`;
  if (payload.product_name) return `Care service: ${payload.product_name}`;
  if (payload.strategy) return payload.strategy
    .replace(/\bproduct\b/gi, 'care service or supply')
    .replace(/\binventory\b/gi, 'capacity and supply')
    .replace(/\bstock\b/gi, 'available capacity');
  return JSON.stringify(payload).slice(0, 120)
    .replace(/product_name/g, 'care_service_name')
    .replace(/product/g, 'care service')
    .replace(/order/g, 'service request');
}

const TEAM_INFO = {
  SOCIAL_TREND_TEAM: { label: 'Quality Signal Agent', color: '#AA643B', iconClass: 'oj-fwk-icon-sortrelevancehigh', desc: 'Regulatory, quality, and capacity signal analysis' },
  FULFILLMENT_TEAM:  { label: 'Care Logistics Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Capacity, supply, compliance, and routing' },
  COMMERCE_TEAM:     { label: 'Care Service Request Agent', color: '#4C825C', iconClass: 'oj-fwk-icon-grid', desc: 'Service requests, service value, and care-site demand' },
};

const EXAMPLE_QUESTIONS = [
  { text: 'Which care services have the highest compliance momentum?', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'Signals' },
  { text: 'Show service value by care delivery category', iconClass: 'oj-fwk-icon-grid', team: 'Requests' },
  { text: 'Which healthcare operations have low capacity or supply?', iconClass: 'oj-fwk-icon-tree-document', team: 'Logistics' },
  { text: 'What percentage of service requests are signal-driven?', iconClass: 'oj-fwk-icon-info', team: 'Requests' },
  { text: 'Find critical bulletins in the last 24 hours', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'Signals' },
  { text: 'Check capacity and supply for Emergency Department Capacity Command Center', iconClass: 'oj-fwk-icon-tree-document', team: 'Logistics' },
  { text: 'Find nearest compliant care logistics site with qPCR Respiratory Panel for a care site in Miami', iconClass: 'oj-fwk-icon-arrowtail-e', team: 'Logistics' },
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
    <div className="rounded-xl overflow-hidden border border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(67,124,148,0.08)', borderBottom: '1px solid rgba(67,124,148,0.2)' }}>
        <JetGlyph iconClass="oj-fwk-icon-arrowtail-e" className="tone-ocean" />
        <span className="text-xs font-bold tone-ocean">Care Logistics Route - {product}</span>
        <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(76,130,92,0.15)', color: '#4C825C' }}>
          Best: {best.name} ({best.distance} mi)
        </span>
      </div>

      {/* Map */}
      <div style={{ height: 240 }}>
        <MapContainer bounds={bounds} style={{ height: '100%', width: '100%', borderRadius: 0 }}
          zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {/* Route lines from care site to each center */}
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
                  <span style={{ color: '#4C825C' }}>{c.stock} units</span> · {c.distance} mi
                </div>
              </MapTooltip>
            </CircleMarker>
          ))}

          {/* Care Site marker */}
          <CircleMarker center={[customer.lat, customer.lon]} radius={7}
            pathOptions={{ fillColor: '#AA643B', fillOpacity: 0.9, color: '#AA643B', weight: 2 }}>
            <MapTooltip permanent direction="bottom" offset={[0, 8]}
              className="route-map-tooltip">
              <div style={{ fontSize: 10 }}>
                <strong>Care Site</strong><br />{customer.city}, {customer.state}
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
    <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
            <JetGlyph iconClass="oj-fwk-icon-message-info" className="tone-teal" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Healthcare Agent Workspace</h3>
            <p className="text-[10px] text-[var(--color-text-dim)]">
              Ask a question or request an action. The console routes work to <span className="font-semibold text-[var(--color-text)]">Signal</span>, <span className="font-semibold text-[var(--color-text)]">Care Logistics</span>, or <span className="font-semibold text-[var(--color-text)]">Service Request</span> agents using governed SQL and PL/SQL tools.
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
              <p className="text-sm text-[var(--color-text-dim)]">Ask an agent to investigate quality signals, check logistics capacity, review service requests, or summarize care pathway risk.</p>
              <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                Powered by <span className="font-semibold text-[var(--color-text)]">Ollama (llama3.2)</span> for reasoning + Oracle SQL and PL/SQL tools
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
                                  {displayColumnName(col)}
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
                          <JetGlyph iconClass="oj-fwk-icon-tree-document" /> {displayToolName(t.tool)}
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
              ariaLabel="Ask an agent runtime question"
              placeholder="Ask about quality signals, care logistics, service requests, capacity, or care pathways…"
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
    type: 'Ollama + Oracle SQL',
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
    type: 'Ollama + Oracle SQL',
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
      <RegisterOraclePanel title="Healthcare AI Agent Console">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              These agent workflows run through the application layer, with <span className="font-mono text-[var(--color-text)]">Ollama (llama3.2)</span> handling reasoning
              and Oracle AI Database 26ai executing SQL and PL/SQL tools against live data. Three specialist agents (<span className="font-semibold" style={{ color: 'var(--color-text)', borderBottom: '2px solid #AA643B' }}>Quality Signal Agent</span>, <span className="font-semibold" style={{ color: 'var(--color-text)', borderBottom: '2px solid #437C94' }}>Care Logistics Agent</span>, and <span className="font-semibold" style={{ color: 'var(--color-text)', borderBottom: '2px solid #4C825C' }}>Care Service Request Agent</span>) route work across
              quality signal analysis, care logistics, and service request tasks. Oracle stores the source data, runs the queries, and records decisions in
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
-- 1. Classify the request for the Quality Signal Agent
-- 2. Use the signal-detection tool retained for compatibility
-- 3. Join quality signals, service catalog, capacity, and logistics data in Oracle
-- 4. Return recommendations and write actions to audit tables

-- Agent decisions written back atomically:
INSERT INTO agent_actions (agent_name, action_type, entity_type,
  entity_id, decision_payload, confidence, execution_status)
VALUES ('Quality Signal Agent','service_review','care_service',
  :care_service_id, :json_payload, 0.92, 'proposed');`} />
          {/* Team / Agent / Tools grid */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Teams &amp; Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { team: 'Quality Signal Agent', agent: 'Signal Analyst', tools: ['Signal SQL', 'Criticality Detection', 'Care Pathway Context', 'Decision Audit'], color: '#A36472' },
                { team: 'Care Logistics Agent', agent: 'Logistics Coordinator', tools: ['Service SQL', 'Capacity Check', 'Spatial Route', 'Decision Audit'], color: '#AA643B' },
                { team: 'Care Service Request Agent', agent: 'Service Request Advisor', tools: ['Request SQL', 'Service Value Review', 'Care Site Context', 'Decision Audit'], color: '#4C825C' },
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
              <DiagramBox label="Critical Signal Detected" sub="quality signal criticality >= 75" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Quality Signal Agent" sub="Ollama reasoning + Oracle tool routing" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓ calls PL/SQL tool</div>
              <DiagramBox label="Signal detection tool" sub="Vector match · care-pathway context" color="#A36472" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Care Logistics Agent" sub="Capacity check · routing logic" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Care Service Request Agent" sub="Service request · care-site follow-up" color="#4C825C" />
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
            <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-page-glyph tone-plum" /> Healthcare AI Agent Console
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Coordinate healthcare AI agents that reason over governed data, call approved SQL and PL/SQL tools, and log every action for auditability in Oracle AI Database 26ai.
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
              {profileSwitching ? 'Switching runtime profile' : `${activeProfileInfo.type} - Ollama + Oracle SQL`}
            </p>
          </div>

        </div>
      </div>

      <SceneStoryPanel scene="agents" />

      {/* ── Chat Agent ── */}
      <ChatAgent onActionLogged={() => { refetchActions(); }} />

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
                    <span className="text-sm font-medium">{a.ACTION_TYPE.replace(/_/g, ' ')}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}22`,
                        color: 'var(--color-text)',
                        border: `1px solid ${AGENT_COLORS[a.AGENT_NAME] || '#6F757E'}33`,
                      }}>
                      {displayAgentName(a.AGENT_NAME)}
                    </span>
                    {a.ENTITY_TYPE && (
                      <span className="text-[10px] text-[var(--color-text-dim)]">{displayEntityType(a.ENTITY_TYPE)} #{a.ENTITY_ID}</span>
                    )}
                  </div>
                  {payload && (
                    <p className="text-xs text-[var(--color-text-dim)] mt-0.5 truncate max-w-lg">
                      {displayPayloadSnippet(payload)}
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
