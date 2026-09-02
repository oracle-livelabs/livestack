import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { SceneStoryPanel } from '../components/FinanceStory';
import { FeatureBadge, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';

const MODES = [
  {
    id: 'narrate',
    label: 'Explain',
    iconClass: 'oj-fwk-icon-message-info',
    color: '#4F7D7B',
    desc: 'Risk insight brief',
    tooltip: 'Produce a clear finance explanation from the SQL results.',
    helper: 'Explain mode creates a finance brief for risk, compliance, fraud operations, and client-service leaders. It explains what the answer means and why the metric matters, while keeping SQL in the background.',
    placeholder: 'Ask for an explanation of fraud signals, AML exposure, client transaction value, service SLA pressure, revenue impact, or financial product risk...',
    actionLabel: 'Explain',
    loadingLabel: 'Generating SQL and finance insight...',
    emptyCopy: 'Use Explain when you want a polished finance narrative rather than an open-ended conversation.',
  },
  {
    id: 'chat',
    label: 'Chat',
    iconClass: 'oj-fwk-icon-info',
    color: '#437C94',
    desc: 'Follow-up dialogue',
    tooltip: 'Ask conversational follow-up questions using the current context.',
    helper: 'Chat mode supports iterative investigation. Use it to refine a prior answer, compare institutions or client tiers, narrow a fraud pattern, ask follow-up questions, or continue a risk and operations conversation across multiple turns.',
    placeholder: 'Ask a follow-up about AML signals, client exposure, fraud cases, service centers, institutions, transaction cohorts, or prior results...',
    actionLabel: 'Chat',
    loadingLabel: 'Generating conversational finance response...',
    emptyCopy: 'Use Chat when you want to continue analysis across multiple turns.',
  },
  {
    id: 'showsql',
    label: 'Show SQL',
    iconClass: 'oj-fwk-icon-tree-document',
    color: '#796087',
    desc: 'Review SQL',
    tooltip: 'Generate SQL for review without executing it.',
    helper: 'Show SQL mode drafts one read-only Oracle SQL statement and stops before execution. Use it when a data steward, auditor, or technical reviewer needs to inspect the query.',
    placeholder: 'Ask for the SQL behind transaction exposure, AML signals, client tiers, service capacity, institution risk, or financial product analysis...',
    actionLabel: 'Show SQL',
    loadingLabel: 'Generating SQL for review...',
    emptyCopy: 'Use Show SQL when you want to inspect the query before rows are returned.',
  },
  {
    id: 'runsql',
    label: 'Run SQL',
    iconClass: 'oj-fwk-icon-grid',
    color: '#AA643B',
    desc: 'Execute and return rows',
    tooltip: 'Run an approved SQL query against finance operations views and return structured results.',
    helper: 'Run SQL mode executes the approved query and returns Oracle rows. Use it when you want the data table first, with a short execution summary and expandable SQL.',
    placeholder: 'Run a query for client transactions, signal-linked exposure, fraud cases, financial products, service centers, or institutions...',
    actionLabel: 'Run SQL',
    loadingLabel: 'Generating and executing SQL...',
    emptyCopy: 'Use Run SQL when you want structured rows from authorized finance views.',
  },
];

const EXAMPLE_QUESTIONS = [
  { text: 'Which fraud and Anti-Money Laundering (AML) signals are driving the most Seer Bank transaction exposure?', category: 'Signals' },
  { text: 'Show transaction exposure by financial product category for signal-linked transactions.', category: 'Exposure' },
  { text: 'Show the top fraud cases by connected account value.', category: 'Fraud' },
  { text: 'Which Seer service centers are at risk of missing investigation SLA this week?', category: 'Service Coverage' },
  { text: 'What institutions have the highest signal-linked transaction value?', category: 'Institutions' },
  { text: 'Show client tiers with the highest signal-linked exposure.', category: 'Transactions' },
  { text: 'What is the total value of signal-linked client transactions?', category: 'Transactions' },
  { text: 'Show risk signal sources with the highest exposure impact.', category: 'Signals' },
];

const SHOW_SQL_SAFETY_COPY =
  'Generated SQL is shown for review and is not executed in this mode.';
const RUN_SQL_SAFETY_COPY =
  'SQL runs only against approved Seer Bank finance operations data with database access controls.';
const BLOCKED_QUERY_COPY =
  'This query was not executed because it falls outside the approved finance schema.';

const GOVERNED_QUERY_ERROR_PATTERNS = [
  /Only SELECT or WITH/i,
  /Comments and multiple statements/i,
  /Write operations and PL\/SQL/i,
  /System packages and metadata views/i,
  /unsupported tables/i,
  /not allowed/i,
  /safe read-only SQL query/i,
  /valid Oracle SQL query/i,
  /Oracle equivalents/i,
  /PostgreSQL syntax/i,
  /allowed governed finance schema/i,
];

const FALLBACK_PROFILES = [
  {
    name: 'SC_LLAMA_PROFILE',
    label: 'llama3.2',
    model: 'llama3.2',
    provider: 'Ollama + Oracle SQL',
    desc: 'Primary finance runtime profile',
  },
];

const RESULT_COLUMN_DISPLAY_LABELS = {
  ORDER_ID: 'Transaction ID',
  TRANSACTION_ID: 'Transaction ID',
  ORDER_STATUS: 'Transaction Status',
  TRANSACTION_STATUS: 'Transaction Status',
  ORDER_TOTAL: 'Transaction Value',
  TRANSACTION_VALUE: 'Transaction Value',
  TOTAL_REVENUE: 'Total Exposure',
  REVENUE: 'Exposure Value',
  TOTAL_VALUE: 'Total Exposure',
  SIGNAL_LINKED_VALUE: 'Signal-Linked Exposure',
  CUSTOMER_ID: 'Client ID',
  CLIENT_ID: 'Client ID',
  CUSTOMER_NAME: 'Client Name',
  CLIENT_NAME: 'Client Name',
  CUSTOMER_TIER: 'Client Tier',
  BRAND_NAME: 'Institution Name',
  INSTITUTION_NAME: 'Institution Name',
  PRODUCT_NAME: 'Financial Product',
  FINANCIAL_PRODUCT_NAME: 'Financial Product',
  CATEGORY: 'Risk Category',
  PRODUCT_CATEGORY: 'Financial Product Category',
  QUANTITY: 'Transaction Units',
  QTY: 'Transaction Units',
  UNIT_PRICE: 'Service Cost',
  LINE_TOTAL: 'Service Total',
  SHIPPING_COST: 'Processing Fee',
  SERVICE_FEE: 'Processing Fee',
  FULFILLMENT_CENTER: 'Operations Center',
  FULFILLMENT_CENTER_ID: 'Operations Center ID',
  SERVICE_CENTER_NAME: 'Operations Center',
  SOCIAL_DRIVEN: 'Signal-Linked',
  SOURCE_NAME: 'Signal Source',
  CRITICALITY_SCORE: 'Risk Severity',
  SEVERITY_BAND: 'Risk Severity',
  EXPOSURE_COUNT: 'Exposure Impact',
};

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

function humanizeObjectName(objectName) {
  return String(objectName || '')
    .replace(/_v$/i, '')
    .replace(/_dv$/i, ' JSON Duality View')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatResultColumnLabel(column) {
  const key = String(column || '').toUpperCase();
  if (RESULT_COLUMN_DISPLAY_LABELS[key]) return RESULT_COLUMN_DISPLAY_LABELS[key];
  return humanizeObjectName(key.toLowerCase());
}

function isGovernedQueryBlock(message = '') {
  return GOVERNED_QUERY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeAskDataClientError(error) {
  const category = error.category || (/Failed to fetch|NetworkError/i.test(error.message || '') ? 'API_UNREACHABLE' : 'UNEXPECTED_BACKEND_RESPONSE');
  const fallbackMessages = {
    API_UNREACHABLE: 'The Finance Data Copilot API is unreachable. Check that the app backend is running.',
    OLLAMA_UNAVAILABLE: 'The local Ollama service is unavailable. Check that the Ollama container is running and that the configured model is installed.',
    OLLAMA_MODEL_MISSING: 'The selected model is not available in Ollama. Pull or configure the model before using the Finance Data Copilot.',
    OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
    SQL_GENERATION_FAILED: 'Unable to generate safe SQL for that question. Try a more specific metric, time window, or entity.',
    SQL_VALIDATION_BLOCKED: BLOCKED_QUERY_COPY,
    ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try asking a more specific finance question.',
    REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
    MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific finance operations question.',
    UNEXPECTED_BACKEND_RESPONSE: 'Finance Data Copilot could not complete the request.',
  };

  const message = error.message || fallbackMessages[category] || fallbackMessages.UNEXPECTED_BACKEND_RESPONSE;
  const isBlocked = category === 'SQL_VALIDATION_BLOCKED' || isGovernedQueryBlock(message);
  return {
    category,
    message: isBlocked ? BLOCKED_QUERY_COPY : (fallbackMessages[category] || message),
    detail: isBlocked && message !== BLOCKED_QUERY_COPY ? message : null,
    correlationId: error.correlationId || null,
  };
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function SqlSafetyNote({ children, tone = 'plum' }) {
  const color = tone === 'sienna' ? '170,100,59' : '121,96,135';
  const toneClass = tone === 'sienna' ? 'tone-sienna' : 'tone-plum';

  return (
    <div className={`flex items-start gap-1.5 px-3 py-1.5 text-[10px] leading-relaxed ${toneClass}`}
      style={{ background: `rgba(${color},0.06)`, borderBottom: `1px solid rgba(${color},0.14)` }}>
      <JetGlyph iconClass="oj-fwk-icon-message-info" className="mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function copyToClipboard(text) {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

function textParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatNarrativeColumnLabel(column) {
  const mapped = formatResultColumnLabel(column);
  if (mapped !== column) return mapped.toLowerCase();
  return String(column || '')
    .replace(/_display_name$/i, '')
    .replace(/_count$/i, ' count')
    .replace(/_value$/i, ' value')
    .replace(/_score$/i, ' score')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sanitizeNarrativeText(text, referencedData) {
  let value = String(text || '');
  const notableFields = Array.isArray(referencedData?.notable_fields)
    ? referencedData.notable_fields
    : [];
  const columns = [...new Set([
    ...notableFields,
    ...Object.keys(RESULT_COLUMN_DISPLAY_LABELS),
  ])]
    .filter(Boolean)
    .sort((left, right) => String(right).length - String(left).length);

  columns.forEach((column) => {
    const raw = String(column);
    const label = formatNarrativeColumnLabel(raw);
    if (!label) return;
    value = value.replace(new RegExp(`\\b${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), label);
  });

  return value;
}

function cleanFindingText(text, referencedData) {
  return sanitizeNarrativeText(text, referencedData).replace(/^\s*\d+\.\s*/, '').trim();
}

function isInternalNarrativeWarning(warning) {
  return /model response did not follow|deterministic grounded summary/i.test(String(warning || ''));
}

function formatElapsed(elapsed) {
  if (!Number.isFinite(Number(elapsed))) return null;
  const ms = Number(elapsed);
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatRowCount(rowCount, mode) {
  if (mode === 'showsql') return 'SQL not run';
  if (!Number.isFinite(Number(rowCount))) return 'rows unavailable';
  const count = Number(rowCount);
  return `${count.toLocaleString()} row${count === 1 ? '' : 's'}`;
}

function AssistantMetadata({ msg, activeModelLabel }) {
  const modeLabel = MODES.find(m => m.id === msg.mode)?.label || msg.mode || 'Answer';
  const model = msg.model || activeModelLabel || 'model unavailable';
  const elapsed = formatElapsed(msg.elapsed);
  const items = [
    modeLabel,
    model,
    formatRowCount(msg.rowCount, msg.mode),
    elapsed,
  ].filter(Boolean);

  return (
    <div className="askdata-response-meta" aria-label="Response metadata">
      {items.map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </div>
  );
}

function GeneratedSqlDetails({ sql }) {
  if (!sql) return null;
  return (
    <details className="askdata-sql-details group">
      <summary className="flex items-center gap-1.5 text-[10px] tone-plum cursor-pointer hover:tone-plum transition-colors select-none">
        <JetGlyph iconClass="oj-fwk-icon-tree-document" />
        <span>View generated SQL</span>
      </summary>
      <div className="mt-1.5 rounded-lg overflow-hidden border border-plum-soft">
        <div className="askdata-sql-details__header">
          <span>Generated SQL</span>
          <button
            type="button"
            className="askdata-sql-copy-button"
            onClick={() => copyToClipboard(sql)}
          >
            Copy SQL
          </button>
        </div>
        <pre className="px-3 py-2.5 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed"
          style={{ background: 'var(--color-surface-muted)' }}>
          {sql}
        </pre>
      </div>
    </details>
  );
}

function NarrativeAnswer({ msg, tone = 'teal', onFollowUp }) {
  const paragraphs = textParagraphs(sanitizeNarrativeText(msg.text, msg.referencedData));
  const findings = Array.isArray(msg.keyFindings)
    ? msg.keyFindings.map((finding) => cleanFindingText(finding, msg.referencedData)).filter(Boolean)
    : [];
  const followUps = Array.isArray(msg.followUpQuestions)
    ? msg.followUpQuestions.map((question) => sanitizeNarrativeText(question, msg.referencedData)).filter(Boolean)
    : [];
  const warnings = Array.isArray(msg.warnings)
    ? msg.warnings
      .filter((warning) => !isInternalNarrativeWarning(warning))
      .map((warning) => sanitizeNarrativeText(warning, msg.referencedData))
      .filter(Boolean)
    : [];
  const resultSummary = sanitizeNarrativeText(msg.resultSummary, msg.referencedData);

  return (
    <div className={`askdata-answer-card askdata-answer-card--${tone}`}>
      <div className="askdata-answer-card__body">
        {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        )) : (
          <p>No explanation was returned for this result.</p>
        )}
      </div>

      {findings.length > 0 && (
        <div className="askdata-key-findings">
          <p>Key findings</p>
          <ul>
            {findings.map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {resultSummary && (
        <p className="askdata-result-summary">{resultSummary}</p>
      )}

      {warnings.length > 0 && (
        <div className="askdata-answer-warnings">
          {warnings.map((warning, index) => (
            <span key={index}>{warning}</span>
          ))}
        </div>
      )}

      {followUps.length > 0 && (
        <div className="askdata-follow-ups" aria-label="Suggested follow-up questions">
          {followUps.map((question, index) => (
            <button
              type="button"
              key={index}
              className="askdata-follow-up-chip"
              onClick={() => onFollowUp(question)}
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildConversationHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      mode: message.mode || null,
      text: message.text || message.resultSummary || '',
    }))
    .filter((message) => message.text);
}

export default function AskData() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('narrate');
  const [profile, setProfile] = useState(FALLBACK_PROFILES[0].name);
  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const messagesEndRef = useRef(null);
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));

  useEffect(() => {
    let cancelled = false;
    api.selectai.profiles().then(data => {
      const list = (data.profiles || [])
        .filter(p => p.name.startsWith('SC_') && p.status === 'ENABLED' && p.name !== 'SC_EMBED_PROFILE')
        .map((p, index) => ({
          name: p.name,
          label: p.model || getProfileDisplayLabel(p.name, index),
          model: p.model || getProfileDisplayLabel(p.name, index),
          provider: p.provider || 'Ollama + Oracle SQL',
          desc: p.type || p.description || 'Natural-language SQL profile',
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

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question, mode, profile, model: activeModelLabel, time: new Date() }]);
    setSending(true);

    try {
      let response;
      if (mode === 'narrate') {
        const result = await api.selectai.chat(question, true, profile);
        response = {
          role: 'assistant',
          mode: 'narrate',
          text: result.answer,
          keyFindings: result.keyFindings || [],
          resultSummary: result.resultSummary || '',
          followUpQuestions: result.followUpQuestions || [],
          referencedData: result.referencedData || null,
          warnings: result.warnings || [],
          rowCount: result.rowCount,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      } else if (mode === 'chat') {
        const result = await api.selectai.chatMode(question, true, profile, buildConversationHistory(messages));
        response = {
          role: 'assistant',
          mode: 'chat',
          text: result.answer,
          keyFindings: result.keyFindings || [],
          resultSummary: result.resultSummary || '',
          followUpQuestions: result.followUpQuestions || [],
          referencedData: result.referencedData || null,
          warnings: result.warnings || [],
          rowCount: result.rowCount,
          sql: result.sql,
          elapsed: result.elapsed,
          error: result.error,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      } else if (mode === 'showsql') {
        const result = await api.selectai.showsql(question, profile);
        response = {
          role: 'assistant',
          mode: 'showsql',
          text: result.explanation || null,
          sql: result.sql,
          elapsed: result.elapsed || null,
          profile: result.profile,
          model: result.model,
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
          explanation: result.explanation || '',
          elapsed: result.elapsed,
          profile: result.profile,
          model: result.model,
          time: new Date(),
        };
      }
      setMessages(prev => [...prev, response]);
    } catch (err) {
      const normalizedError = normalizeAskDataClientError(err);
      setMessages(prev => [...prev, {
        role: 'error',
        text: normalizedError.message,
        detail: normalizedError.detail,
        category: normalizedError.category,
        correlationId: normalizedError.correlationId,
        question,
        mode,
        profile,
        safetyBlocked: normalizedError.category === 'SQL_VALIDATION_BLOCKED',
        sql: err.sql || null,
        time: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, mode, profile, activeModelLabel, messages]);

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

      <RegisterOraclePanel title="Finance Data Copilot">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow.
              Your question is sent to <span className="tone-plum font-mono">Ollama ({activeModelLabel})</span> with finance schema context and the selected runtime profile.
              Oracle AI Database 26ai checks and runs approved SQL against Seer Bank operational data. The UI then explains, displays, or shows the query based on the selected mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="Approved Finance Schema" color="blue" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a finance question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="App builds prompt + schema context" sub="Includes the selected runtime profile" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label={`Ollama (${activeModelLabel})`} sub="Drafts SQL or a response plan" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Oracle validates and executes SQL" sub="Runs against authorized finance operations data" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns answer, SQL, or rows" sub="Mode controls response format" color="#4C825C" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(79,125,123,0.08)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
            <span className="font-semibold">In short:</span> the model handles language reasoning,
            while Oracle AI Database 26ai runs the query and returns the data.
          </div>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Finance Data Copilot
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask plain-English fraud, compliance, service, and exposure questions about Seer Bank&apos;s operational data. The assistant can explain results, continue a conversation, show generated SQL, or run approved queries.
        </p>
      </div>

      <SceneStoryPanel scene="askdata" />

      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Finance Data Assistant</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Natural-language questions translated into SQL over Seer Bank&apos;s live finance operations schema.
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
                {activeProfile?.desc || 'Runtime Profile'} - {activeProfile?.provider || 'Ollama + Oracle SQL'}
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

        <div className="px-5 py-2.5 space-y-1.5" style={{ background: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-semibold mr-1">Mode:</span>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.tooltip}
                  role="tab"
                  aria-selected={active}
                  className={`askdata-mode-tab ${active ? 'is-active' : ''}`}
                  style={{ '--mode-color': m.color }}
                  onClick={() => setMode(m.id)}
                >
                  <span className={`oj-fwk-icon ${m.iconClass}`} aria-hidden="true" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
          <div
            className="askdata-mode-guidance"
            style={{ borderColor: `${activeMode.color}33`, background: `${activeMode.color}12` }}
          >
            <span className="askdata-mode-guidance__label" style={{ color: activeMode.color }}>
              {activeMode.label} - {activeMode.desc}
            </span>
            <span className="askdata-mode-guidance__text">{activeMode.helper}</span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'var(--color-surface)' }}>

          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <JetGlyph iconClass="oj-fwk-icon-magnifier" className="askdata-empty-glyph tone-teal" />
                <p className="text-sm text-[var(--color-text-dim)]">Ask about fraud signals, compliance exposure, client transactions, service coverage, or financial products.</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  {activeMode.emptyCopy} The assistant uses approved Seer Bank finance data.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {EXAMPLE_QUESTIONS.map((eq, i) => (
                  <div key={i} className="askdata-example-tile">
                    <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-semibold">{eq.category}</span>
                    <p className="askdata-example-question">{eq.text}</p>
                    <JetButton
                      label={activeMode.actionLabel}
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

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>

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
                            MODE {MODES.find(m => m.id === msg.mode)?.label || msg.mode}
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

                {msg.role === 'assistant' && (
                  <div className="space-y-2">
                    <div className="askdata-assistant-header">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${MODES.find(m => m.id === msg.mode)?.color || '#796087'}30` }}>
                        <JetGlyph iconClass="oj-fwk-icon-grid" style={{ color: MODES.find(m => m.id === msg.mode)?.color || '#796087' }} />
                      </div>
                      <AssistantMetadata msg={msg} activeModelLabel={activeModelLabel} />
                      {msg.error && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded surface-sienna-soft tone-sienna flex items-center gap-1">
                          <JetGlyph iconClass="oj-fwk-icon-message-warning" /> Could not generate query
                        </span>
                      )}
                    </div>

                    {msg.mode === 'narrate' && (
                      <>
                        <NarrativeAnswer msg={msg} tone="teal" onFollowUp={sendMessage} />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {msg.mode === 'chat' && (
                      <>
                        <NarrativeAnswer msg={msg} tone="ocean" onFollowUp={sendMessage} />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {msg.mode === 'showsql' && msg.sql && (
                      <div className="rounded-lg overflow-hidden border border-plum-soft">
                        {msg.text && (
                          <div className="askdata-sql-explanation">
                            {msg.text}
                          </div>
                        )}
                        <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider flex items-center gap-1.5"
                          style={{ background: 'rgba(121,96,135,0.12)', borderBottom: '1px solid rgba(121,96,135,0.2)' }}>
                          <JetGlyph iconClass="oj-fwk-icon-tree-document" /> Generated SQL
                          <button
                            type="button"
                            className="askdata-sql-copy-button ml-auto"
                            onClick={() => copyToClipboard(msg.sql)}
                          >
                            Copy SQL
                          </button>
                        </div>
                        <SqlSafetyNote>{SHOW_SQL_SAFETY_COPY}</SqlSafetyNote>
                        <pre className="px-4 py-3 text-[12px] font-mono tone-plum overflow-x-auto leading-relaxed"
                          style={{ background: 'var(--color-surface-muted)' }}>
                          {msg.sql}
                        </pre>
                      </div>
                    )}

                    {msg.mode === 'runsql' && (
                      <>
                        <div className="rounded-lg overflow-hidden border border-sienna-soft">
                          <SqlSafetyNote tone="sienna">{RUN_SQL_SAFETY_COPY}</SqlSafetyNote>
                        </div>
                        {msg.explanation && (
                          <div className="askdata-run-explanation">
                            {msg.explanation}
                          </div>
                        )}
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
                                        {formatResultColumnLabel(col)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex} className="hover:bg-[var(--color-surface)]/50 transition-colors"
                                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      {(msg.columns?.length ? msg.columns : Object.keys(row)).map(col => (
                                        <td key={col} className="px-3 py-2 whitespace-nowrap font-mono text-[var(--color-text)]">
                                          {(() => {
                                            const val = row[col];
                                            return val == null ? '-' : typeof val === 'number'
                                              ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2))
                                              : String(val);
                                          })()}
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
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}
                  </div>
                )}

                {msg.role === 'error' && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(199,70,52,0.2)' }}>
                      <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" />
                    </div>
                    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md text-sm tone-red"
                      style={{ background: 'rgba(199,70,52,0.08)', border: '1px solid rgba(199,70,52,0.2)' }}>
                      <div>{msg.text}</div>
                      {msg.detail && (
                        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(199,70,52,0.78)' }}>
                          Rule detail: {msg.detail}
                        </div>
                      )}
                      {msg.correlationId && (
                        <div className="mt-1 text-[11px] leading-relaxed font-mono" style={{ color: 'rgba(199,70,52,0.78)' }}>
                          Diagnostic ID: {msg.correlationId}
                        </div>
                      )}
                      {msg.question && (
                        <button
                          type="button"
                          className="mt-2 text-[11px] font-semibold underline"
                          onClick={() => sendMessage(msg.question)}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${MODES.find(m => m.id === mode)?.color || '#796087'}30` }}>
                <JetGlyph iconClass="oj-fwk-icon-grid" style={{ color: MODES.find(m => m.id === mode)?.color || '#796087' }} />
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-[var(--color-text-dim)]"
                style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                <JetProgressCircle size="sm" className="askdata-loading-progress" ariaLabel="Generating response" />
                {activeMode.loadingLabel}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="px-5 py-3" style={{ background: 'var(--color-surface-muted)', borderTop: '1px solid var(--color-border)' }}>
          <div className="jet-control-row">
            <div className="flex-1 min-w-[260px]" onKeyDown={handleKeyDown}>
              <JetInputText
                value={input}
                disabled={sending}
                ariaLabel="Ask a finance data question"
                placeholder={activeMode.placeholder}
                onValueChange={setInput}
              />
            </div>
            <JetButton
              label={sending ? 'Working...' : activeMode.actionLabel}
              iconClass={sending ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-arrow-end'}
              chroming="callToAction"
              disabled={sending || !input.trim()}
              onAction={() => sendMessage()}
            />
          </div>
          {messages.length === 0 && !input.trim() && !sending && (
            <p className="mt-1.5 text-[10px] text-[var(--color-text-dim)]">
              Current mode: {activeMode.label}. Try one of the examples above or enter a question about the live Seer Bank finance schema.
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
