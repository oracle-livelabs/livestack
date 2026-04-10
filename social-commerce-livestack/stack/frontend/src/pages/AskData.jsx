import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquareText, Send, Loader2, User, Database, Code2, RotateCcw, Sparkles, Clock, AlertCircle, FileText, TableProperties, MessagesSquare, ChevronDown } from 'lucide-react';
import { api } from '../utils/api';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

const MODES = [
  { id: 'narrate', label: 'Narrate', icon: MessageSquareText, color: '#1AADA8', desc: 'Natural language answer' },
  { id: 'chat',    label: 'Chat',    icon: MessagesSquare, color: '#3B82F6', desc: 'Conversational response' },
  { id: 'showsql', label: 'Show SQL', icon: Code2, color: '#B89AD4', desc: 'View generated SQL' },
  { id: 'runsql',  label: 'Run SQL',  icon: TableProperties, color: '#F59E0B', desc: 'Execute & return rows' },
];

const EXAMPLE_QUESTIONS = [
  { text: 'What are the top 5 best-selling products by revenue?', category: 'Products' },
  { text: 'Show me revenue by product category', category: 'Revenue' },
  { text: 'How many social posts have virality score above 80?', category: 'Social' },
  { text: 'Which fulfillment centers have the most inventory?', category: 'Fulfillment' },
  { text: 'What brands have the highest average order value?', category: 'Brands' },
  { text: 'What is the total revenue from all orders?', category: 'Orders' },
  { text: 'How many orders have a social media source?', category: 'Orders' },
  { text: 'What is the average virality score by platform?', category: 'Social' },
];

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

