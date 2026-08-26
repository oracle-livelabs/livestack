import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useUser } from '../context/UserContext';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/TelcoStory';

const MODES = [
  { id: 'narrate', label: 'Narrate', iconClass: 'oj-fwk-icon-message-info', color: '#4F7D7B', desc: 'A structured operations briefing with finding, evidence, and implication.' },
  { id: 'chat',    label: 'Chat',    iconClass: 'oj-fwk-icon-info', color: '#437C94', desc: 'An ongoing conversation that remembers prior questions and invites follow-ups.' },
  { id: 'showsql', label: 'Show SQL', iconClass: 'oj-fwk-icon-tree-document', color: '#796087', desc: 'View generated SQL' },
  { id: 'runsql',  label: 'Run SQL',  iconClass: 'oj-fwk-icon-grid', color: '#AA643B', desc: 'Execute & return rows' },
];

const FOLLOW_UP_PROMPTS = [
  'Give me more details on the top result',
  'Break the top result down by region',
  'Show orders behind the top result',
];
const ASK_DATA_STORAGE_PREFIX = 'telecomLivestack.askData.v2';
const MAX_PERSISTED_MESSAGES = 30;
const MAX_PERSISTED_ROWS = 50;

const EXAMPLE_QUESTIONS = [
  { text: 'What are the top 5 telecom services by service revenue?', category: 'Telecom Services' },
  { text: 'Show me service revenue by service category', category: 'Service Revenue' },
  { text: 'How many subscriber signals have urgency score above 80?', category: 'Signals' },
  { text: 'Which network operations centers have the most available capacity?', category: 'Access' },
  { text: 'What service lines have the highest average request value?', category: 'Service Lines' },
  { text: 'What is the total service revenue from all service orders?', category: 'Subscriber Service Orders' },
  { text: 'How many service orders have a network signal source?', category: 'Subscriber Service Orders' },
  { text: 'What is the average subscriber-signal urgency score by signal source?', category: 'Signals' },
];

const FALLBACK_PROFILES = [
  {
    name: 'SC_LLAMA_PROFILE',
    label: 'llama3.2',
    model: 'llama3.2',
    provider: 'Runtime Profile + Oracle SQL',
    desc: 'Primary local reasoning profile',
  },
];

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function conversationStorageKey(username) {
  return `${ASK_DATA_STORAGE_PREFIX}.${username || 'anonymous'}`;
}

function restoreConversation(username) {
  if (typeof window === 'undefined' || !username) return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(conversationStorageKey(username)) || 'null');
    if (!saved || !Array.isArray(saved.messages)) return null;
    return {
      messages: saved.messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
        ...message,
        time: message.time ? new Date(message.time) : new Date(),
      })),
      mode: MODES.some((entry) => entry.id === saved.mode) ? saved.mode : 'narrate',
      profile: typeof saved.profile === 'string' ? saved.profile : FALLBACK_PROFILES[0].name,
    };
  } catch (_) {
    return null;
  }
}

function persistableMessages(messages) {
  return messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
    ...message,
    rows: Array.isArray(message.rows) ? message.rows.slice(0, MAX_PERSISTED_ROWS) : message.rows,
    time: message.time instanceof Date ? message.time.toISOString() : message.time,
  }));
}

function buildConversationHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-12)
    .map((message) => ({
      role: message.role,
      mode: message.mode,
      text: message.text || '',
      sql: message.role === 'assistant' ? message.sql || '' : '',
      columns: message.role === 'assistant' ? message.columns || [] : [],
      rows: message.role === 'assistant' && Array.isArray(message.rows) ? message.rows.slice(0, 6) : [],
      rowCount: message.role === 'assistant' ? Number(message.rowCount || 0) : 0,
    }));
}

