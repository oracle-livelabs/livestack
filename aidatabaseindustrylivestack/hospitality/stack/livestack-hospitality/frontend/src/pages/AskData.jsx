import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { SceneStoryPanel } from '../components/HospitalityStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { useUser } from '../context/UserContext';

const MODES = [
  {
    id: 'narrate',
    label: 'Explain',
    iconClass: 'oj-fwk-icon-message-info',
    color: '#4F7D7B',
    desc: 'Executive insight brief',
    tooltip: 'Produce a polished hospitality executive explanation grounded in governed SQL results.',
    helper: 'Explain mode creates a business-friendly Hospitality LiveStack brief for corporate leaders, regional directors, revenue managers, owners, and operations leaders. It emphasizes what the answer means, why the metric matters, and how to interpret occupancy, RevPAR, Guest Rewards demand, revenue, and service pressure while keeping SQL secondary.',
    placeholder: 'Ask for an explanation of Guest Rewards demand, occupancy pressure, RevPAR movement, guest issues, booking pace, cancellation risk, service SLA pressure, or brand-tier impact...',
    actionLabel: 'Explain',
    loadingLabel: 'Generating governed SQL and hospitality insight...',
    emptyCopy: 'Use Explain when you want a polished hospitality narrative rather than an open-ended conversation.',
  },
  {
    id: 'chat',
    label: 'Chat',
    iconClass: 'oj-fwk-icon-info',
    color: '#437C94',
    desc: 'Follow-up dialogue',
    tooltip: 'Ask conversational follow-up questions using the current context.',
    helper: 'Chat mode supports iterative investigation. Use it to refine a prior answer, compare portfolio properties, brand tiers, owners, or guest segments, narrow an overbooking pattern, ask follow-up questions, or continue a revenue and operations conversation across multiple turns.',
    placeholder: 'Ask a follow-up about Guest Rewards signals, room-type impact, service requests, property hotels, properties, reservation cohorts, or prior results...',
    actionLabel: 'Chat',
    loadingLabel: 'Generating conversational hospitality response...',
    emptyCopy: 'Use Chat when you want to continue analysis across multiple turns.',
  },
  {
    id: 'showsql',
    label: 'Show SQL',
    iconClass: 'oj-fwk-icon-tree-document',
    color: '#796087',
    desc: 'Review governed SQL',
    tooltip: 'Generate SQL for review without executing it.',
    helper: 'Show SQL mode is for transparency. It drafts one governed, read-only Oracle SQL statement for the hospitality question and stops before execution so a data steward, analyst, or technical reviewer can inspect the query path.',
    placeholder: 'Ask for the SQL behind Guest Rewards reservation revenue, guest signals, brand tiers, service capacity, property performance, or room-type analysis...',
    actionLabel: 'Show SQL',
    loadingLabel: 'Generating governed SQL for review...',
    emptyCopy: 'Use Show SQL when you want to inspect the query before rows are returned.',
  },
  {
    id: 'runsql',
    label: 'Run SQL',
    iconClass: 'oj-fwk-icon-grid',
    color: '#8A4E2F',
    desc: 'Execute and return rows',
    tooltip: 'Execute governed SQL against authorized hospitality operations views and return structured results.',
    helper: 'Run SQL mode executes the governed query path and returns structured Oracle rows. Use it when the user wants the data table first, with a concise execution summary and collapsible SQL evidence.',
    placeholder: 'Run a governed query for reservations, signal-linked guest impact, service requests, room types, brand tiers, property hotels, or properties...',
    actionLabel: 'Run SQL',
    loadingLabel: 'Generating and executing governed SQL...',
    emptyCopy: 'Use Run SQL when you want structured rows from authorized hospitality views.',
  },
];