export default function AskData() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('narrate');
  const [profile, setProfile] = useState('SC_LLAMA_PROFILE');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const profileRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch available AI profiles from the database
  useEffect(() => {
    api.agents.profiles().then(data => {
      const list = (data.profiles || [])
        .filter(p => p.name.startsWith('SC_') && p.status === 'ENABLED' && p.name !== 'SC_EMBED_PROFILE')
        .map((p, index) => ({
          name: p.name,
          label: p.model || getProfileDisplayLabel(p.name, index),
          provider: 'Ollama + Oracle SQL',
          desc: p.type || p.description || 'Natural language SQL mode',
        }));
      if (list.length) setProfiles(list);
    }).catch(() => {});
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, mode, time: new Date() }]);
    setSending(true);

    try {
      let response;
      if (mode === 'narrate') {
        const result = await api.selectai.chat(question, true, profile);
        response = {
          role: 'assistant',
          mode: 'narrate',
          text: result.answer,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          time: new Date(),
        };
      } else if (mode === 'chat') {
        const result = await api.selectai.chatMode(question, true, profile);
        response = {
          role: 'assistant',
          mode: 'chat',
          text: result.answer,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          time: new Date(),
        };
      } else if (mode === 'showsql') {
        const result = await api.selectai.showsql(question, profile);
        response = {
          role: 'assistant',
          mode: 'showsql',
          text: null,
          sql: result.sql,
          elapsed: result.elapsed || null,
          time: new Date(),
        };
      } else {
        const result = await api.selectai.runsql(question, profile);
        response = {
          role: 'assistant',
          mode: 'runsql',
          columns: result.columns || [],
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          sql: result.sql,
          elapsed: result.elapsed,
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
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, sending, mode]);

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
    <div className="space-y-6 fade-in">

      {/* Oracle Internals */}
      <RegisterOraclePanel title="Ask Your Data">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow.
              Your question is sent to <span className="text-purple-400 font-mono">Ollama (llama3.2)</span> with schema context and the selected runtime profile,
              then Oracle Database executes the generated SQL against the live schema and returns rows for the UI to summarize or display.
              Oracle remains the system of record for data and SQL execution; the language model runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label="llama3.2" color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="Live Oracle Schema" color="blue" />
          </div>
          <SqlBlock code={`-- Ask Data runtime: question -> Ollama -> Oracle SQL -> UI answer
-- Four modes available:

-- NARRATE: draft SQL, execute it, summarize results
-- CHAT: draft SQL, execute it, return a conversational explanation
-- SHOWSQL: inspect the generated SQL before execution
-- RUNSQL: execute the generated SQL and return raw rows

-- Example question:
-- "What are the top products by revenue?"

SELECT
  p.product_name,
  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
GROUP BY p.product_name
ORDER BY revenue DESC
FETCH FIRST 5 ROWS ONLY;

-- Behind the scenes:
-- 1. The app sends the question + schema hints to Ollama (llama3.2)
-- 2. Ollama drafts SQL for the selected mode
-- 3. Oracle executes the SQL against live tables
-- 4. The UI renders rows or a narrated answer`} />

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a question" sub="Natural language input" color="#1AADA8" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="App builds prompt + schema context" sub="Includes the selected runtime profile" color="#7B48A5" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ollama (llama3.2)" sub="Drafts SQL or a narrated response plan" color="#D4760A" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Oracle executes generated SQL" sub="Runs against the live schema and returns rows" color="#1B84ED" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns rows or narration" sub="Results stay grounded in Oracle query execution" color="#2D9F5E" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(6,182,212,0.08)', border: '1px dashed rgba(6,182,212,0.3)', color: '#7DD3D8' }}>
            <span className="font-semibold">Key insight:</span> Ollama handles the language reasoning,
            while Oracle Database remains the source of truth for query execution and result retrieval.
            This page shows the generated SQL so you can inspect what runs against the schema.
          </div>
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareText className="text-cyan-400" /> Ask Your Data
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask questions in plain English — <span className="text-purple-400">Ollama</span> drafts SQL and Oracle queries your live data
        </p>
      </div>

      {/* Chat card */}
      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(6,182,212,0.25)' }}>
        {/* Header bar */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(6,182,212,0.06)', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.2)' }}>
              <Database size={16} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Ask Data Chat</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Powered by <span className="text-purple-400">Ollama (llama3.2)</span> · {profiles.find(p => p.name === profile)?.label || 'Runtime Profile'} · Oracle Database
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Profile dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg font-mono transition-all"
                style={{ background: 'rgba(123,72,165,0.15)', color: '#B89AD4', border: '1px solid rgba(123,72,165,0.25)' }}
              >
                {profiles.find(p => p.name === profile)?.label || 'Runtime Profile'}
                <ChevronDown size={10} className={`transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-xl"
                  style={{ background: 'rgba(18,18,18,0.97)', border: '1px solid rgba(123,72,165,0.3)', minWidth: 260, backdropFilter: 'blur(12px)' }}>
                  <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-purple-400/70"
                    style={{ borderBottom: '1px solid rgba(123,72,165,0.15)' }}>
                    Runtime Profile
                  </div>
                  {profiles.map(p => (
                    <button key={p.name}
                      onClick={() => { setProfile(p.name); setProfileOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-purple-500/10 transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile === p.name ? 'bg-purple-400' : 'bg-transparent border border-[var(--color-border)]'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-[var(--color-text)]">{p.label}</div>
                        <div className="text-[9px] text-[var(--color-text-dim)]">{p.desc} · {p.provider}</div>
                      </div>
                      <span className="text-[8px] font-mono text-purple-400/50 flex-shrink-0">llama3.2</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {messages.length > 0 && (
              <button onClick={clearChat}
                className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--color-border)] hover:border-cyan-500/50 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors">
                <RotateCcw size={11} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-semibold mr-1">Mode:</span>
          {MODES.map(m => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? `${m.color}20` : 'transparent',
                  border: `1px solid ${active ? `${m.color}60` : 'transparent'}`,
                  color: active ? m.color : 'var(--color-text-dim)',
                }}>
                <Icon size={13} />
                <span>{m.label}</span>
                {active && <span className="text-[9px] opacity-70">— {m.desc}</span>}
              </button>
            );
          })}
        </div>

        {/* Messages area */}
        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'rgba(0,0,0,0.15)' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <Sparkles size={36} className="mx-auto mb-3 text-cyan-400/40" />
                <p className="text-sm text-[var(--color-text-dim)]">Ask anything about your data in plain English</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  Ollama drafts the SQL, Oracle executes it, and the app explains or displays the results
                </p>
              </div>

              {/* Tables available */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {['orders', 'products', 'customers', 'social_posts', 'brands', 'fulfillment_centers', 'inventory', 'shipments'].map(t => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(123,72,165,0.1)', color: '#B89AD4', border: '1px solid rgba(123,72,165,0.15)' }}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Example questions */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {EXAMPLE_QUESTIONS.map((eq, i) => (
                  <button key={i} onClick={() => sendMessage(eq.text)}
                    className="text-left p-3 rounded-lg border border-[var(--color-border)]/50 hover:border-cyan-500/40 transition-all text-xs group"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-[9px] text-purple-400/60 uppercase font-semibold">{eq.category}</span>
                    <p className="text-[var(--color-text-dim)] group-hover:text-[var(--color-text)] transition-colors leading-relaxed mt-1">
                      {eq.text}
                    </p>
                  </button>
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
                        style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}>
                        {msg.text}
                      </div>
                      {msg.mode && (
                        <div className="text-right mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#888'}15`, color: MODES.find(m => m.id === msg.mode)?.color || '#888' }}>
                            MODE {msg.mode}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(6,182,212,0.2)' }}>
                      <User size={13} className="text-cyan-400" />
                    </div>
                  </div>
                )}

                {/* Assistant response */}
                {msg.role === 'assistant' && (
                  <div className="space-y-2">
                    {/* Badge + timing */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#7B48A5'}30` }}>
                        <Database size={13} style={{ color: MODES.find(m => m.id === msg.mode)?.color || '#B89AD4' }} />
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#7B48A5'}20`, color: MODES.find(m => m.id === msg.mode)?.color || '#B89AD4' }}>
                        OLLAMA {msg.mode || 'narrate'}
                      </span>
                      {msg.error && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 flex items-center gap-1">
                          <AlertCircle size={9} /> Could not generate query
                        </span>
                      )}
                      {msg.elapsed && (
                        <span className="text-[10px] text-[var(--color-text-dim)] ml-auto flex items-center gap-1">
                          <Clock size={9} /> {msg.elapsed}ms
                        </span>
                      )}
                    </div>

                    {/* Narrate mode: answer text + collapsible SQL */}
                    {msg.mode === 'narrate' && (
                      <>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                          {msg.text}
                        </div>
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] text-purple-400/70 cursor-pointer hover:text-purple-400 transition-colors select-none">
                              <Code2 size={11} />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-purple-500/20">
                              <div className="px-3 py-1.5 text-[9px] font-semibold text-purple-300/70 uppercase tracking-wider"
                                style={{ background: 'rgba(123,72,165,0.08)', borderBottom: '1px solid rgba(123,72,165,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text-dim)] overflow-x-auto leading-relaxed"
                                style={{ background: 'rgba(0,0,0,0.3)' }}>
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
                          style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
                          {msg.text}
                        </div>
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] text-purple-400/70 cursor-pointer hover:text-purple-400 transition-colors select-none">
                              <Code2 size={11} />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-purple-500/20">
                              <div className="px-3 py-1.5 text-[9px] font-semibold text-purple-300/70 uppercase tracking-wider"
                                style={{ background: 'rgba(123,72,165,0.08)', borderBottom: '1px solid rgba(123,72,165,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text-dim)] overflow-x-auto leading-relaxed"
                                style={{ background: 'rgba(0,0,0,0.3)' }}>
                                {msg.sql}
                              </pre>
                            </div>
                          </details>
                        )}
                      </>
                    )}

                    {/* ShowSQL mode: SQL prominently displayed */}
                    {msg.mode === 'showsql' && msg.sql && (
                      <div className="rounded-lg overflow-hidden border border-purple-500/30">
                        <div className="px-3 py-1.5 text-[9px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5"
                          style={{ background: 'rgba(123,72,165,0.12)', borderBottom: '1px solid rgba(123,72,165,0.2)' }}>
                          <Code2 size={10} /> Generated SQL
                        </div>
                        <pre className="px-4 py-3 text-[12px] font-mono text-purple-200 overflow-x-auto leading-relaxed"
                          style={{ background: 'rgba(0,0,0,0.3)' }}>
                          {msg.sql}
                        </pre>
                      </div>
                    )}

                    {/* RunSQL mode: table results + collapsible SQL */}
                    {msg.mode === 'runsql' && (
                      <>
                        {msg.rows?.length > 0 ? (
                          <div className="rounded-2xl rounded-tl-md overflow-hidden"
                            style={{ border: '1px solid rgba(245,158,11,0.2)' }}>
                            <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider"
                              style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                              <TableProperties size={11} />
                              {msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''} returned
                            </div>
                            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'rgba(245,158,11,0.05)' }}>
                                    {(msg.columns?.length ? msg.columns : Object.keys(msg.rows[0])).map(col => (
                                      <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-amber-300/70 uppercase tracking-wider whitespace-nowrap"
                                        style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-[var(--color-surface)]/50 transition-colors"
                                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      {Object.values(row).map((val, j) => (
                                        <td key={j} className="px-3 py-2 whitespace-nowrap font-mono text-[var(--color-text)]">
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
                        ) : (
                          <div className="px-4 py-3 rounded-2xl rounded-tl-md text-sm text-[var(--color-text-dim)]"
                            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                            No results found.
                          </div>
                        )}
                        {msg.sql && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-[10px] text-purple-400/70 cursor-pointer hover:text-purple-400 transition-colors select-none">
                              <Code2 size={11} />
                              <span>View generated SQL</span>
                            </summary>
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-purple-500/20">
                              <div className="px-3 py-1.5 text-[9px] font-semibold text-purple-300/70 uppercase tracking-wider"
                                style={{ background: 'rgba(123,72,165,0.08)', borderBottom: '1px solid rgba(123,72,165,0.15)' }}>
                                Generated SQL
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text-dim)] overflow-x-auto leading-relaxed"
                                style={{ background: 'rgba(0,0,0,0.3)' }}>
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
                      style={{ background: 'rgba(239,68,68,0.2)' }}>
                      <AlertCircle size={13} className="text-red-400" />
                    </div>
                    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md text-sm text-red-400"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
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
                style={{ background: `${MODES.find(m => m.id === mode)?.color || '#7B48A5'}30` }}>
                <Database size={13} style={{ color: MODES.find(m => m.id === mode)?.color || '#B89AD4' }} />
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-[var(--color-text-dim)]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: MODES.find(m => m.id === mode)?.color }} />
                {mode === 'narrate' ? 'Generating SQL & narrating results…' : mode === 'chat' ? 'Generating response…' : mode === 'showsql' ? 'Generating SQL…' : 'Generating & executing SQL…'}
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
              placeholder={mode === 'narrate' ? 'Ask a question — get a natural language answer…' : mode === 'chat' ? 'Ask a question — get a conversational response…' : mode === 'showsql' ? 'Ask a question — see the generated SQL…' : 'Ask a question — run the SQL and get results…'}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
            />
            <button onClick={() => sendMessage()} disabled={sending || !input.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #7B48A5, #1AADA8)', color: '#fff' }}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
