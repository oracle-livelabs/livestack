import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { RetailSceneStory } from '../components/RetailStory';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';

const MODES = [
  { id: 'narrate', label: 'Narrate', iconClass: 'oj-fwk-icon-message-info', color: '#4F7D7B', desc: 'Natural language answer' },
  { id: 'chat',    label: 'Chat',    iconClass: 'oj-fwk-icon-info', color: '#437C94', desc: 'Conversational response' },
  { id: 'showsql', label: 'Show SQL', iconClass: 'oj-fwk-icon-tree-document', color: '#796087', desc: 'View generated SQL' },
  { id: 'runsql',  label: 'Run SQL',  iconClass: 'oj-fwk-icon-grid', color: '#AA643B', desc: 'Execute & return rows' },
];

const EXAMPLE_QUESTIONS = [
  { text: 'Which Seer Sporting Goods product categories have the highest service value exposure?', category: 'Service' },
  { text: 'Which sporting-goods products have the highest post-purchase service exposure this week?', category: 'Service' },
  { text: 'Which demand signals mention damaged packaging or sizing complaints for hiking or footwear products?', category: 'Signals' },
  { text: 'Show high-risk service cases for outdoor gear by category and channel.', category: 'Service' },
  { text: 'Which fulfillment centers have inventory risk for AllTerrain Hiking Boots?', category: 'Fulfillment' },
  { text: 'Which fulfillment centers have inventory risk for high-momentum outdoor products?', category: 'Fulfillment' },
  { text: 'What customer trend signals for sporting goods have momentum score above 80?', category: 'Signals' },
  { text: 'Which creators are associated with outdoor products that have high service risk?', category: 'Graph' },
  { text: 'What is the total revenue from orders with open service cases?', category: 'Orders' },
];

const FALLBACK_PROFILES = [
  {
    name: 'SC_LLAMA_PROFILE',
    label: 'llama3.2',
    model: 'llama3.2',
    provider: 'Ollama + Oracle SQL',
    desc: 'Primary local Ollama model',
  },
];

const ASK_CONVERSATION_STORAGE_PREFIX = 'retail.ask-data.conversation.v1';
const MAX_PERSISTED_MESSAGES = 24;

function conversationStorageKey(username, generationId, profile) {
  return [
    ASK_CONVERSATION_STORAGE_PREFIX,
    username || 'anonymous',
    generationId || 'unknown-generation',
    profile || 'default-profile',
  ].join(':');
}

function compactPersistedMessage(message) {
  if (!message || !['user', 'assistant', 'error'].includes(message.role)) return null;
  return {
    ...message,
    text: typeof message.text === 'string' ? message.text.slice(0, 4000) : message.text,
    sql: typeof message.sql === 'string' ? message.sql.slice(0, 6000) : message.sql,
    rows: Array.isArray(message.rows) ? message.rows.slice(0, 10) : message.rows,
    time: message.time instanceof Date ? message.time.toISOString() : message.time,
  };
}

function loadConversationState(key) {
  if (typeof window === 'undefined') return { messages: [], conversation: null };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    if (!parsed || !Array.isArray(parsed.messages)) return { messages: [], conversation: null };
    return {
      messages: parsed.messages
        .map(compactPersistedMessage)
        .filter(Boolean)
        .slice(-MAX_PERSISTED_MESSAGES),
      conversation: parsed.conversation?.version === 1 ? parsed.conversation : null,
    };
  } catch (_) {
    return { messages: [], conversation: null };
  }
}

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

