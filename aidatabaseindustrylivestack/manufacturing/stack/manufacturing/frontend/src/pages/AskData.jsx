import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/ManufacturingStory';
import EXAMPLE_QUESTIONS from '../data/askDataSuggestedPrompts.json';

const MODES = [
  {
    id: 'narrate',
    label: 'Explain',
    iconClass: 'oj-fwk-icon-message-info',
    color: '#4F7D7B',
    desc: 'Business insight brief',
    tooltip: 'Produce a polished manufacturing explanation grounded in governed SQL results.',
    helper: 'Explain mode creates a business-friendly operations brief for plant managers, planners, quality engineers, maintenance technicians, and operations leaders. It emphasizes insight, manufacturing context, and recommended interpretation while keeping SQL secondary.',
    placeholder: 'Ask for an explanation of work order variance, downtime risk, quality exposure, throughput, supplier impact, or plant capacity...',
    actionLabel: 'Explain',
    loadingLabel: 'Generating governed SQL and manufacturing insight...',
    emptyCopy: 'Use Explain when you want a polished manufacturing narrative rather than an open-ended conversation.',
  },
  {
    id: 'chat',
    label: 'Chat',
    iconClass: 'oj-fwk-icon-info',
    color: '#437C94',
    desc: 'Follow-up dialogue',
    tooltip: 'Ask conversational follow-up questions using the current context.',
    helper: 'Chat mode supports iterative analysis. Use it to refine the prior answer, ask follow-up questions, compare customer accounts or parts, or narrow the result by plant, supplier, production line, risk driver, or time window.',
    placeholder: 'Ask a follow-up about a work order, customer account, production signal, part, supplier, or capacity center...',
    actionLabel: 'Chat',
    loadingLabel: 'Generating conversational manufacturing response...',
    emptyCopy: 'Use Chat when you want to continue analysis across multiple turns.',
  },
  {
    id: 'showsql',
    label: 'Show SQL',
    iconClass: 'oj-fwk-icon-tree-document',
    color: '#796087',
    desc: 'Review governed SQL',
    tooltip: 'Generate SQL for review without executing it.',
    helper: 'Show SQL mode is for transparency. It drafts one governed, read-only Oracle SQL statement for the manufacturing question and stops before execution so a data steward or technical reviewer can inspect the query path.',
    placeholder: 'Ask for the SQL behind work order value, production signal urgency, plant capacity, supplier network, or production-risk analysis...',
    actionLabel: 'Show SQL',
    loadingLabel: 'Generating governed SQL for review...',
    emptyCopy: 'Use Show SQL when you want to inspect the query before rows are returned.',
  },
  {
    id: 'runsql',
    label: 'Run SQL',
    iconClass: 'oj-fwk-icon-grid',
    color: '#AA643B',
    desc: 'Execute and return rows',
    tooltip: 'Execute governed SQL against authorized manufacturing views and return structured results.',
    helper: 'Run SQL mode executes the governed query path and returns structured Oracle rows. Use it when the user wants the data table first, with a concise execution summary and collapsible SQL evidence.',
    placeholder: 'Run a governed query for work orders, manufactured parts, customer accounts, production signals, capacity centers, or product lines...',
    actionLabel: 'Run SQL',
    loadingLabel: 'Generating and executing governed SQL...',
    emptyCopy: 'Use Run SQL when you want structured rows from authorized manufacturing views.',
  },
];

const SHOW_SQL_SAFETY_COPY =
  'Generated SQL is shown for review and is not executed.';
const RUN_SQL_SAFETY_COPY =
  'SQL is executed only against authorized manufacturing views with governed access controls.';
const BLOCKED_QUERY_COPY =
  'This query was not executed because it falls outside the allowed governed manufacturing schema.';

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
  /allowed governed manufacturing schema/i,
];

