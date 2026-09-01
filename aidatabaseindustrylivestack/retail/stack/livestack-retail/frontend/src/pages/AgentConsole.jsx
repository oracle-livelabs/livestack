import { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiFetch } from '../utils/api';
import { useData } from '../hooks/useData';
import { timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { RetailSceneStory } from '../components/RetailStory';
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
  demand_signal_agent: '#AA643B',
  fulfillment_optimization_agent: '#437C94',
  commerce_intelligence_agent: '#4C825C',
  returns_triage_agent: '#C74634',
};

const TEAM_INFO = {
  DEMAND_SIGNAL_AGENT: { label: 'Demand Signal Agent', color: '#AA643B', iconClass: 'oj-fwk-icon-sortrelevancehigh', desc: 'Demand and creator signals' },
  FULFILLMENT_OPTIMIZATION_AGENT: { label: 'Fulfillment Optimization Agent', color: '#437C94', iconClass: 'oj-fwk-icon-tree-document', desc: 'Inventory and spatial routing' },
  COMMERCE_INTELLIGENCE_AGENT: { label: 'Commerce Intelligence Agent', color: '#4C825C', iconClass: 'oj-fwk-icon-grid', desc: 'Orders and revenue' },
  RETURNS_TRIAGE_AGENT: { label: 'Returns Triage Agent', color: '#C74634', iconClass: 'oj-fwk-icon-list', desc: 'Return risk and vector evidence' },
};

const EXAMPLE_QUESTIONS = [
  { text: 'Which AllTerrain demand signals need immediate review?', iconClass: 'oj-fwk-icon-message-warning', team: 'trends' },
  { text: 'Which products combine high demand signals with low inventory?', iconClass: 'oj-fwk-icon-tree-document', team: 'fulfillment' },
  { text: 'What products are trending right now?', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'trends' },
  { text: 'Show me revenue breakdown by category', iconClass: 'oj-fwk-icon-grid', team: 'commerce' },
  { text: 'Which outdoor products have low inventory?', iconClass: 'oj-fwk-icon-tree-document', team: 'fulfillment' },
  { text: 'What percentage of orders are driven by customer demand signals?', iconClass: 'oj-fwk-icon-info', team: 'commerce' },
  { text: 'Find high-momentum sporting-goods signals in the last 24 hours', iconClass: 'oj-fwk-icon-sortrelevancehigh', team: 'trends' },
  { text: 'Check inventory for AllTerrain Hiking Boots', iconClass: 'oj-fwk-icon-tree-document', team: 'fulfillment' },
  { text: 'Find nearest fulfillment center with AllTerrain Hiking Boots for a customer in Denver', iconClass: 'oj-fwk-icon-arrowtail-e', team: 'fulfillment' },
  { text: 'What evidence should an Admin review for high-risk return cases?', iconClass: 'oj-fwk-icon-list', team: 'returns' },
];

