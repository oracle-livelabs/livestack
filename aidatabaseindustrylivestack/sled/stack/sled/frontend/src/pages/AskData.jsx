import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { FeatureBadge, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';
import EXAMPLE_QUESTIONS from '../data/askDataSuggestedPrompts.json';

const MODES = [
  {
    id: 'narrate',
    label: 'Narrate',
    iconClass: 'oj-fwk-icon-message-info',
    color: '#4F7D7B',
    desc: 'Plain-English answer',
    tooltip: 'Generate SQL, run it, and narrate the results in public-sector language.',
  },
  {
    id: 'chat',
    label: 'Chat',
    iconClass: 'oj-fwk-icon-info',
    color: '#437C94',
    desc: 'Conversational response',
    tooltip: 'Ask follow-up questions using the current conversation context.',
  },
  {
    id: 'showsql',
    label: 'Show SQL',
    iconClass: 'oj-fwk-icon-tree-document',
    color: '#796087',
    desc: 'View generated SQL',
    tooltip: 'Generate governed Oracle SQL for review without executing it.',
  },
  {
    id: 'runsql',
    label: 'Run SQL',
    iconClass: 'oj-fwk-icon-grid',
    color: '#AA643B',
    desc: 'Execute governed query',
    tooltip: 'Execute the generated SQL against authorized State and Local Government semantic views.',
  },
];

const SHOW_SQL_SAFETY_COPY =
  'Show SQL must not execute the query or return rows. It only generates governed Oracle SQL for review.';
const RUN_SQL_SAFETY_COPY =
  'Run SQL executes only read-only SELECT statements against authorized State and Local Government semantic views.';
const BLOCKED_QUERY_COPY =
  'This query was not executed because it falls outside the governed State and Local Government semantic views.';

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
  /State and Local Government read-only query policy/i,
];