const VISIBLE_SCHEMA_OBJECT_NAMES = [
  'manufacturing_work_orders_v',
  'manufacturing_parts_v',
  'manufacturing_production_signals_v',
  'manufacturing_plant_capacity_v',
  'manufacturing_supplier_relationships_v',
  'manufacturing_graph_node_metadata',
  'manufacturing_graph_edge_metadata',
  'manufacturing_graph_entity_metrics',
  'manufacturing_production_network',
  'manufacturing_graph_production_findings',
  'manufacturing_graph_relationship_metadata',
  'manufacturing_risk_cases',
  'manufacturing_case_entities',
  'manufacturing_work_orders',
  'manufacturing_work_order_lines',
  'products',
  'brands',
  'customers',
  'manufacturing_production_signals',
  'influencers',
  'fulfillment_centers',
  'inventory',
  'event_stream',
  'manufacturing_demand_forecasts',
  'demand_regions',
  'shipments',
  'agent_actions',
];
const VISIBLE_SCHEMA_OBJECT_SET = new Set(VISIBLE_SCHEMA_OBJECT_NAMES);
const FALLBACK_SCHEMA_DOMAINS = {
  manufacturing_work_orders_v: 'Work Orders',
  manufacturing_work_orders: 'Work Orders',
  manufacturing_work_order_lines: 'Work Orders',
  manufacturing_parts_v: 'Manufactured Parts',
  products: 'Manufactured Parts',
  brands: 'Manufactured Parts',
  manufacturing_production_signals_v: 'Production Signals',
  manufacturing_production_signals: 'Production Signals',
  customers: 'Customer Accounts',
  manufacturing_plant_capacity_v: 'Plant Capacity',
  fulfillment_centers: 'Plant Capacity',
  inventory: 'Plant Capacity',
  manufacturing_demand_forecasts: 'Plant Capacity',
  demand_regions: 'Plant Capacity',
  shipments: 'Plant Capacity',
  manufacturing_supplier_relationships_v: 'Supplier Network',
  influencers: 'Supplier Network',
  manufacturing_graph_node_metadata: 'Production Risk Graph',
  manufacturing_graph_edge_metadata: 'Production Risk Graph',
  manufacturing_graph_entity_metrics: 'Production Risk Graph',
  manufacturing_production_network: 'Production Risk Graph',
  manufacturing_graph_production_findings: 'Production Risk Graph',
  manufacturing_graph_relationship_metadata: 'Production Risk Graph',
  manufacturing_risk_cases: 'Production Risk Graph',
  manufacturing_case_entities: 'Production Risk Graph',
  event_stream: 'AI Agent Actions',
  agent_actions: 'AI Agent Actions',
};
const SCHEMA_DOMAIN_ORDER = [
  'Work Orders',
  'Manufactured Parts',
  'Production Signals',
  'Customer Accounts',
  'Plant Capacity',
  'Supplier Network',
  'Production Risk Graph',
  'AI Agent Actions',
  'Reference Data',
];

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
    object_type: objectName.endsWith('_dv') ? 'json_duality_view' : 'view',
    domain: FALLBACK_SCHEMA_DOMAINS[objectName] || 'Reference Data',
    display_name: humanizeObjectName(objectName),
    description: 'Queryable manufacturing schema object.',
    example_questions: [],
    is_queryable_by_assistant: true,
  }))
);

const FALLBACK_PROFILES = [
  {
    name: 'MANUFACTURING_LLAMA_PROFILE',
    label: 'llama3.2',
    model: 'llama3.2',
    engine: 'Ollama + Oracle SQL',
    desc: 'Primary local Ollama model',
  },
];

const RESULT_COLUMN_DISPLAY_LABELS = {
  WORK_ORDER_ID: 'WORK_ORDER_ID',
  WORK_ORDER_STATUS_CODE: 'WORK_ORDER_STATUS',
  WORK_ORDER_VALUE: 'WORK_ORDER_VALUE',
  CUSTOMER_ID: 'CUSTOMER_ACCOUNT_ID',
  CUSTOMER_NAME: 'CUSTOMER_ACCOUNT',
  CUSTOMER_CITY: 'CUSTOMER_CITY',
  CUSTOMER_STATE: 'CUSTOMER_REGION',
  ROUTING_COST: 'ROUTING_COST',
  ITEMS: 'LINE_ITEMS',
  WORK_ORDER_LINE_ID: 'LINE_ITEM_ID',
  PRODUCT_ID: 'MANUFACTURED_PART_ID',
  PRODUCT_NAME: 'MANUFACTURED_PART',
  UNIT_PRICE: 'WORK_ORDER_VALUE_PROXY',
  LINE_VALUE: 'WORK_ORDER_LINE_VALUE',
  FULFILLMENT_CENTER: 'PLANT_SITE',
  ASSIGNED_PLANT_ID: 'PLANT_SITE_ID',
  SOCIAL_DRIVEN: 'PRODUCTION_SIGNAL_INFLUENCED_FLAG',
};

function getProfileDisplayLabel(name, index = 0) {
  if (!name) return `Runtime Profile ${index + 1}`;
  return `Runtime Profile ${index + 1}`;
}

function formatResultColumnLabel(column) {
  const key = String(column || '').toUpperCase();
  return RESULT_COLUMN_DISPLAY_LABELS[key] || column;
}