const EXAMPLE_QUESTIONS = [
  { text: 'Which Guest Rewards and channel signals are driving the most Hospitality LiveStack reservation revenue impact?', category: 'Signals' },
  { text: 'Show RevPAR impact by portfolio brand tier and room type for signal-linked reservations.', category: 'Revenue' },
  { text: 'Show the top service requests by connected Guest Rewards guest value.', category: 'Service' },
  { text: 'Which portfolio property service zones are at risk of missing arrival-readiness SLA this week?', category: 'Operations' },
  { text: 'What portfolio properties have the highest signal-linked reservation value?', category: 'Properties' },
  { text: 'Show guest segments with the highest loyalty and issue impact.', category: 'Reservations' },
  { text: 'What is the total value of signal-linked guest reservations?', category: 'Reservations' },
  { text: 'Show demand signal sources with the highest owner and revenue impact.', category: 'Signals' },
];

const SHOW_SQL_SAFETY_COPY =
  'Generated SQL is shown for review and is not executed in this mode.';
const RUN_SQL_SAFETY_COPY =
  'SQL is executed only against authorized hospitality operations data with governed access controls.';
const BLOCKED_QUERY_COPY =
  'This query was not executed because it falls outside the allowed governed hospitality schema.';
const ASKDATA_STORAGE_PREFIX = 'hospitality.askdata.messages.v2';
const ASKDATA_LEGACY_SESSION_STORAGE_PREFIX = 'hospitality.askdata.messages.v1';
const MAX_PERSISTED_MESSAGES = 40;
const MAX_PERSISTED_ROWS = 25;

function getAskDataStorageKey(username) {
  return `${ASKDATA_STORAGE_PREFIX}:${username || 'anonymous'}`;
}

function prunePersistedMessage(message) {
  const next = { ...message };
  if (Array.isArray(next.rows) && next.rows.length > MAX_PERSISTED_ROWS) {
    next.rows = next.rows.slice(0, MAX_PERSISTED_ROWS);
    next.rowsTruncatedForStorage = true;
  }
  return next;
}

