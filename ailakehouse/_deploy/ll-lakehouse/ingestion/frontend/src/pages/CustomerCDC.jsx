import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Circle,
  Copy,
  Database,
  Trash2,
  UserPlus,
} from 'lucide-react';
import CopySecretButton from '../components/CopySecretButton';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { JetButton } from '../components/JetControls';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';
import { api } from '../utils/api';

function StatusPill({ connected, label }) {
  return (
    <span className={`streaming-status-pill ${connected ? 'is-connected' : 'is-disconnected'}`}>
      {connected ? <CheckCircle2 size={14} /> : <Circle size={14} />}
      {label}
    </span>
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

function Metric({ label, value }) {
  return (
    <div className="streaming-metric">
      <span>{label}</span>
      <strong>{value}</strong>
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

function CustomerTable({ title, connected, error, rows, badge, emptyLabel = 'No customer rows available.' }) {
  return (
    <div className="cdc-table-panel">
      <div className="streaming-panel__header">
        <div>
          <p className="section-kicker">{badge}</p>
          <h3>{title}</h3>
        </div>
        <StatusPill connected={connected} label={connected ? 'Ready' : 'Pending'} />
      </div>

      {error && <p className="streaming-error">{error}</p>}

      <div className="cdc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Loyalty</th>
              <th>Email</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.sourceCustomerId}>
                <td>
                  <strong>{row.customerName}</strong>
                  <span>{row.sourceCustomerId}</span>
                </td>
                <td>{row.loyaltyTier || 'N/A'}</td>
                <td>{row.email || 'N/A'}</td>
                <td>{formatTime(row.updatedAt)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4">
                  <div className="streaming-empty">
                    <Database size={22} />
                    <span>{emptyLabel}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CustomerCDC() {
  const [status, setStatus] = useState(null);
  const [customers, setCustomers] = useState({ source: { rows: [] }, target: { rows: [] } });
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState('');
  const [lastSimulation, setLastSimulation] = useState(null);
  const [showImportance, setShowImportance] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextCustomers] = await Promise.all([
        api.customerCdc.status(),
        api.customerCdc.customers(12),
      ]);
      setStatus(nextStatus);
      setCustomers(nextCustomers);
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

  const source = status?.source || {};
  const target = status?.target || {};
  const goldengate = status?.goldengate || {};
  const pipeline = status?.pipeline || {};
  const sync = status?.sync || {};
  const sourceRows = customers?.source?.rows || [];
  const targetRows = customers?.target?.rows || [];
  const ggPassword = goldengate?.credentials?.password || '';
  const baselineSynced = Boolean(sync.initialLoadComplete);
  const sourceRowCount = Number(source.rowCount || 0);
  const targetRowCount = Number(target.rowCount || 0);
  const runtimeExtracts = goldengate?.runtimeProcesses?.extracts || [];
  const runtimeReplicats = goldengate?.runtimeProcesses?.replicats || [];
  const runtimeRunning = runtimeExtracts.some((extract) => extract.status === 'running')
    && runtimeReplicats.some((replicat) => replicat.status === 'running');

  const statusCards = useMemo(() => [
    {
      label: 'NetSuite Source DB',
      connected: Boolean(source.connected),
      detail: source.connected ? `${sourceRowCount} customers on port ${source.hostPort || '1522'}` : source.detail || 'Waiting for source DB',
    },
    {
      label: 'Oracle GoldenGate Studio Free',
      connected: Boolean(goldengate.connected),
      detail: goldengate.configured ? 'Pipeline is ready for user start' : goldengate.detail || 'Waiting for GoldenGate Studio',
    },
    {
      label: 'ADB Bronze Customer Mirror',
      connected: Boolean(target.connected),
      detail: target.connected
        ? `${targetRowCount} mirrored customers${baselineSynced ? ' - baseline synced' : ''}`
        : target.detail || 'Waiting for ADB target',
    },
    {
      label: 'CDC Flow',
      connected: Boolean(source.connected && goldengate.connected && target.connected && baselineSynced && runtimeRunning),
      detail: runtimeRunning
        ? 'GoldenGate runtime is applying changes'
        : 'Open Studio and start the pipeline',
    },
  ], [source, target, goldengate, sourceRowCount, targetRowCount, baselineSynced, runtimeRunning]);

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  async function runAction(actionName, action) {
    try {
      setBusyAction(actionName);
      setError(null);
      const result = await action();
      if (actionName === 'insert' || actionName === 'update') {
        setLastSimulation(result);
      } else {
        setLastSimulation(null);
      }
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  const simulationCustomer = lastSimulation?.sourceCustomer;
  const replication = lastSimulation?.replication;
  const simulationDisabled = !source.connected || !baselineSynced || !runtimeRunning || Boolean(busyAction);

  return (
    <div className="streaming-page cdc-page fade-in">
      <section className="streaming-hero">
        <div className="streaming-hero__copy">
          <p className="section-kicker">Ingest</p>
          <h2>Change Data Capture</h2>
          <p>
            NetSuite and the ADB Bronze mirror start with the same customers. Start the GoldenGate Studio pipeline, then insert a new NetSuite customer here and watch CDC apply it.
          </p>
        </div>
        <div className="streaming-hero__actions">
          <ImportanceButton onClick={() => setShowImportance(true)} />
          <JetButton
            label="Open GoldenGate"
            iconClass="oj-fwk-icon oj-fwk-icon-arrow-end"
            chroming="callToAction"
            disabled={!goldengate?.uiUrl}
            className="bronze-guide-open-button"
            onAction={() => goldengate?.uiUrl && window.open(goldengate.uiUrl, '_blank', 'noopener,noreferrer')}
            title={goldengate?.uiUrl ? 'Open GoldenGate Studio in a new tab' : 'GoldenGate Studio is not available'}
          />
          <div className="streaming-osa-credentials" aria-label="GoldenGate Studio login credentials">
            <strong className="streaming-osa-credentials__title">Login information</strong>
            <div>
              <span>Username</span>
              <div className="credential-copy-row">
                <strong>{goldengate?.credentials?.username || 'Not configured'}</strong>
                <CopySecretButton
                  value={goldengate?.credentials?.username || ''}
                  label="GoldenGate Studio username"
                  disabled={!goldengate?.credentials?.username}
                  unavailableTitle="GoldenGate Studio username is not available to copy"
                />
              </div>
            </div>
            <div>
              <span>Password</span>
              <div className="credential-copy-row">
                <strong>{ggPassword || 'Not configured'}</strong>
                <CopySecretButton value={ggPassword} label="GoldenGate Studio password" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.customerCdc}
      />

      <section className="streaming-status-grid" aria-label="CDC status">
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
              <h3>GoldenGate Studio CDC Configuration</h3>
            </div>
            {copied && <span className="streaming-copy-state">Copied</span>}
          </div>

          <div className="streaming-pipeline-values">
            <PipelineValue label="Source Table" value={pipeline.sourceTable} onCopy={copyValue} />
            <PipelineValue label="Target Table" value={pipeline.targetTable} onCopy={copyValue} />
            <PipelineValue label="Extract" value={runtimeExtracts.map((extract) => extract.name).join(', ') || 'Created by Studio when started'} onCopy={copyValue} />
            <PipelineValue label="Replicat" value={runtimeReplicats.map((replicat) => replicat.name).join(', ') || 'Created by Studio when started'} onCopy={copyValue} />
          </div>

          <div className="streaming-metrics">
            <Metric label="NetSuite DB Port" value={pipeline.hostPorts?.netsuiteDb || '1522'} />
            <Metric label="GoldenGate Studio" value={pipeline.hostPorts?.goldenGateHttp || '8501'} />
            <Metric label="Source Rows" value={sourceRowCount.toLocaleString()} />
            <Metric label="Bronze Rows" value={targetRowCount.toLocaleString()} />
          </div>

          <div className={`cdc-simulation-result ${baselineSynced ? 'is-replicated' : ''}`}>
            <div>
              <StatusPill connected={baselineSynced} label={baselineSynced ? 'Baseline Synced' : 'Baseline Pending'} />
              <strong>{baselineSynced ? 'Baseline ready for CDC' : 'Baseline is not synchronized'}</strong>
              <span>{sourceRowCount} NetSuite rows, {targetRowCount} Bronze rows</span>
            </div>
            <p>
              {runtimeRunning
                ? 'Use the NetSuite actions to generate a new customer change.'
                : 'Open GoldenGate Studio and start the pipeline before generating the next customer change.'}
            </p>
          </div>
        </div>

        <div className="streaming-panel">
          <div className="streaming-panel__header">
            <div>
              <p className="section-kicker">NetSuite Source</p>
              <h3>Simulate Customer Changes</h3>
            </div>
            <Activity size={20} className="streaming-panel-icon" />
          </div>

          <div className="streaming-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={simulationDisabled}
              onClick={() => runAction('insert', () => api.customerCdc.simulate('insert'))}
              title={runtimeRunning ? 'Insert a NetSuite customer' : 'Start the GoldenGate pipeline first'}
            >
              <UserPlus size={16} />
              Insert Customer
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={!source.connected || Boolean(busyAction)}
              onClick={() => runAction('clear', () => api.customerCdc.clearDemoCustomers())}
            >
              <Trash2 size={16} />
              Clear Demo Rows
            </button>
          </div>

          {error && <p className="streaming-error">{error}</p>}
          {baselineSynced && !runtimeRunning && (
            <p className="streaming-error">
              Start the GoldenGate Studio pipeline before inserting customers.
            </p>
          )}
          {!baselineSynced && (
            <p className="streaming-error">
              Baseline tables must be synchronized before the CDC scenario can start.
            </p>
          )}

          {lastSimulation && (
            <div className={`cdc-simulation-result ${replication?.replicated ? 'is-replicated' : ''}`}>
              <div>
                <StatusPill connected={Boolean(replication?.replicated)} label={replication?.replicated ? 'Replicated' : 'Pending'} />
                <strong>{simulationCustomer?.customerName || 'Customer change'}</strong>
                <span>{simulationCustomer?.sourceCustomerId} · {simulationCustomer?.loyaltyTier}</span>
              </div>
              <p>
                {replication?.replicated
                  ? `Bronze mirror refreshed after ${replication.attempts} poll attempt${replication.attempts === 1 ? '' : 's'}.`
                  : replication?.detail || 'Waiting for the GoldenGate replicat to apply the change.'}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="cdc-tables">
        <CustomerTable
          title="NETSUITE.CUSTOMERS"
          badge="Source"
          connected={Boolean(customers?.source?.connected)}
          error={customers?.source?.error}
          rows={sourceRows}
        />
        <CustomerTable
          title={pipeline.targetTable || 'PG.BRONZE_NETSUITE_CUSTOMERS'}
          badge="Bronze Mirror"
          connected={Boolean(customers?.target?.connected)}
          error={customers?.target?.error}
          rows={targetRows}
          emptyLabel="The Bronze baseline has not been seeded yet."
        />
      </section>
    </div>
  );
}