const SCHEMA_DOMAIN_ORDER = [
  'Programs',
  'Services',
  'Service Requests',
  'Residents',
  'Resident Signals',
  'Service Access',
  'Capacity',
  'Field Response',
  'Operations',
];
const FALLBACK_SCHEMA_OBJECTS = [
  { id: 'public-programs', domain: 'Programs', display_name: 'Public Programs', description: 'Program eligibility, funding, compliance, and service ownership metadata.' },
  { id: 'public-services', domain: 'Services', display_name: 'Public Services', description: 'Citizen-facing digital services, agency workflows, and service-level commitments.' },
  { id: 'resident-signals', domain: 'Resident Signals', display_name: 'Resident Demand Signals', description: 'Resident, business, and caseworker signals used for prioritization and routing.' },
  { id: 'signal-sources', domain: 'Resident Signals', display_name: 'Resident Signal Sources', description: 'Public-sector partner and service-channel sources that contribute demand evidence.' },
  { id: 'service-requests', domain: 'Service Requests', display_name: 'Service Requests', description: 'Permits, benefits, inspections, case-management, public works, and response requests.' },
  { id: 'request-lines', domain: 'Service Requests', display_name: 'Service Request Work Items', description: 'Actionable request line items tied to inspections, routing, eligibility, and follow-up.' },
  { id: 'residents', domain: 'Residents', display_name: 'Residents and Constituents', description: 'Constituent records used for service access, communication, and responsible response.' },
  { id: 'access-centers', domain: 'Service Access', display_name: 'Service Access Centers', description: 'Digital and physical access points for agency operations and resident support.' },
  { id: 'capacity', domain: 'Capacity', display_name: 'Service Capacity', description: 'Agency workload, staffing, backlog, and service-level pressure signals.' },
  { id: 'field-response', domain: 'Field Response', display_name: 'Service Task Routes', description: 'Inspection, code enforcement, public works, and emergency-response task routing.' },
  { id: 'operations', domain: 'Operations', display_name: 'Operations Dashboard', description: 'Unified operational metrics for workload, urgency, SLA risk, and auditability.' },
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

function slugifySchemaLabel(value, fallback = 'queryable-view') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function getSchemaDisplayName(object) {
  return String(object?.display_name || object?.label || object?.domain || 'Queryable View');
}

function getSchemaObjectId(object, index = 0) {
  return slugifySchemaLabel(getSchemaDisplayName(object), `queryable-view-${index + 1}`);
}

function normalizeSchemaObject(object, index = 0, fallbackDomain = 'Operations') {
  const displayName = getSchemaDisplayName(object);
  return {
    id: getSchemaObjectId(object, index),
    domain: object?.domain || fallbackDomain,
    display_name: displayName,
    description: object?.description || 'Queryable State and Local Government semantic view.',
    example_questions: Array.isArray(object?.example_questions) ? object.example_questions : [],
    is_queryable_by_assistant: object?.is_queryable_by_assistant !== false,
  };
}

function groupSchemaObjects(objects) {
  const domainRank = new Map(SCHEMA_DOMAIN_ORDER.map((domain, index) => [domain, index]));
  const groups = new Map();

  objects.forEach((object) => {
    const normalized = normalizeSchemaObject(object);
    const domain = normalized.domain || 'Operations';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(normalized);
  });

  return [...groups.entries()]
    .sort(([leftDomain], [rightDomain]) => {
      const leftRank = domainRank.get(leftDomain) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = domainRank.get(rightDomain) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || leftDomain.localeCompare(rightDomain);
    })
    .map(([domain, groupObjects]) => ({
      domain,
      objects: groupObjects.sort((left, right) => left.display_name.localeCompare(right.display_name)),
      object_count: groupObjects.length,
    }));
}

const FALLBACK_SCHEMA_GROUPS = groupSchemaObjects(FALLBACK_SCHEMA_OBJECTS);

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

function formatColumnLabel(column) {
  return String(column || '')
    .replace(/^[A-Z]+_/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isGovernedQueryBlock(message = '') {
  return GOVERNED_QUERY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeAskDataClientError(error) {
  const category = error.category || (/Failed to fetch|NetworkError/i.test(error.message || '') ? 'API_UNREACHABLE' : 'UNEXPECTED_BACKEND_RESPONSE');
  const fallbackMessages = {
    API_UNREACHABLE: 'The Ask State and Local Government Data API is unreachable. Check that the app backend is running.',
    OLLAMA_UNAVAILABLE: 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.',
    OLLAMA_MODEL_MISSING: 'Model llama3.2 is not available in Ollama. Pull or configure the model before using Ask State and Local Government Data.',
    OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
    SQL_GENERATION_FAILED: 'Unable to generate safe SQL for that question. Try a more specific service request, capacity, program, resident, or time-window question.',
    SQL_VALIDATION_BLOCKED: BLOCKED_QUERY_COPY,
    ORACLE_EXECUTION_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific governed State and Local Government view.',
    REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
    MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try a more specific State and Local Government data question.',
    UNEXPECTED_BACKEND_RESPONSE: 'Ask State and Local Government Data could not complete the request.',
  };

  const message = error.message || fallbackMessages[category] || fallbackMessages.UNEXPECTED_BACKEND_RESPONSE;
  const isBlocked = category === 'SQL_VALIDATION_BLOCKED' || isGovernedQueryBlock(message);
  return {
    category,
    message: isBlocked ? BLOCKED_QUERY_COPY : (fallbackMessages[category] || message),
    detail: isBlocked && message !== BLOCKED_QUERY_COPY ? message : null,
    correlationId: error.correlationId || null,
    sql: error.sql || null,
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
          <button type="button" className="askdata-sql-copy-button" onClick={() => copyToClipboard(sql)}>
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

function NarrativeAnswer({ msg, tone = 'teal' }) {
  const isChatMode = msg.mode === 'chat';
  const paragraphs = textParagraphs(msg.text);
  const findings = Array.isArray(msg.keyFindings) ? msg.keyFindings.filter(Boolean) : [];
  const warnings = Array.isArray(msg.warnings) ? msg.warnings.filter(Boolean) : [];
  const resultSummary = msg.resultSummary || '';
  const modeTitle = isChatMode ? 'Conversation reply' : 'Narrated operations brief';
  const modeSubtitle = isChatMode
    ? 'Uses recent conversation context and governed Oracle query results.'
    : 'Summarizes the public-sector evidence as an operations-ready brief.';

  return (
    <div className={`askdata-answer-card askdata-answer-card--${tone}`}>
      <div className="askdata-answer-card__mode">
        <div>
          <p>{modeTitle}</p>
          <span>{modeSubtitle}</span>
        </div>
      </div>

      <div className={`askdata-answer-card__body ${isChatMode ? 'askdata-answer-card__body--chat' : ''}`}>
        {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        )) : (
          <p>No explanation was returned for this result.</p>
        )}
      </div>

      {!isChatMode && findings.length > 0 && (
        <div className="askdata-key-findings">
          <p>Key findings</p>
          <ul>
            {findings.map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {!isChatMode && resultSummary && <p className="askdata-result-summary">{resultSummary}</p>}

      {warnings.length > 0 && (
        <div className="askdata-answer-warnings">
          {warnings.map((warning, index) => (
            <span key={index}>{warning}</span>
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
  const [schemaGroups, setSchemaGroups] = useState(FALLBACK_SCHEMA_GROUPS);
  const [schemaMetadataSource, setSchemaMetadataSource] = useState('fallback');
  const messagesEndRef = useRef(null);
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));
  const schemaObjectCount = schemaGroups.reduce((sum, group) => sum + group.object_count, 0);

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
    let cancelled = false;
    api.selectai.schemaObjects().then((data) => {
      const apiGroups = Array.isArray(data.domains) ? data.domains : [];
      const groupedObjects = apiGroups
        .map((group) => {
          const objects = (group.objects || [])
            .filter((object) => object.is_queryable_by_assistant !== false)
            .map((object, index) => normalizeSchemaObject(object, index, group.domain));
          return {
            domain: group.domain,
            objects,
            object_count: objects.length,
          };
        })
        .filter((group) => group.objects.length > 0);

      const flatObjects = Array.isArray(data.objects)
        ? data.objects
          .filter((object) => object.is_queryable_by_assistant !== false)
          .map((object, index) => normalizeSchemaObject(object, index))
        : [];

      const nextGroups = groupedObjects.length > 0 ? groupedObjects : groupSchemaObjects(flatObjects);
      if (!cancelled && nextGroups.length > 0) {
        setSchemaGroups(nextGroups);
        setSchemaMetadataSource('api');
      }
    }).catch(() => {
      if (!cancelled) {
        setSchemaGroups(FALLBACK_SCHEMA_GROUPS);
        setSchemaMetadataSource('fallback');
      }
    });
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
        const result = await api.selectai.chat(question, true, profile, buildConversationHistory(messages));
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
          explanation: result.explanation || result.resultSummary || '',
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
        sql: normalizedError.sql,
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
      <SceneStoryPanel scene="askdata" />

      <RegisterOraclePanel title="Ask State and Local Government Data">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow. Your question is sent to{' '}
              <span className="tone-plum font-mono">Ollama ({activeModelLabel})</span> with State and Local Government schema context and the selected runtime profile.
              Oracle AI Database 26ai executes governed SQL against live semantic views for service requests, residents, programs, access centers, capacity, routes, and resident signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="State and Local Government Semantic Views" color="blue" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">v</div>
              <DiagramBox label="App builds prompt + semantic schema context" sub="Only governed State and Local Government views are exposed" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">v</div>
              <DiagramBox label={`Ollama (${activeModelLabel})`} sub="Drafts SQL or a conversational response plan" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">v</div>
              <DiagramBox label="Oracle validates and executes SQL" sub="Read-only SELECT/WITH policy and live Oracle execution" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">v</div>
              <DiagramBox label="UI renders mode-specific evidence" sub="Narration, chat, generated SQL, or result rows" color="#4C825C" />
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Ask State and Local Government Data
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask plain-English questions about constituent services, permits and licensing, benefits eligibility, inspections, public works, transportation, emergency response, policy compliance, capacity, backlog, and auditability.
        </p>
      </div>

      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
            </div>
            <div>
              <h3 className="text-sm font-bold">State and Local Government Data Assistant</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Natural-language questions translated into governed SQL over live public-sector semantic views.
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

        <div className="px-5 py-2.5 space-y-1.5" style={{ background: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-semibold mr-1">Mode:</span>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <JetButton
                  key={m.id}
                  label={m.label}
                  title={m.tooltip}
                  iconClass={`oj-fwk-icon ${m.iconClass}`}
                  chroming={active ? 'callToAction' : 'outlined'}
                  className="askdata-mode-button"
                  onAction={() => setMode(m.id)}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--color-text-dim)]">
            Choose how the assistant responds: narrate the answer, continue a conversation, show generated SQL without execution, or run the query against governed State and Local Government views.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'var(--color-surface)' }}>
          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <JetGlyph iconClass="oj-fwk-icon-magnifier" className="askdata-empty-glyph tone-teal" />
                <p className="text-sm text-[var(--color-text-dim)]">
                  Ask about service requests, resident signals, permits, benefits, inspections, capacity, emergency response, public works, transportation, compliance, or audit evidence.
                </p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  The assistant drafts SQL, Oracle validates and executes authorized queries, and results are explained or displayed based on your selected mode.
                </p>
              </div>

              <div className="askdata-schema-panel">
                <div className="askdata-schema-panel__header">
                  <div>
                    <p className="askdata-schema-panel__eyebrow">Queryable State and Local Government schema</p>
                    <p className="askdata-schema-panel__copy">
                      {schemaGroups.length} domains · {schemaObjectCount} queryable objects · governed semantic metadata used for generated SQL.
                    </p>
                  </div>
                  <span className="askdata-schema-panel__source">
                    {schemaMetadataSource === 'api' ? 'Live metadata' : 'Fallback metadata'}
                  </span>
                </div>
                <div className="askdata-schema-domain-pills" aria-label="State and Local Government schema domains">
                  {schemaGroups.map((group) => (
                    <span className="askdata-schema-domain-pill" key={group.domain}>
                      <span>{group.domain}</span>
                      <span>{group.object_count}</span>
                    </span>
                  ))}
                </div>
                <details className="askdata-schema-details">
                  <summary>Show queryable data subjects</summary>
                  <div className="askdata-schema-object-groups">
                    {schemaGroups.map((group) => (
                      <section className="askdata-schema-object-group" key={group.domain}>
                        <p>{group.domain}</p>
                        <div className="askdata-schema-object-list">
                          {group.objects.map((object) => (
                            <span
                              key={object.id}
                              className="askdata-schema-object-chip"
                              title={`${object.display_name}: ${object.description || 'Queryable State and Local Government semantic view.'}`}
                            >
                              {object.display_name}
                            </span>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              </div>

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
                        <NarrativeAnswer msg={msg} tone="teal" />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {msg.mode === 'chat' && (
                      <>
                        <NarrativeAnswer msg={msg} tone="ocean" />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {msg.mode === 'showsql' && msg.sql && (
                      <div className="rounded-lg overflow-hidden border border-plum-soft">
                        {msg.text && <div className="askdata-sql-explanation">{msg.text}</div>}
                        <div className="px-3 py-1.5 text-[9px] font-semibold tone-plum uppercase tracking-wider flex items-center gap-1.5"
                          style={{ background: 'rgba(121,96,135,0.12)', borderBottom: '1px solid rgba(121,96,135,0.2)' }}>
                          <JetGlyph iconClass="oj-fwk-icon-tree-document" /> Generated SQL
                          <button type="button" className="askdata-sql-copy-button ml-auto" onClick={() => copyToClipboard(msg.sql)}>
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
                        {msg.explanation && <div className="askdata-run-explanation">{msg.explanation}</div>}
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
                                        {formatColumnLabel(col)}
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
                        <button type="button" className="mt-2 text-[11px] font-semibold underline" onClick={() => sendMessage(msg.question)}>
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
                {mode === 'narrate' ? 'Generating SQL and narrating results...' : mode === 'chat' ? 'Generating conversational response...' : mode === 'showsql' ? 'Generating SQL without execution...' : 'Generating and executing SQL...'}
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
                ariaLabel="Ask a State and Local Government data question"
                placeholder={mode === 'narrate' ? 'Ask a question - get a narrated answer...' : mode === 'chat' ? 'Ask a follow-up question...' : mode === 'showsql' ? 'Ask a question - see generated SQL only...' : 'Ask a question - run SQL and inspect rows...'}
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
          {messages.length === 0 && !input.trim() && !sending && (
            <p className="mt-1.5 text-[10px] text-[var(--color-text-dim)]">
              Try one of the examples above or enter a question about live State and Local Government operations data.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