function messagesFromConversation(conversation) {
  return (conversation?.turns || []).flatMap((turn) => [
    { role: 'user', text: turn.question, time: turn.createdAt },
    {
      role: 'agent', text: turn.response, team: turn.team,
      agentUsed: turn.answer?.mode === 'grounded_model',
      route: turn.route, claims: turn.claims || turn.answer?.claims || [],
      citations: turn.evidence?.sources || [],
      contradictions: turn.evidence?.contradictions || [],
      insufficientEvidence: turn.evidence?.insufficientEvidence,
      telemetry: turn.telemetry, trace: turn.answer?.trace || [],
      deepLinks: turn.route?.deepLink ? [turn.route.deepLink] : [],
      time: turn.createdAt,
    },
  ]);
}

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
        <span className="text-xs font-bold tone-ocean">Fulfillment Route - {product}</span>
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
                  <span style={{ color: '#4C825C' }}>{c.stock} units</span> · {c.distance} mi
                </div>
              </MapTooltip>
            </CircleMarker>
          ))}

          {/* Customer marker */}
          <CircleMarker center={[customer.lat, customer.lon]} radius={7}
            pathOptions={{ fillColor: '#AA643B', fillOpacity: 0.9, color: '#AA643B', weight: 2 }}>
            <MapTooltip permanent direction="bottom" offset={[0, 8]}
              className="route-map-tooltip">
              <div style={{ fontSize: 10 }}>
                <strong>Customer</strong><br />{customer.city}, {customer.state}
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
function ChatAgent({ onActionLogged, userKey }) {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = useCallback(async (id) => {
    if (!id) { setConversationId(null); setMessages([]); return; }
    const conversation = await apiFetch(`/agents/conversations/${encodeURIComponent(id)}`);
    setConversationId(conversation.id);
    setMessages(messagesFromConversation(conversation));
  }, []);

  const refreshConversations = useCallback(async (preferredId = null) => {
    setConversationLoading(true);
    try {
      const result = await apiFetch('/agents/conversations?limit=20');
      const list = result.conversations || [];
      setConversations(list);
      const nextId = preferredId || list[0]?.id || null;
      if (nextId) await loadConversation(nextId);
      else { setConversationId(null); setMessages([]); }
    } finally {
      setConversationLoading(false);
    }
  }, [loadConversation]);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    refreshConversations().catch(() => setConversationLoading(false));
  }, [refreshConversations, userKey]);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, time: new Date() }]);
    setSending(true);

    try {
      const result = await apiFetch('/agents/chat', {
        method: 'POST',
        body: JSON.stringify({ question, conversationId }),
      });
      setConversationId(result.conversationId);
      setMessages(prev => [...prev, {
        role: 'agent',
        text: result.response,
        team: result.team,
        intent: result.intent,
        agentUsed: result.agentUsed,
        toolsUsed: result.toolsUsed,
        data: result.data,
        trace: result.trace,
        route: result.route,
        claims: result.claims,
        citations: result.citations,
        contradictions: result.contradictions,
        insufficientEvidence: result.insufficientEvidence,
        deepLinks: result.deepLinks,
        telemetry: result.telemetry,
        security: result.security,
        elapsed: result.elapsed,
        time: new Date(),
      }]);
      setConversations(prev => {
        const existing = prev.find(item => item.id === result.conversationId);
        const updated = { ...(existing || {}), id: result.conversationId, title: existing?.title || question.slice(0, 120), updatedAt: new Date().toISOString() };
        return [updated, ...prev.filter(item => item.id !== result.conversationId)];
      });
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
  }, [input, sending, onActionLogged, conversationId]);

  const clearChat = useCallback(async () => {
    if (conversationId) {
      try { await apiFetch(`/agents/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }); } catch (_) {}
    }
    setMessages([]);
    setInput('');
    setConversationId(null);
    setConversations(prev => prev.filter(item => item.id !== conversationId));
  }, [conversationId]);

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
              Ask questions routed to <span className="font-semibold text-[var(--color-text)]">Demand Signal</span>, <span className="font-semibold text-[var(--color-text)]">Fulfillment</span>, <span className="font-semibold text-[var(--color-text)]">Commerce</span>, or <span className="font-semibold text-[var(--color-text)]">Returns Triage</span> agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <select
              aria-label="Saved Agent Console conversation"
              value={conversationId || ''}
              onChange={(event) => loadConversation(event.target.value).catch(() => {})}
              className="text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 max-w-[220px]"
            >
              {conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          )}
          {messages.length > 0 && (
            <JetButton label="New conversation" iconClass="oj-fwk-icon oj-fwk-icon-plus" chroming="outlined" className="agent-console-clear-button" onAction={clearChat} />
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto min-h-[200px]"
        style={{ background: 'var(--color-surface)' }}>

        {/* Empty state: example questions */}
        {conversationLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-dim)]">
            <JetProgressCircle size="sm" ariaLabel="Loading saved conversation" /> Loading server conversation...
          </div>
        )}
        {!conversationLoading && messages.length === 0 && (
          <div className="space-y-3 py-4">
            <div className="text-center mb-4">
              <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-empty-glyph tone-teal" />
              <p className="text-sm text-[var(--color-text-dim)]">Ask me anything about your sporting-goods service, demand, and customer signal data</p>
              <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                Oracle runs bounded SQL, SQL/PGQ, Spatial distance, and Vector Search tools; Ollama only phrases citation-validated claims
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded surface-plum-soft tone-plum">CITATION-VALIDATED OLLAMA</span>
                    )}
                    {msg.route?.confidence != null && <span className="text-[9px] text-[var(--color-text-dim)]">route {Math.round(msg.route.confidence * 100)}% · margin {msg.route.margin}</span>}
                    <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">{msg.elapsed}ms</span>
                  </div>

                  {/* Response text */}
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                    {msg.text}
                  </div>

                  {msg.route?.handoff && (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(67,124,148,0.08)', border: '1px solid rgba(67,124,148,0.25)' }}>
                      Controlled handoff: {TEAM_INFO[msg.route.handoff.from]?.label || msg.route.handoff.from} → {TEAM_INFO[msg.route.handoff.to]?.label || msg.route.handoff.to}
                    </div>
                  )}

                  {msg.claims?.length > 0 && (
                    <div className="space-y-2" data-testid="agent-grounded-claims">
                      {msg.claims.map((claim, claimIndex) => (
                        <div key={claimIndex} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
                          <p>{claim.text}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(claim.citations || []).map(citation => (
                              <details key={citation.id} className="inline-block">
                                <summary className="cursor-pointer list-none rounded-full px-2 py-0.5 text-[9px] font-mono tone-ocean" style={{ background: 'rgba(67,124,148,0.1)' }}>{citation.id}</summary>
                                <div className="mt-1 max-w-xl rounded-md bg-[var(--color-surface)] p-2 text-[10px] text-[var(--color-text-dim)]">
                                  <strong>{citation.title}</strong><br />{citation.excerpt}<br />
                                  <span>Source type: {citation.type} · queried {citation.queryTimestamp || 'during this turn'}</span>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.insufficientEvidence && (
                    <div className="rounded-lg px-3 py-2 text-xs tone-sienna" data-testid="agent-insufficient-evidence" style={{ background: 'rgba(170,100,59,0.08)', border: '1px solid rgba(170,100,59,0.25)' }}>
                      Insufficient governed evidence was visible; no unsupported conclusion was generated.
                    </div>
                  )}
                  {msg.contradictions?.length > 0 && (
                    <div className="rounded-lg px-3 py-2 text-xs" data-testid="agent-contradictions" style={{ background: 'rgba(199,70,52,0.06)', border: '1px solid rgba(199,70,52,0.2)' }}>
                      <strong>Evidence needs reconciliation</strong>
                      <ul className="list-disc ml-4 mt-1">{msg.contradictions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                    </div>
                  )}

                  {msg.deepLinks?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.deepLinks.map(link => <a key={link.href} href={link.href} className="text-xs font-semibold tone-ocean underline">{link.label}</a>)}
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

                  {msg.security && (
                    <div className="flex flex-wrap gap-2 text-[9px] text-[var(--color-text-dim)]" data-agent-security>
                      <span>VPD user: <strong className="text-[var(--color-text)]">{msg.security.vpdUser}</strong></span>
                      <span>·</span>
                      <span>Scope: <strong className="text-[var(--color-text)]">{msg.security.accessScope}</strong></span>
                      <span>·</span>
                      <span>{msg.security.readOnly ? 'Read-only tool run' : 'Mutation run'}</span>
                    </div>
                  )}

                  {msg.trace && msg.trace.length > 0 && (
                    <details className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[10px]">
                      <summary className="cursor-pointer font-semibold">Orchestration trace</summary>
                      <ol className="mt-2 space-y-1 font-mono text-[var(--color-text-dim)]">
                        {msg.trace.map((step, traceIndex) => (
                          <li key={`${step.stage}-${traceIndex}`}>{traceIndex + 1}. {step.stage}: {step.status}{step.detail ? ` · ${Array.isArray(step.detail) ? step.detail.join(', ') : step.detail}` : ''}</li>
                        ))}
                      </ol>
                    </details>
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
              disabled={sending || conversationLoading}
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
    type: 'Ollama + Oracle SQL',
  },
};

export default function AgentConsole() {
  const { currentUser } = useUser();
  const [activeProfile, setActiveProfile] = useState('SC_LLAMA_PROFILE');
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [proposalRunning, setProposalRunning] = useState(false);
  const [proposalMessage, setProposalMessage] = useState('');
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

  const runGovernedProposalCycle = useCallback(async () => {
    if (proposalRunning || String(currentUser?.ROLE || '').toLowerCase() !== 'admin') return;
    const confirmed = window.confirm(
      'Create four governed review proposals in agent_actions? No orders, inventory, customers, or return decisions will be changed.'
    );
    if (!confirmed) return;
    setProposalRunning(true);
    setProposalMessage('');
    try {
      const result = await api.agents.runCycle();
      setProposalMessage(result.message);
      refetchActions();
    } catch (error) {
      setProposalMessage(error.message);
    } finally {
      setProposalRunning(false);
    }
  }, [currentUser, proposalRunning, refetchActions]);

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Retail AI Agent Console">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Server-owned conversations retain the selected user, VPD scope, dataset generation, specialist, and entity context. A deterministic router selects one of four bounded specialists before Oracle AI Database 26ai executes an allowlisted, read-only SQL, SQL/PGQ, exact Spatial distance, or generation-bound Vector Search query. <span className="font-mono text-[var(--color-text)]">Ollama (llama3.2)</span> can only phrase claims from those returned sources, and every accepted claim must pass citation, number, and inference validation. It cannot generate executable SQL, select another tool, or write an operational record.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label="llama3.2" color="pink" />
            <FeatureBadge label="Oracle SQL / SQL-PGQ Tools" color="orange" />
            <FeatureBadge label="Application Orchestration" color="blue" />
            <FeatureBadge label="agent_actions (Proposal Provenance)" color="blue" />
            <FeatureBadge label="event_stream (Native JSON)" color="yellow" />
            <FeatureBadge label="Vector RAG Retrieval" color="cyan" />
            <FeatureBadge label="Server-persisted Conversations" color="green" />
          </div>
          <SqlBlock code={`-- Runtime: server conversation -> deterministic route -> allowlisted Oracle tool
-- One read-only Oracle transaction runs in the selected user's VPD context.
-- Ollama sees aliased source packets only and cannot invoke a tool.

-- Example flow:
-- 1. Classify request as RETURNS_TRIAGE_AGENT
-- 2. Query RETAIL_RETURN_WORKBENCH_V
-- 3. Rank RETURN_EVIDENCE_INDEX with VECTOR_DISTANCE(..., COSINE)
-- 4. Validate every claim against stable source IDs
-- 5. Persist the bounded turn and telemetry for this user + dataset generation

-- Representative allowlisted specialist SQL (the router never generates SQL):
SELECT from_influencer, to_influencer, connection_type, strength
FROM GRAPH_TABLE (influencer_network
  MATCH (src IS influencer)-[edge IS connects_to]->(dst IS influencer)
  COLUMNS (src.influencer_id AS from_influencer,
           dst.influencer_id AS to_influencer,
           edge.connection_type AS connection_type,
           edge.strength AS strength));

SELECT ROUND(SDO_GEOM.SDO_DISTANCE(
  customer.location, center.location, 0.005, 'unit=MILE'), 1) AS distance_mi
FROM customers customer CROSS JOIN fulfillment_centers center;

SELECT source_type, source_id,
       VECTOR_DISTANCE(embedding,
         VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :question AS DATA),
         COSINE) AS distance
FROM return_evidence_index
WHERE generation_id = :generation_id;

INSERT INTO agent_conversation_turns (
  turn_id, conversation_id, owner_username, dataset_generation_id,
  turn_number, question, routed_team, route_status,
  route_metadata, answer_payload, evidence_metadata, telemetry_payload
) VALUES (:turn_id, :conversation_id, :username, :generation_id,
  :turn_number, :question, :team, :route_status,
  :route_json, :answer_json, :evidence_json, :telemetry_json);

UPDATE agent_conversations
SET last_team = :team, context_payload = :context_json,
    turn_count = :turn_number, updated_at = SYSTIMESTAMP
WHERE conversation_id = :conversation_id
  AND owner_username = :username;

INSERT INTO agent_runtime_telemetry (
  correlation_id, conversation_id, turn_id, owner_username,
  dataset_generation_id, event_type, event_payload, elapsed_ms
) VALUES (:correlation_id, :conversation_id, :turn_id, :username,
  :generation_id, 'agent_turn', :telemetry_json, :elapsed_ms);

COMMIT; -- the turn, bounded evidence, context, and telemetry are atomic

-- Explicit Admin cycle writes proposals only:
INSERT INTO agent_actions (agent_name, action_type, entity_type,
  entity_id, decision_payload, confidence, execution_status)
VALUES ('returns_triage_agent','review_proposal','returns',
  NULL, :json_payload, 0.90, 'proposed');`} />
          {/* Team / Agent / Tools grid */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Teams &amp; Tools</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { team: 'DEMAND_SIGNAL_AGENT', agent: 'DEMAND_SIGNAL_AGENT', tools: ['RETAIL_SIGNAL_SQL', 'CREATOR_GRAPH_QUERY'], color: '#A36472' },
                { team: 'FULFILLMENT_OPTIMIZATION_AGENT', agent: 'FULFILLMENT_OPTIMIZATION_AGENT', tools: ['RETAIL_INVENTORY_SQL', 'ORACLE_SPATIAL_ROUTE'], color: '#AA643B' },
                { team: 'COMMERCE_INTELLIGENCE_AGENT', agent: 'COMMERCE_INTELLIGENCE_AGENT', tools: ['RETAIL_COMMERCE_SQL'], color: '#4C825C' },
                { team: 'RETURNS_TRIAGE_AGENT', agent: 'RETURNS_TRIAGE_AGENT', tools: ['RETURN_WORKBENCH_SQL', 'RETURN_VECTOR_SEARCH'], color: '#C74634' },
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
              <span><strong className="text-[var(--color-text)]">7</strong> Oracle Tools</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">4</strong> Agents</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">4</strong> Tasks</span>
              <span>·</span>
              <span><strong className="text-[var(--color-text)]">4</strong> Teams</span>
            </div>
          </div>

          {/* Architecture flow */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Agent Architecture</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="Retail Business Question" sub="Demand · fulfillment · commerce · returns" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Server-owned conversation context" sub="User · VPD scope · dataset generation · entities" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Deterministic Intent + Entity Router" sub="Confidence · margin · clarification · handoff" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓ selects an allowlisted tool</div>
              <DiagramBox label="Oracle VPD-scoped read-only tool run" sub="SQL · SQL/PGQ · SDO_GEOM · AI Vector Search" color="#A36472" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Grounded Ollama Summary" sub="Claim citations validated · deterministic fallback" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Optional Admin Proposal Cycle" sub="Explicit confirmation · append-only provenance" color="#4F7D7B" />
            </div>
            <div className="rounded-lg p-2 text-[9px] mt-2" style={{ background: 'rgba(121,96,135,0.08)', border: '1px dashed rgba(121,96,135,0.3)', color: 'var(--color-text)' }}>
              <span className="font-semibold">Why keep Oracle in the loop?</span><br/>
              Oracle owns the live data, VPD boundary, SQL execution, Spatial and Vector Search. Ollama only phrases the bounded result.
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <RetailSceneStory scene="agents" />

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-users" className="agent-console-page-glyph tone-plum" /> Retail AI Agent Console
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Follow the AllTerrain investigation across governed Oracle tools, then use Ollama only to summarize the evidence those tools returned.
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

          <JetButton
            label={proposalRunning ? 'Creating proposals...' : 'Run governed proposal cycle'}
            iconClass="oj-fwk-icon oj-fwk-icon-checkmark"
            chroming="outlined"
            disabled={proposalRunning || String(currentUser?.ROLE || '').toLowerCase() !== 'admin'}
            onAction={runGovernedProposalCycle}
          />

        </div>
      </div>

      {proposalMessage && (
        <div className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm" role="status">
          {proposalMessage}
        </div>
      )}

      {/* ── Chat Agent ── */}
      <ChatAgent userKey={currentUser?.USERNAME} onActionLogged={() => { refetchActions(); }} />

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
            <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No governed agent proposals are visible in this user's VPD scope.</p>
          )}
        </div>
      </div>

    </div>
  );
}