export default function AskData() {
  const { currentUser } = useUser();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('narrate');
  const [profile, setProfile] = useState(FALLBACK_PROFILES[0].name);
  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const messagesEndRef = useRef(null);
  const skipNextPersistenceRef = useRef(true);
  const userKey = currentUser?.USERNAME || '';
  const activeMode = MODES.find((entry) => entry.id === mode) || MODES[0];
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));

  // Keep each demo user's conversation separate and restore it across scene changes/reloads.
  useEffect(() => {
    if (!userKey) return;
    skipNextPersistenceRef.current = true;
    const saved = restoreConversation(userKey);
    setMessages(saved?.messages || []);
    setMode(saved?.mode || 'narrate');
    if (saved?.profile) setProfile(saved.profile);
    setInput('');
  }, [userKey]);

  useEffect(() => {
    if (!userKey || typeof window === 'undefined') return;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(conversationStorageKey(userKey), JSON.stringify({
        version: 2,
        mode,
        profile,
        messages: persistableMessages(messages),
      }));
    } catch (_) {
      // Persistence is a convenience; the active conversation still works in memory.
    }
  }, [messages, mode, profile, userKey]);

  // Fetch available AI profiles from the database
  useEffect(() => {
    let cancelled = false;
    api.selectai.profiles().then(data => {
      const list = (data.profiles || [])
        .filter(p => p.name.startsWith('SC_') && p.status === 'ENABLED' && p.name !== 'SC_EMBED_PROFILE')
        .map((p, index) => ({
          name: p.name,
          label: p.model || getProfileDisplayLabel(p.name, index),
          model: p.model || getProfileDisplayLabel(p.name, index),
          provider: p.provider || 'Runtime Profile + Oracle SQL',
          desc: p.type || p.description || 'Natural language SQL mode',
        }));
      if (!cancelled && list.length) {
        setProfiles(list);
        setProfile((current) => {
          if (list.some((item) => item.name === current)) return current;
          if (data.activeProfile && list.some((item) => item.name === data.activeProfile)) return data.activeProfile;
          return list[0].name;
        });
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    const history = buildConversationHistory(messages);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, mode, profile, model: activeModelLabel, time: new Date() }]);
    setSending(true);

    try {
      let response;
      if (mode === 'narrate') {
        const result = await api.selectai.chat(question, true, profile, history);
        response = {
          role: 'assistant',
          mode: 'narrate',
          text: result.answer,
          sql: result.sql,
          columns: result.columns || [],
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      } else if (mode === 'chat') {
        const result = await api.selectai.chatMode(question, true, profile, history);
        response = {
          role: 'assistant',
          mode: 'chat',
          text: result.answer,
          sql: result.sql,
          columns: result.columns || [],
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      } else if (mode === 'showsql') {
        const result = await api.selectai.showsql(question, profile, history);
        response = {
          role: 'assistant',
          mode: 'showsql',
          text: null,
          sql: result.sql,
          elapsed: result.elapsed || null,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      } else {
        const result = await api.selectai.runsql(question, profile, history);
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
          time: new Date(),
        };
      }
      setMessages(prev => [...prev, response]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'error',
        text: err.message,
        time: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, mode, profile, activeModelLabel, messages]);

  const clearChat = useCallback(() => {
    skipNextPersistenceRef.current = true;
    if (typeof window !== 'undefined' && userKey) {
      window.localStorage.removeItem(conversationStorageKey(userKey));
    }
    setMessages([]);
    setInput('');
  }, [userKey]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="space-y-6 fade-in">

      {/* Oracle Internals */}
      <RegisterOraclePanel title="Ask Telecom Operations Data">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow for governed telecom operations questions.
              Your question is sent to the selected runtime profile with schema context,
              then Oracle AI Database 26ai executes the generated SQL against the live schema and returns rows for the UI to summarize or display.
              Oracle AI Database 26ai remains the system of record for data and SQL execution; the language model runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Runtime Profile" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="Live Oracle Schema" color="blue" />
          </div>
          <SqlBlock code={`-- Ask Data runtime: question -> runtime profile -> Oracle SQL -> UI answer
-- Four modes available:

-- NARRATE: draft SQL, execute it, summarize results
-- CHAT: draft SQL, execute it, return a conversational explanation
-- SHOWSQL: inspect the generated SQL before execution
-- RUNSQL: execute the generated SQL and return raw rows

-- Example question:
-- "What are the top telecom services by service revenue?"

SELECT
  p.product_name AS care_service,
  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS service_value
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
GROUP BY p.product_name
ORDER BY service_value DESC
FETCH FIRST 5 ROWS ONLY;

-- Behind the scenes:
-- 1. The app sends the question + schema hints to the runtime profile (${activeModelLabel})
-- 2. The runtime profile drafts SQL for the selected mode
-- 3. Oracle executes the SQL against live tables
-- 4. The UI renders rows or a narrated answer`} />

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="App builds prompt + schema context" sub="Includes the selected runtime profile" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label={`Runtime profile (${activeModelLabel})`} sub="Drafts SQL or a narrated response plan" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Oracle executes generated SQL" sub="Runs against the live schema and returns rows" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns rows or narration" sub="Results stay grounded in Oracle query execution" color="#4C825C" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(79,125,123,0.08)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
            <span className="font-semibold">Key insight:</span> The runtime profile handles the language reasoning,
            while Oracle AI Database 26ai remains the source of truth for query execution and result retrieval.
            This page shows the generated SQL so you can inspect what runs against the schema.
          </div>
        </div>
      </RegisterOraclePanel>

      <SceneStoryPanel scene="askdata" />

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Ask Telecom Operations Data
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask Seer Comms mobile network, service, subscriber, revenue, and capacity questions in plain English against live governed operations data.
        </p>
      </div>

      {/* Chat card */}
      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
        {/* Header bar */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Telecom Operations Q&A</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Powered by <span className="tone-plum">Runtime profile ({activeModelLabel})</span> · {activeProfile?.desc || 'Runtime Profile'} · Oracle AI Database 26ai
              </p>
              <p className="text-[9px] tone-pine mt-0.5">
                Conversation memory on · saved for {currentUser?.FULL_NAME || 'this user'}
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
                {activeProfile?.desc || 'Runtime Profile'} · {activeProfile?.provider || 'Runtime Profile + Oracle SQL'}
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
        <div className="askdata-mode-experience" style={{ '--askdata-mode-color': activeMode.color }}>
          <span className="askdata-mode-experience__label">{activeMode.label} experience</span>
          <span>{activeMode.desc}</span>
        </div>

        {/* Messages area */}
        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'var(--color-surface)' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <JetGlyph iconClass="oj-fwk-icon-magnifier" className="askdata-empty-glyph tone-teal" />
                <p className="text-sm text-[var(--color-text-dim)]">Ask anything about demo subscriber operations data in plain English</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  The runtime drafts SQL, Oracle executes it, and the app explains or displays the results
                </p>
              </div>

              {/* Tables available */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {[
                  'Service orders',
                  'Mobile services',
                  'Demo subscribers',
                  'Subscriber signals',
                  'Service lines',
                  'Network sites',
                  'Network capacity',
                  'Field dispatch',
                ].map(t => (
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
                        {msg.mode === 'narrate' ? 'OPERATIONS BRIEF' : msg.mode === 'chat' ? 'AI CONVERSATION' : `OLLAMA ${msg.mode || 'narrate'}`}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded surface-plum-soft tone-plum font-mono">
                        {msg.model || activeModelLabel}
                      </span>
                      {msg.error && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded surface-sienna-soft tone-sienna flex items-center gap-1">
                          <JetGlyph iconClass="oj-fwk-icon-message-warning" /> Could not generate query
                        </span>
                      )}
                      {msg.elapsed && (
                        <span className="text-[10px] text-[var(--color-text-dim)] ml-auto flex items-center gap-1">
                          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" /> {msg.elapsed}ms
                        </span>
                      )}
                    </div>

                    {/* Narrate mode: answer text + collapsible SQL */}
                    {msg.mode === 'narrate' && (
                      <>
                        <div className="askdata-narrative-brief whitespace-pre-wrap">
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
                        <div className="askdata-chat-response whitespace-pre-wrap">
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

                    {(msg.mode === 'narrate' || msg.mode === 'chat') && i === messages.length - 1 && !sending && (
                      <div className="askdata-followups" aria-label="Suggested follow-up questions">
                        <span className="askdata-followups__label">Continue this conversation</span>
                        <div className="flex flex-wrap gap-1.5">
                          {FOLLOW_UP_PROMPTS.map((prompt) => (
                            <button key={prompt} type="button" className="askdata-followup-chip" onClick={() => sendMessage(prompt)}>
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
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