function isGovernedQueryBlock(message = '') {
  return GOVERNED_QUERY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeAskDataClientError(error) {
  const category = error.category || (/Failed to fetch|NetworkError/i.test(error.message || '') ? 'API_UNREACHABLE' : 'UNEXPECTED_BACKEND_RESPONSE');
  const fallbackMessages = {
    API_UNREACHABLE: 'The Ask Manufacturing Data API is unreachable. Check that the app backend is running.',
    OLLAMA_UNAVAILABLE: 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.',
    OLLAMA_MODEL_MISSING: 'Model llama3.2 is not available in Ollama. Pull or configure the model before using Ask Manufacturing Data.',
    OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
    SQL_GENERATION_FAILED: 'Unable to generate safe SQL for that question. Try a more specific metric, time window, or entity.',
    SQL_VALIDATION_BLOCKED: BLOCKED_QUERY_COPY,
    ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific governed manufacturing view.',
    REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
    MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific manufacturing data question.',
    UNEXPECTED_BACKEND_RESPONSE: 'Ask Manufacturing Data could not complete the request.',
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
  if (mapped !== column) return mapped.toLowerCase().replace(/_/g, ' ');
  return String(column || '')
    .replace(/_display_name$/i, '')
    .replace(/_count$/i, ' count')
    .replace(/_units$/i, ' units')
    .replace(/_percentage$/i, ' percentage')
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
  const [schemaGroups, setSchemaGroups] = useState(FALLBACK_SCHEMA_GROUPS);
  const [schemaMetadataSource, setSchemaMetadataSource] = useState('fallback');
  const messagesEndRef = useRef(null);
  const activeProfile = profiles.find((p) => p.name === profile) || FALLBACK_PROFILES.find((p) => p.name === profile) || profiles[0] || FALLBACK_PROFILES[0];
  const activeModelLabel = activeProfile?.model || activeProfile?.label || FALLBACK_PROFILES[0].model;
  const profileOptions = profiles.map((p, index) => ({
    value: p.name,
    label: p.label || p.model || getProfileDisplayLabel(p.name, index),
  }));
  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const schemaObjectCount = schemaGroups.reduce((sum, group) => sum + group.object_count, 0);

  // Fetch available AI profiles from the database
  useEffect(() => {
    let cancelled = false;
    api.selectai.profiles().then(data => {
      const list = (data.profiles || [])
        .filter(p => p.name.startsWith('MANUFACTURING_') && p.status === 'ENABLED' && p.name !== 'MANUFACTURING_EMBED_PROFILE')
        .map((p, index) => ({
          name: p.name,
          label: p.model || getProfileDisplayLabel(p.name, index),
          model: p.model || getProfileDisplayLabel(p.name, index),
          engine: p.provider || 'Ollama + Oracle SQL',
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

      {/* Oracle Internals */}
      <RegisterOraclePanel title="Ask Manufacturing Data">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page uses the app&apos;s natural-language SQL flow.
              Your question is sent to <span className="tone-plum font-mono">Ollama ({activeModelLabel})</span> with schema context and the selected runtime profile,
              then Oracle AI Database 26ai executes the generated SQL against the live schema and returns rows for the UI to summarize or display.
              Oracle AI Database 26ai remains the system of record for data and SQL execution; the language model runtime is external to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Ollama Runtime" color="purple" />
            <FeatureBadge label={activeModelLabel} color="pink" />
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
-- "Which customer accounts have the highest work order value?"

SELECT
  customer_tier,
  COUNT(work_order_id) AS work_order_count,
  ROUND(SUM(work_order_value), 2) AS work_order_value
FROM manufacturing_work_orders_v
GROUP BY customer_tier
ORDER BY work_order_value DESC
FETCH FIRST 5 ROWS ONLY;

-- Behind the scenes:
-- 1. The app sends the question + schema hints to Ollama (${activeModelLabel})
-- 2. Ollama drafts SQL for the selected mode
-- 3. Oracle executes the SQL against live tables
-- 4. The UI renders rows or a narrated answer`} />

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">How It Works</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="User asks a question" sub="Natural language input" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="App builds prompt + schema context" sub="Includes the selected runtime profile" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label={`Ollama (${activeModelLabel})`} sub="Drafts SQL or a narrated response plan" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Oracle executes generated SQL" sub="Runs against the live schema and returns rows" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="UI returns rows or narration" sub="Results stay grounded in Oracle query execution" color="#4C825C" />
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ background: 'rgba(79,125,123,0.08)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
            <span className="font-semibold">Key insight:</span> Ollama handles the language reasoning,
            while Oracle AI Database 26ai remains the source of truth for query execution and result retrieval.
            This page shows the generated SQL so you can inspect what runs against the schema.
          </div>
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-message-info" className="askdata-page-glyph tone-teal" /> Ask Manufacturing Data
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Ask questions about the AX-400 recovery story, including WO-4501, constrained materials, supplier delay, plant capacity, downtime risk, schedule variance, quality inspections, and throughput.
        </p>
      </div>

      <SceneStoryPanel scene="askdata" />

      {/* Chat card */}
      <div className="glass-card overflow-hidden" style={{ border: '1px solid rgba(79,125,123,0.25)' }}>
        {/* Header bar */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(79,125,123,0.06)', borderBottom: '1px solid rgba(79,125,123,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,125,123,0.2)' }}>
              <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Manufacturing Data Assistant</h3>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                Natural-language questions translated into governed SQL over the live manufacturing operations schema.
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
                {activeProfile?.desc || 'Runtime Profile'} · {activeProfile?.engine || 'Ollama + Oracle SQL'}
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
        <div className="px-5 py-2.5 space-y-1.5" style={{ background: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-border)' }}>
          <div
            className="flex items-center gap-2 flex-wrap"
            role="tablist"
            aria-label="Ask Manufacturing Data mode"
          >
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
                  role="tab"
                  ariaSelected={active}
                  onAction={() => setMode(m.id)}
                />
              );
            })}
          </div>
          <div
            className="askdata-mode-guidance"
            style={{ borderColor: `${activeMode.color}33`, background: `${activeMode.color}12` }}
          >
            <span className="askdata-mode-guidance__label">
              {activeMode.label} - {activeMode.desc}
            </span>
            <span className="askdata-mode-guidance__text">{activeMode.helper}</span>
          </div>
        </div>

        {/* Messages area */}
        <div className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto min-h-[300px]"
          style={{ background: 'var(--color-surface)' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="space-y-4 py-6">
              <div className="text-center mb-4">
                <JetGlyph iconClass="oj-fwk-icon-magnifier" className="askdata-empty-glyph tone-teal" />
                <p className="text-sm text-[var(--color-text-dim)]">Ask about customer accounts, production supervisors, suppliers, production runs, work orders, maintenance windows, shift events, work order value, production signals, or plant capacity.</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                  {activeMode.emptyCopy} The assistant keeps answers grounded in authorized manufacturing data.
                </p>
              </div>

              {/* Queryable manufacturing schema */}
              <div className="askdata-schema-panel">
                <div className="askdata-schema-panel__header">
                  <div>
                    <p className="askdata-schema-panel__eyebrow">Queryable manufacturing schema</p>
                    <p className="askdata-schema-panel__copy">
                      {schemaGroups.length} domains · {schemaObjectCount} queryable objects · raw names preserved for generated SQL.
                    </p>
                  </div>
                  <span className="askdata-schema-panel__source">
                    {schemaMetadataSource === 'api' ? 'Live metadata' : 'Fallback metadata'}
                  </span>
                </div>
                <div className="askdata-schema-domain-pills" aria-label="Manufacturing schema domains">
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
                              title={`${object.display_name || object.object_name}: ${object.description || 'Queryable manufacturing schema object.'}`}
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

              {/* Example questions */}
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

                {/* Assistant response */}
                {msg.role === 'assistant' && (
                  <div className="space-y-2">
                    {/* Metadata */}
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

                    {/* Explain mode: answer text + collapsible SQL */}
                    {msg.mode === 'narrate' && (
                      <>
                        <NarrativeAnswer msg={msg} tone="teal" onFollowUp={sendMessage} />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {/* Chat mode: conversational answer + collapsible SQL */}
                    {msg.mode === 'chat' && (
                      <>
                        <NarrativeAnswer msg={msg} tone="ocean" onFollowUp={sendMessage} />
                        <GeneratedSqlDetails sql={msg.sql} />
                      </>
                    )}

                    {/* ShowSQL mode: SQL prominently displayed */}
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

                    {/* RunSQL mode: table results + collapsible SQL */}
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
                                  {msg.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-[var(--color-surface)]/50 transition-colors"
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
                            No structured rows were returned for this governed manufacturing query.
                          </div>
                        )}
                        <GeneratedSqlDetails sql={msg.sql} />
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
                {activeMode.loadingLabel}
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
              Current mode: {activeMode.label}. Try one of the examples above or enter a question about the live manufacturing schema.
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
