import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Circle,
  Copy,
  Database,
  Play,
  Radio,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import CopySecretButton from '../components/CopySecretButton';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { JetButton } from '../components/JetControls';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';
import { api } from '../utils/api';

const PIPELINE_CONFIRMATION_KEY = 'peakgear.streamingIngest.pipelineCreated.v1';

function readPipelineConfirmation() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PIPELINE_CONFIRMATION_KEY) === 'true';
}

function writePipelineConfirmation(value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PIPELINE_CONFIRMATION_KEY, value ? 'true' : 'false');
}

function StatusPill({ connected, label }) {
  return (
    <span className={`streaming-status-pill ${connected ? 'is-connected' : 'is-disconnected'}`}>
      {connected ? <CheckCircle2 size={14} /> : <Circle size={14} />}
      {label}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div className="streaming-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PipelineValue({ label, value, onCopy }) {
  return (
    <div className="streaming-pipeline-value">
      <span>{label}</span>
      <code>{value || 'Not available'}</code>
      {value && (
        <button type="button" className="streaming-icon-button" onClick={() => onCopy(value)} title={`Copy ${label}`}>
          <Copy size={14} />
        </button>
      )}
    </div>
  );
}

function formatTime(value) {
  if (!value) return 'Not yet';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function RealTimeStreaming() {
  const [status, setStatus] = useState(null);
  const [osaStatus, setOsaStatus] = useState(null);
  const [pipelineCreated, setPipelineCreated] = useState(readPipelineConfirmation);
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState('');
  const [showImportance, setShowImportance] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextOsaStatus] = await Promise.all([
        api.streamingIngest.status(),
        api.streamingAnalytics.status(),
      ]);
      setStatus(nextStatus);
      setOsaStatus(nextOsaStatus);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    writePipelineConfirmation(pipelineCreated);
  }, [pipelineCreated]);

  const generator = status?.generator || {};
  const lakehouse = status?.lakehouse || {};
  const pipeline = status?.pipeline || {};
  const osaPassword = osaStatus?.credentials?.password || '';
  const recentEvents = generator.recentEvents || [];
  const canStart = Boolean(generator.available && osaStatus?.connected && pipelineCreated && !generator.running);
  const canStop = Boolean(generator.available && generator.running);

  const statusCards = useMemo(() => [
    {
      label: 'Signal Generator',
      connected: Boolean(generator.available),
      detail: generator.available ? 'Ready' : generator.error || 'Unavailable',
    },
    {
      label: 'GoldenGate Stream Analytics',
      connected: Boolean(osaStatus?.connected),
      detail: osaStatus?.detail || 'Not connected',
    },
    {
      label: 'AI Lakehouse Bronze Target',
      connected: Boolean(lakehouse.connected),
      detail: lakehouse.connected ? `${lakehouse.targetTable} reachable` : lakehouse.detail || 'Not reachable',
    },
    {
      label: 'OSA Pipeline',
      connected: pipelineCreated,
      detail: pipelineCreated ? 'Confirmed in OSA' : 'Create the pipeline in OSA',
    },
  ], [generator.available, generator.error, lakehouse.connected, lakehouse.detail, lakehouse.targetTable, osaStatus, pipelineCreated]);

  async function runAction(actionName, action) {
    try {
      setBusyAction(actionName);
      setError(null);
      await action();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  return (
    <div className="streaming-page fade-in">
      <section className="streaming-hero">
        <div className="streaming-hero__copy">
          <p className="section-kicker">Ingest</p>
          <h2>Real-Time Streaming</h2>
          <p>
            Catch demand spikes as they form and land raw social, product, and regional signals in the AI Lakehouse Bronze layer.
          </p>
        </div>
        <div className="streaming-hero__actions">
          <ImportanceButton onClick={() => setShowImportance(true)} />
          <JetButton
            label="Open OSA"
            iconClass="oj-fwk-icon oj-fwk-icon-arrow-end"
            chroming="callToAction"
            disabled={!osaStatus?.uiUrl}
            className="bronze-guide-open-button"
            onAction={() => osaStatus?.uiUrl && window.open(osaStatus.uiUrl, '_blank', 'noopener,noreferrer')}
            title={osaStatus?.uiUrl ? 'Open OSA in a new tab' : 'OSA is not available'}
          />
          <div className="streaming-osa-credentials" aria-label="OSA login credentials">
            <strong className="streaming-osa-credentials__title">Login information</strong>
            <div>
              <span>Username</span>
              <div className="credential-copy-row">
                <strong>{osaStatus?.credentials?.username || 'Not configured'}</strong>
                <CopySecretButton
                  value={osaStatus?.credentials?.username || ''}
                  label="OSA username"
                  disabled={!osaStatus?.credentials?.username}
                  unavailableTitle="OSA username is not available to copy"
                />
              </div>
            </div>
            <div>
              <span>Password</span>
              <div className="credential-copy-row">
                <strong>{osaPassword || 'Not configured'}</strong>
                <CopySecretButton value={osaPassword} label="OSA password" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.streaming}
      />

      <section className="streaming-status-grid" aria-label="Streaming status">
        {statusCards.map((item) => (
          <article key={item.label} className="streaming-status-card">
            <StatusPill connected={item.connected} label={item.connected ? 'Ready' : 'Pending'} />
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="streaming-layout">
        <div className="streaming-panel">
          <div className="streaming-panel__header">
            <div>
              <p className="section-kicker">Pipeline Assets</p>
              <h3>OSA Pipeline Inputs</h3>
            </div>
            {copied && <span className="streaming-copy-state">Copied</span>}
          </div>

          <div className="streaming-pipeline-values">
            <PipelineValue label="Kafka Bootstrap" value={pipeline.osaKafkaBootstrap} onCopy={copyValue} />
            <PipelineValue label="Kafka Topic" value={pipeline.topic} onCopy={copyValue} />
            <PipelineValue label="ADB Connection" value={pipeline.targetConnectionName} onCopy={copyValue} />
            <PipelineValue label="Target Table" value={pipeline.targetTable} onCopy={copyValue} />
          </div>

          <label className="streaming-confirmation">
            <input
              type="checkbox"
              checked={pipelineCreated}
              onChange={(event) => setPipelineCreated(event.target.checked)}
            />
            <span>
              <strong>OSA pipeline has been created</strong>
              <small>Required before starting the generator.</small>
            </span>
          </label>

        </div>

        <div className="streaming-panel">
          <div className="streaming-panel__header">
            <div>
              <p className="section-kicker">Live Stream</p>
              <h3>Generator Control</h3>
            </div>
            <StatusPill connected={Boolean(generator.running)} label={generator.running ? 'Running' : 'Stopped'} />
          </div>

          <div className="streaming-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={busyAction === 'topic' || !generator.available}
              onClick={() => runAction('topic', () => api.streamingIngest.ensureTopic())}
            >
              <Radio size={16} />
              Prepare Topic
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canStart || Boolean(busyAction)}
              onClick={() => runAction('start', () => api.streamingIngest.start(1500))}
            >
              <Play size={16} />
              Start Stream
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!canStop || Boolean(busyAction)}
              onClick={() => runAction('stop', () => api.streamingIngest.stop())}
            >
              <Square size={16} />
              Stop
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!generator.available || Boolean(busyAction)}
              onClick={() => runAction('produce', () => api.streamingIngest.produceOnce())}
            >
              <Zap size={16} />
              Produce One
            </button>
          </div>

          {error && <p className="streaming-error">{error}</p>}

          <div className="streaming-metrics">
            <Metric label="Events Produced" value={(generator.eventsProduced || 0).toLocaleString()} />
            <Metric label="Lakehouse Rows" value={(lakehouse.liveRows || 0).toLocaleString()} />
            <Metric label="Last Produced" value={formatTime(generator.lastEvent?.observed_at)} />
            <Metric label="Last Loaded" value={formatTime(lakehouse.lastLoadedAt)} />
          </div>

          <button
            type="button"
            className="btn-danger"
            disabled={!lakehouse.connected || Boolean(busyAction)}
            onClick={() => runAction('clear', () => api.streamingIngest.clearLiveSignals())}
          >
            <Trash2 size={16} />
            Clear Live Rows
          </button>
        </div>
      </section>

      <section className="streaming-panel">
        <div className="streaming-panel__header">
          <div>
            <p className="section-kicker">Events</p>
            <h3>Recent Demand Signals</h3>
          </div>
          <Activity size={20} className="streaming-panel-icon" />
        </div>

        <div className="streaming-events">
          {recentEvents.length ? recentEvents.map((event) => (
            <article key={event.signal_id} className="streaming-event">
              <div>
                <strong>{event.signal_id}</strong>
                <span>{event.platform} · {event.region} · {event.momentum_flag}</span>
              </div>
              <p>{event.signal_text}</p>
              <small>{event.views?.toLocaleString()} views · score {event.criticality_score}</small>
            </article>
          )) : (
            <div className="streaming-empty">
              <Database size={22} />
              <span>No generated events yet.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