export default function AskData() {
  const { currentUser } = useUser();
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [hydratedStorageKey, setHydratedStorageKey] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('narrate');
  const [profile, setProfile] = useState(FALLBACK_PROFILES[0].name);
  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const messagesEndRef = useRef(null);
  const activeRequestRef = useRef(null);
  const requestGenerationRef = useRef(0);
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));

  const { data: profileData, error: profileError } = useData(
    () => api.selectai.profiles(),
    [currentUser?.USERNAME]
  );
  const { data: datasetData } = useData(
    () => api.import.dataset(),
    [currentUser?.USERNAME]
  );
  const datasetGenerationId = datasetData?.activeDataset?.generationId || null;
  const storageKey = conversationStorageKey(
    currentUser?.USERNAME,
    datasetGenerationId,
    profile
  );
  const currentStorageKeyRef = useRef(storageKey);
  currentStorageKeyRef.current = storageKey;

  // Refresh the mounted runtime-profile surface on persona and dataset
  // generation switches. useData rejects aborted/stale responses.
  useEffect(() => {
    const list = (profileData?.profiles || [])
      .filter(p => p.name.startsWith('SC_') && p.status === 'ENABLED' && p.name !== 'SC_EMBED_PROFILE')
      .map((p, index) => ({
        name: p.name,
        label: p.model || getProfileDisplayLabel(p.name, index),
        model: p.model || getProfileDisplayLabel(p.name, index),
        provider: p.provider || 'Ollama + Oracle SQL',
        desc: p.type || p.description || 'Natural language SQL mode',
      }));
    if (!list.length) return;
    setProfiles(list);
    setProfile((current) => {
      if (list.some((item) => item.name === current)) return current;
      if (profileData.activeProfile
          && list.some((item) => item.name === profileData.activeProfile)) {
        return profileData.activeProfile;
      }
      return list[0].name;
    });
  }, [profileData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    requestGenerationRef.current += 1;
    const restored = loadConversationState(storageKey);
    setMessages(restored.messages);
    setConversation(restored.conversation);
    setInput('');
    setSending(false);
    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratedStorageKey !== storageKey) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({
        messages: messages
          .map(compactPersistedMessage)
          .filter(Boolean)
          .slice(-MAX_PERSISTED_MESSAGES),
        conversation,
      }));
    } catch (_) {
      // Session persistence is optional and must never block governed queries.
    }
  }, [conversation, hydratedStorageKey, messages, storageKey]);

  useEffect(() => () => {
    activeRequestRef.current?.abort();
    requestGenerationRef.current += 1;
  }, []);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    const requestGeneration = ++requestGenerationRef.current;
    const controller = new AbortController();
    activeRequestRef.current?.abort();
    activeRequestRef.current = controller;
    const requestStorageKey = storageKey;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, mode, profile, model: activeModelLabel, time: new Date() }]);
    setSending(true);

    try {
      let response;
      if (mode === 'narrate') {
        const result = await api.selectai.chat(question, true, profile, conversation, { signal: controller.signal });
        response = {
          role: 'assistant',
          mode: 'narrate',
          text: result.answer,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          conversation: result.conversation,
          security: result.security,
          correlationId: result.correlationId,
          time: new Date(),
        };
      } else if (mode === 'chat') {
        const result = await api.selectai.chatMode(question, true, profile, conversation, { signal: controller.signal });
        response = {
          role: 'assistant',
          mode: 'chat',
          text: result.answer,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          conversation: result.conversation,
          security: result.security,
          correlationId: result.correlationId,
          time: new Date(),
        };
      } else if (mode === 'showsql') {
        const result = await api.selectai.showsql(question, profile, conversation, { signal: controller.signal });
        response = {
          role: 'assistant',
          mode: 'showsql',
          text: null,
          sql: result.sql,
          elapsed: result.elapsed || null,
          profile: result.profile,
          model: result.model,
          conversation: result.conversation,
          security: result.security,
          correlationId: result.correlationId,
          time: new Date(),
        };
      } else {
        const result = await api.selectai.runsql(question, profile, conversation, { signal: controller.signal });
        response = {
          role: 'assistant',
          mode: 'runsql',
          columns: result.columns || [],
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          sql: result.sql,
          elapsed: result.elapsed,
          profile: result.profile,
          model: result.model,
          conversation: result.conversation,
          security: result.security,
          correlationId: result.correlationId,
          time: new Date(),
        };
      }
      if (controller.signal.aborted
          || requestGeneration !== requestGenerationRef.current
          || requestStorageKey !== currentStorageKeyRef.current) return;
      if (response.conversation) setConversation(response.conversation);
      setMessages(prev => [...prev, response]);
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return;
      if (requestGeneration !== requestGenerationRef.current
          || requestStorageKey !== currentStorageKeyRef.current) return;
      if (err.status === 409) setConversation(null);
      setMessages(prev => [...prev, {
        role: 'error',
        text: err.message,
        code: err.code || err.category || null,
        category: err.category || null,
        time: new Date(),
      }]);
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      if (requestGeneration === requestGenerationRef.current
          && requestStorageKey === currentStorageKeyRef.current) {
        setSending(false);
      }
    }
  }, [input, sending, mode, profile, activeModelLabel, conversation, storageKey]);

  const clearChat = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    requestGenerationRef.current += 1;
    setMessages([]);
    setConversation(null);
    setInput('');
    setSending(false);
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="space-y-6 fade-in">

      {/* Oracle Internals */}
      <RegisterOraclePanel title="Ask Retail Data">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow.
              Your question is sent to <span className="tone-plum font-mono">Ollama ({activeModelLabel})</span> with schema context and the selected runtime profile,
              then a server-side validator accepts exactly one allowlisted read-only <span className="font-mono">SELECT</span> or <span className="font-mono">WITH</span> statement before Oracle executes it in the active user&apos;s read-only VPD session.
              Oracle AI Database 26ai remains the system of record for data and SQL execution; the language model runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="Live Oracle Schema" color="blue" />
            <FeatureBadge label="Read-only SQL allowlist" color="green" />
            <FeatureBadge label="Oracle VPD identity" color="red" />
            <FeatureBadge label="6-turn bounded context" color="yellow" />
          </div>
          <SqlBlock code={`-- Ask Retail Data runtime: question -> Ollama -> Oracle SQL -> UI answer
-- Four modes available:

-- NARRATE: draft SQL, execute it, summarize results
-- CHAT: draft SQL, execute it, return a conversational explanation
-- SHOWSQL: inspect the generated SQL before execution
-- RUNSQL: execute the generated SQL and return raw rows

-- Example question:
-- "Which fulfillment centers have inventory risk for AllTerrain Hiking Boots?"

SELECT center_name, city, state_province, product_name,
       quantity_on_hand, quantity_reserved,
       quantity_incoming, reorder_point, reorder_qty,
       inventory_risk
FROM retail_fulfillment_risk_v
WHERE UPPER(product_name) = UPPER('AllTerrain Hiking Boots')
  AND inventory_risk = 'AT_RISK'
ORDER BY (reorder_point - quantity_on_hand) DESC,
         center_name

-- Behind the scenes:
-- 1. Follow-ups are resolved from sanitized prior-turn metadata.
-- 2. A deterministic known-question route may emit the SQL above;
--    otherwise Ollama (${activeModelLabel}) drafts Oracle SQL.
-- 3. The allowlist rejects DML, DDL, PL/SQL, system metadata,
--    comments, multiple statements, and unsupported tables.
-- 4. Oracle executes with maxRows=200 in a read-only VPD session.
-- 5. Retryable Oracle SQL errors may be repaired twice and revalidated.`} />

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Conversation resolver" sub="Up to 6 sanitized turns · dataset/profile bound" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label={`Ollama (${activeModelLabel})`} sub="Drafts SQL or a narrated response plan" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Validator + Oracle VPD execution" sub="One read-only allowlisted query · maximum 200 rows" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns rows or narration" sub="Results stay grounded in Oracle query execution" color="#4C825C" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(79,125,123,0.08)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
            <span className="font-semibold">Key insight:</span> Ollama handles the language reasoning,
            while Oracle AI Database 26ai remains the source of truth for query execution and result retrieval.
            The browser keeps messages and the bounded conversation envelope in session storage, keyed by user, dataset generation, and profile. Prior SQL is never trusted or re-executed as conversation context.
          </div>
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Ask Retail Data
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask retail questions in plain English while Oracle AI Database 26ai remains the source of truth for SQL execution and results.
        </p>
        <p className="text-xs text-[var(--color-text-dim)] mt-2">
          Oracle Database Select AI is outside this parity wave. This mounted
          scene retains the existing application and Ollama SQL-assistance
          flow without claiming native Select AI evidence.
        </p>
      </div>

      <RetailSceneStory scene="askdata" />

      {profileError && (
        <div
          className="glass-card p-4 border border-[var(--color-danger)]/40"
          data-testid="ask-profiles-unavailable"
          role="alert"
        >
          <p className="font-semibold tone-red">
            Ask Retail Data runtime profiles are unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            The runtime profile endpoint failed. The mounted scene remains
            visible, but no healthy profile evidence is inferred from fallback
            labels.
          </p>
        </div>
      )}

      {/* Chat card */}
      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
        {/* Header bar */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Ask Retail Data Chat</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Powered by <span className="tone-plum">Ollama ({activeModelLabel})</span> · {activeProfile?.desc || 'Runtime Profile'} · Oracle AI Database 26ai
              </p>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-0.5" data-testid="ask-conversation-status">
                {conversation?.sequence
                  ? `Conversation ${conversation.id?.slice(0, 8) || 'active'} · ${conversation.sequence} grounded turn${conversation.sequence === 1 ? '' : 's'}`
                  : 'New scoped conversation'}
                {datasetGenerationId ? ` · generation ${datasetGenerationId}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="askdata-profile-select">
              <JetSelectSingle
                value={profile}
                options={profileOptions}
                ariaLabel="Runtime profile"
                className="askdata-profile-select__control"
                onValueChange={setProfile}
              />
              <p className="askdata-profile-select__meta">
                {activeProfile?.desc || 'Runtime Profile'} · {activeProfile?.provider || 'Ollama + Oracle SQL'}
              </p>
            </div>
            {messages.length > 0 && (
              <JetButton
                label="Clear"
                iconClass="oj-fwk-icon oj-fwk-icon-cross"
                chroming="outlined"
                className="askdata-clear-button"
                onAction={clearChat}
              />
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-semibold mr-1">Mode:</span>
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <JetButton
                key={m.id}
                label={m.label}
                iconClass={`oj-fwk-icon ${m.iconClass}`}
                chroming={active ? 'callToAction' : 'outlined'}
                className="askdata-mode-button"
                onAction={() => setMode(m.id)}
              />
            );
          })}
        </div>

        {/* Messages area */}
        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'var(--color-surface)' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <JetGlyph iconClass="oj-fwk-icon-magnifier" className="askdata-empty-glyph tone-teal" />
                <p className="text-sm text-[var(--color-text-dim)]">Ask anything about your data in plain English</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  Ollama drafts the SQL, Oracle executes it, and the app explains or displays the results
                </p>
              </div>

              {/* Tables available */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {['orders', 'products', 'customers', 'social_posts', 'brands', 'fulfillment_centers', 'inventory', 'shipments'].map(t => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-mono"
                    style={{
                      background: 'var(--color-surface-muted)',
                      color: 'var(--color-text)',
                      border: '1px solid rgba(121,96,135,0.28)',
                      boxShadow: 'inset 0 2px 0 rgba(121,96,135,0.75)',
                    }}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Example questions */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {EXAMPLE_QUESTIONS.map((eq, i) => (
                  <div key={i} className="askdata-example-tile">
                    <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-semibold">{eq.category}</span>
                    <p className="askdata-example-question">{eq.text}</p>
                    <JetButton
                      label="Ask"
                      iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                      chroming="outlined"
                      className="askdata-example-button"
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
                    <div>
                      <div className="px-4 py-2.5 rounded-2xl rounded-br-md text-sm"
                        style={{ background: 'rgba(79,125,123,0.15)', border: '1px solid rgba(79,125,123,0.25)' }}>
                        {msg.text}
                      </div>
                      {msg.mode && (
                        <div className="text-right mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#6F757E'}15`, color: MODES.find(m => m.id === msg.mode)?.color || '#6F757E' }}>
                            MODE {msg.mode}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(79,125,123,0.2)' }}>
                      <JetGlyph iconClass="oj-fwk-icon-users" className="tone-teal" />
                    </div>
                  </div>
                )}

                {/* Assistant response */}
                {msg.role === 'assistant' && (
                  <div className="space-y-2">
                    {/* Badge + timing */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#796087'}30` }}>
                        <JetGlyph iconClass="oj-fwk-icon-grid" style={{ color: MODES.find(m => m.id === msg.mode)?.color || '#796087' }} />
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#796087'}20`, color: MODES.find(m => m.id === msg.mode)?.color || '#796087' }}>
                        OLLAMA {msg.mode || 'narrate'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded surface-plum-soft tone-plum font-mono">
                        {msg.model || activeModelLabel}
                      </span>
                      {msg.error && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded surface-sienna-soft tone-sienna flex items-center gap-1">
                          <JetGlyph iconClass="oj-fwk-icon-message-warning" /> Could not generate query
                        </span>
                      )}
                      {msg.conversation?.usedPriorContext && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded surface-teal-soft tone-teal" data-testid="ask-followup-context-used">
                          FOLLOW-UP CONTEXT
                        </span>
                      )}
                      {msg.elapsed && (
                        <span className="text-[10px] text-[var(--color-text-dim)] ml-auto flex items-center gap-1">
                          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" /> {msg.elapsed}ms
                        </span>
                      )}
                    </div>

                    {msg.conversation?.usedPriorContext && msg.conversation?.resolvedQuestion && (
                      <details className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[10px]">
                        <summary className="cursor-pointer font-semibold">Resolved follow-up</summary>
                        <p className="mt-2 text-[var(--color-text-dim)]">
                          {msg.conversation.resolvedQuestion}
                        </p>
                      </details>
                    )}

                    {msg.security && (
                      <div className="flex flex-wrap gap-2 text-[9px] text-[var(--color-text-dim)]" data-testid="ask-security-boundary">
                        <span>VPD user: <strong className="text-[var(--color-text)]">{msg.security.vpdUser}</strong></span>
                        <span>·</span>
                        <span>Scope: <strong className="text-[var(--color-text)]">{msg.security.accessScope}</strong></span>
                        <span>·</span>
                        <span>{msg.security.readOnly ? 'Read-only SQL execution' : 'Mutation execution'}</span>
                      </div>
                    )}

                    {/* Narrate mode: answer text + collapsible SQL */}
                    {msg.mode === 'narrate' && (
                      <>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                          {msg.text}
                        </div>
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] tone-plum cursor-pointer hover:tone-plum transition-colors select-none">
                              <JetGlyph iconClass="oj-fwk-icon-tree-document" />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-plum-soft">
                              <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider"
                                style={{ background: 'rgba(121,96,135,0.08)', borderBottom: '1px solid rgba(121,96,135,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed"
                                style={{ background: 'var(--color-surface-muted)' }}>
                                {msg.sql}
                              </pre>
                            </div>
                          </details>
                        )}
                      </>
                    )}

                    {/* Chat mode: conversational answer + collapsible SQL */}
                    {msg.mode === 'chat' && (
                      <>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ background: 'rgba(67,124,148,0.05)', border: '1px solid rgba(67,124,148,0.2)' }}>
                          {msg.text}
                        </div>
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] tone-plum cursor-pointer hover:tone-plum transition-colors select-none">
                              <JetGlyph iconClass="oj-fwk-icon-tree-document" />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-plum-soft">
                              <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider"
                                style={{ background: 'rgba(121,96,135,0.08)', borderBottom: '1px solid rgba(121,96,135,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed"
                                style={{ background: 'var(--color-surface-muted)' }}>
                                {msg.sql}
                              </pre>
                            </div>
                          </details>
                        )}
                      </>
                    )}

                    {/* ShowSQL mode: SQL prominently displayed */}
                    {msg.mode === 'showsql' && msg.sql && (
                      <div className="rounded-lg overflow-hidden border border-plum-soft">
                        <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider flex items-center gap-1.5"
                          style={{ background: 'rgba(121,96,135,0.12)', borderBottom: '1px solid rgba(121,96,135,0.2)' }}>
                          <JetGlyph iconClass="oj-fwk-icon-tree-document" /> Generated SQL
                        </div>
                        <pre className="px-4 py-3 text-[12px] font-mono tone-plum overflow-x-auto leading-relaxed"
                          style={{ background: 'var(--color-surface-muted)' }}>
                          {msg.sql}
                        </pre>
                      </div>
                    )}

                    {/* RunSQL mode: table results + collapsible SQL */}
                    {msg.mode === 'runsql' && (
                      <>
                        {msg.rows?.length > 0 ? (
                          <div className="rounded-2xl rounded-tl-md overflow-hidden"
                            style={{ border: '1px solid rgba(170,100,59,0.2)' }}>
                            <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-semibold tone-sienna uppercase tracking-wider"
                              style={{ background: 'rgba(170,100,59,0.08)', borderBottom: '1px solid rgba(170,100,59,0.15)' }}>
                              <JetGlyph iconClass="oj-fwk-icon-grid" />
                              {msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''} returned
                            </div>
                            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'rgba(170,100,59,0.05)' }}>
                                    {(msg.columns?.length ? msg.columns : Object.keys(msg.rows[0])).map(col => (
                                      <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold tone-sienna uppercase tracking-wider whitespace-nowrap"
                                        style={{ borderBottom: '1px solid rgba(170,100,59,0.15)' }}>
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-[var(--color-surface)]/50 transition-colors"
                                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      {Object.values(row).map((val, j) => (
                                        <td key={j} className="px-3 py-2 whitespace-nowrap font-mono text-[var(--color-text)]">
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
                        ) : (
                          <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm text-[var(--color-text-dim)]"
                            style={{ background: 'rgba(170,100,59,0.05)', border: '1px solid rgba(170,100,59,0.2)' }}>
                            No results found.
                          </div>
                        )}
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] tone-plum cursor-pointer hover:tone-plum transition-colors select-none">
                              <JetGlyph iconClass="oj-fwk-icon-tree-document" />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-plum-soft">
                              <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider"
                                style={{ background: 'rgba(121,96,135,0.08)', borderBottom: '1px solid rgba(121,96,135,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed"
                                style={{ background: 'var(--color-surface-muted)' }}>
                                {msg.sql}
                              </pre>
                            </div>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Error */}
                {msg.role === 'error' && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(199,70,52,0.2)' }}>
                      <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" />
                    </div>
                    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md text-sm tone-red"
                      style={{ background: 'rgba(199,70,52,0.08)', border: '1px solid rgba(199,70,52,0.2)' }}>
                      {msg.text}
                      {(msg.code || msg.category) && (
                        <p className="mt-1 text-[9px] font-mono opacity-80">{msg.code || msg.category}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${MODES.find(m => m.id === mode)?.color || '#796087'}30` }}>
                <JetGlyph iconClass="oj-fwk-icon-grid" style={{ color: MODES.find(m => m.id === mode)?.color || '#796087' }} />
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-[var(--color-text-dim)]"
                style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                <JetProgressCircle size="sm" className="askdata-loading-progress" ariaLabel="Generating response" />
                {mode === 'narrate' ? 'Generating SQL & narrating results...' : mode === 'chat' ? 'Generating response...' : mode === 'showsql' ? 'Generating SQL...' : 'Generating & executing SQL...'}
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
                ariaLabel="Ask a data question"
                placeholder={mode === 'narrate' ? 'Ask a question - get a natural language answer...' : mode === 'chat' ? 'Ask a question - get a conversational response...' : mode === 'showsql' ? 'Ask a question - see the generated SQL...' : 'Ask a question - run the SQL and get results...'}
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

    </div>
  );
}