function loadStoredAskDataMessages(storageKey) {
  if (typeof window === 'undefined') return [];
  try {
    let raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      const legacyKey = storageKey.replace(ASKDATA_STORAGE_PREFIX, ASKDATA_LEGACY_SESSION_STORAGE_PREFIX);
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

function saveStoredAskDataMessages(storageKey, messages) {
  if (typeof window === 'undefined') return;
  try {
    const payload = (messages || [])
      .slice(-MAX_PERSISTED_MESSAGES)
      .map(prunePersistedMessage);
    if (payload.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    }
  } catch (_) {}
}

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
  /allowed governed hospitality schema/i,
];

const VISIBLE_SCHEMA_OBJECT_NAMES = [
  'hospitality_properties_v',
  'hospitality_room_revenue_v',
  'guest_signals_v',
  'signal_sources_v',
  'guest_reservations_v',
  'hotels_v',
  'service_capacity_v',
  'service_routes_v',
  'brands',
  'products',
  'guests',
  'orders',
  'order_items',
  'social_posts',
  'influencers',
  'fulfillment_centers',
  'inventory',
  'shipments',
  'agent_actions',
];
const VISIBLE_SCHEMA_OBJECT_SET = new Set(VISIBLE_SCHEMA_OBJECT_NAMES);
const FALLBACK_SCHEMA_DOMAINS = {
  hospitality_properties_v: 'Properties',
  brands: 'Properties',
  hospitality_room_revenue_v: 'Rooms & Revenue',
  products: 'Rooms & Revenue',
  order_items: 'Reservations & Folios',
  guest_reservations_v: 'Reservations & Folios',
  orders: 'Reservations & Folios',
  guests: 'Guests',
  guest_signals_v: 'Guest Signals',
  social_posts: 'Guest Signals',
  signal_sources_v: 'Guest Signals',
  influencers: 'Guest Signals',
  hotels_v: 'Service Operations',
  fulfillment_centers: 'Service Operations',
  service_capacity_v: 'Service Operations',
  inventory: 'Service Operations',
  service_routes_v: 'Service Operations',
  shipments: 'Service Operations',
  agent_actions: 'AI Agent Actions',
};
const SCHEMA_DOMAIN_ORDER = [
  'Properties',
  'Rooms & Revenue',
  'Reservations & Folios',
  'Guests',
  'Guest Signals',
  'Service Operations',
  'AI Agent Actions',
];

const FALLBACK_PROFILES = [
  {
    name: 'SC_LLAMA_PROFILE',
    label: 'llama3.2',
    model: 'llama3.2',
    provider: 'Ollama + Oracle SQL',
    desc: 'Primary governed runtime profile',
  },
];

const RESULT_COLUMN_DISPLAY_LABELS = {
  ORDER_ID: 'Reservation ID',
  TRANSACTION_ID: 'Reservation ID',
  ORDER_STATUS: 'Reservation Status',
  TRANSACTION_STATUS: 'Reservation Status',
  ORDER_TOTAL: 'Folio Value',
  TRANSACTION_VALUE: 'Reservation Value',
  TOTAL_REVENUE: 'Total Revenue',
  REVENUE: 'Revenue',
  TOTAL_VALUE: 'Total Revenue',
  SIGNAL_LINKED_VALUE: 'Signal-Linked Revenue',
  GUEST_ID: 'Guest ID',
  CLIENT_ID: 'Guest ID',
  GUEST_NAME: 'Guest Name',
  CLIENT_NAME: 'Guest Name',
  GUEST_TIER: 'Guest Segment',
  BRAND_NAME: 'Property Name',
  INSTITUTION_NAME: 'Property Name',
  PRODUCT_NAME: 'Room Type or Revenue Center',
    CATEGORY: 'Hospitality Category',
  PRODUCT_CATEGORY: 'Room Type or Revenue Center Category',
  QUANTITY: 'Room Nights or Covers',
  QTY: 'Room Nights or Covers',
  UNIT_PRICE: 'ADR or Unit Rate',
  LINE_TOTAL: 'Folio Line Total',
  SHIPPING_COST: 'Service Fee',
  SERVICE_FEE: 'Service Fee',
  FULFILLMENT_CENTER: 'Hotel',
  FULFILLMENT_CENTER_ID: 'Hotel ID',
  HOTEL_ID: 'Hotel ID',
  HOTEL_NAME: 'Hotel',
  HOTEL_CATEGORY: 'Hotel Category',
  SOCIAL_DRIVEN: 'Signal-Linked',
  SOURCE_NAME: 'Signal Source',
  CRITICALITY_SCORE: 'Issue Severity',
  SEVERITY_BAND: 'Issue Severity',
  EXPOSURE_COUNT: 'Revenue Impact',
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

function groupSchemaObjects(objects) {
  const domainRank = new Map(SCHEMA_DOMAIN_ORDER.map((domain, index) => [domain, index]));
  const groups = new Map();

  objects.forEach((object) => {
    const domain = object.domain || FALLBACK_SCHEMA_DOMAINS[object.object_name] || 'Reference Data';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push({
      ...object,
      domain,
      display_name: object.display_name || humanizeObjectName(object.object_name),
    });
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

const FALLBACK_SCHEMA_GROUPS = groupSchemaObjects(
  VISIBLE_SCHEMA_OBJECT_NAMES.map((objectName) => ({
    object_name: objectName,
    object_type: objectName.endsWith('_v') ? 'view' : 'table',
    domain: FALLBACK_SCHEMA_DOMAINS[objectName] || 'Reference Data',
    display_name: humanizeObjectName(objectName),
    description: 'Queryable hospitality schema object.',
    example_questions: [],
    is_queryable_by_assistant: true,
  }))
);

function formatResultColumnLabel(column) {
  const key = String(column || '').toUpperCase();
  if (RESULT_COLUMN_DISPLAY_LABELS[key]) return RESULT_COLUMN_DISPLAY_LABELS[key];
  return humanizeObjectName(key.toLowerCase());
}

function isGovernedQueryBlock(message = '') {
  return GOVERNED_QUERY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeAskDataGuestError(error) {
  const category = error.category || (/Failed to fetch|NetworkError/i.test(error.message || '') ? 'API_UNREACHABLE' : 'UNEXPECTED_BACKEND_RESPONSE');
  const fallbackMessages = {
    API_UNREACHABLE: 'The Governed Data Copilot API is unreachable. Check that the app backend is running.',
    OLLAMA_UNAVAILABLE: 'The local Ollama service is unavailable. Check that the Ollama container is running and that the configured model is installed.',
    OLLAMA_MODEL_MISSING: 'The selected model is not available in Ollama. Pull or configure the model before using Governed Data Copilot.',
    OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. The app used a fast governed fallback where available; try again after the model finishes warming up.',
    SQL_GENERATION_FAILED: 'Unable to generate safe SQL for that question. Try a more specific metric, time window, or entity.',
    SQL_VALIDATION_BLOCKED: BLOCKED_QUERY_COPY,
    ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific governed hospitality data question.',
    REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
    MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific hospitality operations question.',
    UNEXPECTED_BACKEND_RESPONSE: 'Governed Data Copilot could not complete the request.',
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

function ChatAnswer({ msg, onFollowUp }) {
  const paragraphs = textParagraphs(sanitizeNarrativeText(msg.text, msg.referencedData));
  const findings = Array.isArray(msg.keyFindings)
    ? msg.keyFindings.map((finding) => cleanFindingText(finding, msg.referencedData)).filter(Boolean)
    : [];
  const followUps = Array.isArray(msg.followUpQuestions)
    ? msg.followUpQuestions.map((question) => sanitizeNarrativeText(question, msg.referencedData)).filter(Boolean)
    : [];

  return (
    <div className="askdata-chat-answer">
      <div className="askdata-chat-answer__rail">
        <JetGlyph iconClass="oj-fwk-icon-info" />
        <span>Conversation reply</span>
      </div>
      <div className="askdata-chat-answer__body">
        {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        )) : (
          <p>I could not produce a chat response for that follow-up.</p>
        )}
      </div>
      {findings.length > 0 && (
        <div className="askdata-chat-answer__context">
          <span>Context kept</span>
          <ul>
            {findings.slice(0, 3).map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
        </div>
      )}
      {followUps.length > 0 && (
        <div className="askdata-follow-ups" aria-label="Suggested follow-up questions">
          {followUps.map((question, index) => (
            <button
              type="button"
              key={index}
              className="askdata-follow-up-chip askdata-follow-up-chip--chat"
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
    .slice(-12)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      mode: message.mode || null,
      text: message.text || message.explanation || message.resultSummary || '',
    }))
    .filter((message) => message.text);
}

export default function AskData() {
  const { currentUser } = useUser();
  const askDataStorageKey = getAskDataStorageKey(currentUser?.USERNAME);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('narrate');
  const [profile, setProfile] = useState(FALLBACK_PROFILES[0].name);
  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const [schemaGroups, setSchemaGroups] = useState(FALLBACK_SCHEMA_GROUPS);
  const [schemaMetadataSource, setSchemaMetadataSource] = useState('fallback');
  const messagesEndRef = useRef(null);
  const storageHydrationKeyRef = useRef(null);
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));
  const schemaObjectCount = schemaGroups.reduce((sum, group) => sum + group.object_count, 0);

  useEffect(() => {
    storageHydrationKeyRef.current = askDataStorageKey;
    setMessages(loadStoredAskDataMessages(askDataStorageKey));
    setInput('');
  }, [askDataStorageKey]);

  useEffect(() => {
    if (storageHydrationKeyRef.current === askDataStorageKey) {
      storageHydrationKeyRef.current = null;
      return;
    }
    saveStoredAskDataMessages(askDataStorageKey, messages);
  }, [askDataStorageKey, messages]);

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
          desc: p.type || p.description || 'Governed natural-language SQL profile',
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
            .filter((object) => VISIBLE_SCHEMA_OBJECT_SET.has(object.object_name))
            .filter((object) => object.is_queryable_by_assistant !== false);
          return {
            domain: group.domain,
            objects,
            object_count: objects.length,
          };
        })
        .filter((group) => group.objects.length > 0);

      const flatObjects = Array.isArray(data.objects)
        ? data.objects
          .filter((object) => VISIBLE_SCHEMA_OBJECT_SET.has(object.object_name))
          .filter((object) => object.is_queryable_by_assistant !== false)
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
        const result = await api.selectai.showsql(question, profile, buildConversationHistory(messages));
        response = {
          role: 'assistant',
          mode: 'showsql',
          text: result.explanation || null,
          sql: result.sql,
          elapsed: result.elapsed || null,
          profile: result.profile,
          model: result.model,
          contextTurns: result.contextTurns || 0,
          time: new Date(),
        };
      } else {
        const result = await api.selectai.runsql(question, profile, buildConversationHistory(messages));
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
          contextTurns: result.contextTurns || 0,
          time: new Date(),
        };
      }
      setMessages(prev => [...prev, response]);
    } catch (err) {
      const normalizedError = normalizeAskDataGuestError(err);
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

      <RegisterOraclePanel title="Governed Data Copilot">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s governed natural-language SQL flow.
              Your question is sent to <span className="tone-plum font-mono">Ollama ({activeModelLabel})</span> with hospitality schema context and the selected runtime profile.
              Oracle AI Database 26ai validates and executes authorized SQL against Hospitality LiveStack operational data, then the UI explains, displays, or shows the query based on the selected mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
            <FeatureBadge label="Oracle SQL Execution" color="orange" />
            <FeatureBadge label="Generated SQL Inspection" color="cyan" />
            <FeatureBadge label="Governed Hospitality Schema" color="blue" />
          </div>
          <SqlBlock code={`-- Governed Data Copilot runtime: question -> Ollama -> Oracle SQL -> UI answer
-- Four modes available:

-- EXPLAIN: draft SQL, execute it, summarize results
-- CHAT: draft SQL with conversation context, execute it, return a conversational answer
-- SHOW SQL: inspect the generated SQL before execution
-- RUN SQL: execute the generated SQL and return raw rows

-- Example question:
-- "Which portfolio properties have the highest signal-linked reservation value?"

BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/

SELECT
  b.brand_name AS property_name,
  COUNT(DISTINCT o.order_id) AS signal_linked_reservations,
  ROUND(SUM(o.order_total), 2) AS signal_linked_value
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
JOIN brands b ON b.brand_id = p.brand_id
WHERE o.social_source_id IS NOT NULL
GROUP BY b.brand_name
ORDER BY signal_linked_value DESC
FETCH FIRST 5 ROWS ONLY;`} />

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a hospitality operations question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="App builds prompt + schema context" sub="Includes the selected runtime profile" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label={`Ollama (${activeModelLabel})`} sub="Drafts governed SQL or a response plan" color="#8A4E2F" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Oracle validates and executes SQL" sub="Runs against authorized hospitality operations data" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns answer, SQL, or rows" sub="Mode controls response format" color="#3E6F4D" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(79,125,123,0.08)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
            <span className="font-semibold">Key insight:</span> the model handles language reasoning,
            while Oracle AI Database 26ai remains the governed source of truth for query execution and result retrieval.
          </div>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Governed Data Copilot
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask natural-language questions about occupancy, revenue, Guest Rewards, guest experience, owner value, and service performance across Hospitality LiveStack&apos;s operational data. The assistant can explain results, continue a conversation, show generated SQL, or execute authorized queries.
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
              <h3 className="text-sm font-bold">Hospitality Data Assistant</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Natural-language questions translated into governed SQL over Hospitality LiveStack&apos;s live hospitality operations schema.
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
            <div role="tablist" aria-label="Ask Hospitality Data mode" className="flex items-center gap-2 flex-wrap">
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
          </div>
          <div
            className="askdata-mode-guidance"
            style={{ borderColor: `${activeMode.color}33`, background: `${activeMode.color}12` }}
          >
            <span className="askdata-mode-guidance__label" style={{ color: 'var(--color-text)' }}>
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
                <p className="text-sm text-[var(--color-text-dim)]">Ask about Guest Rewards signals, occupancy, RevPAR, reservations, owner value, service coverage, brand tiers, or room types.</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  {activeMode.emptyCopy} The assistant keeps answers grounded in authorized hospitality data.
                </p>
              </div>

              <div className="askdata-schema-panel">
                <div className="askdata-schema-panel__header">
                  <div>
                    <p className="askdata-schema-panel__eyebrow">Queryable hospitality schema</p>
                    <p className="askdata-schema-panel__copy">
                      {schemaGroups.length} domains - {schemaObjectCount} queryable objects - raw names preserved for generated SQL.
                    </p>
                  </div>
                  <span className="askdata-schema-panel__source">
                    {schemaMetadataSource === 'api' ? 'Live metadata' : 'Fallback metadata'}
                  </span>
                </div>
                <div className="askdata-schema-domain-pills" aria-label="Hospitality schema domains">
                  {schemaGroups.map((group) => (
                    <span className="askdata-schema-domain-pill" key={group.domain}>
                      <span>{group.domain}</span>
                      <span>{group.object_count}</span>
                    </span>
                  ))}
                </div>
                <details className="askdata-schema-details">
                  <summary>Show SQL object names</summary>
                  <div className="askdata-schema-object-groups">
                    {schemaGroups.map((group) => (
                      <section className="askdata-schema-object-group" key={group.domain}>
                        <p>{group.domain}</p>
                        <div className="askdata-schema-object-list">
                          {group.objects.map((object) => (
                            <span
                              key={object.object_name}
                              className="askdata-schema-object-chip"
                              title={`${object.display_name || object.object_name}: ${object.description || 'Queryable hospitality schema object.'}`}
                            >
                              {object.object_name}
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
                        <ChatAnswer msg={msg} onFollowUp={sendMessage} />
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
                            style={{ border: '1px solid rgba(138, 78, 47,0.2)' }}>
                            <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-semibold tone-sienna uppercase tracking-wider"
                              style={{ background: 'rgba(138, 78, 47,0.08)', borderBottom: '1px solid rgba(138, 78, 47,0.15)' }}>
                              <JetGlyph iconClass="oj-fwk-icon-grid" />
                              {msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''} returned
                            </div>
                            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'rgba(138, 78, 47,0.05)' }}>
                                    {(msg.columns?.length ? msg.columns : Object.keys(msg.rows[0])).map(col => (
                                      <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold tone-sienna uppercase tracking-wider whitespace-nowrap"
                                        style={{ borderBottom: '1px solid rgba(138, 78, 47,0.15)' }}>
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
                            style={{ background: 'rgba(138, 78, 47,0.05)', border: '1px solid rgba(138, 78, 47,0.2)' }}>
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
                      style={{ background: 'rgba(167, 53, 41,0.2)' }}>
                      <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" />
                    </div>
                    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md text-sm tone-red"
                      style={{ background: 'rgba(167, 53, 41,0.08)', border: '1px solid rgba(167, 53, 41,0.2)' }}>
                      <div>{msg.text}</div>
                      {msg.detail && (
                        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(167, 53, 41,0.78)' }}>
                          Rule detail: {msg.detail}
                        </div>
                      )}
                      {msg.correlationId && (
                        <div className="mt-1 text-[11px] leading-relaxed font-mono" style={{ color: 'rgba(167, 53, 41,0.78)' }}>
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
                ariaLabel="Ask a hospitality data question"
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
          <p className="mt-1.5 text-[10px] text-[var(--color-text-dim)]">
            Current mode: {activeMode.label}. Conversation context is saved for this user across scene changes and browser restarts.
            {messages.length > 0 ? ' Ask a follow-up such as "break that down by property" or "what about guest segment".' : ''}
          </p>
        </div>
      </div>

    </div>
  );
}
