import { useEffect, useState } from 'react';
import { AlertTriangle, Database, Loader2, RefreshCw } from 'lucide-react';
import CopySecretButton from '../components/CopySecretButton';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { JetButton } from '../components/JetControls';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';
import { useUser } from '../context/UserContext';
import { api } from '../utils/api';

const PG_USERNAME = 'PG';

function SourceConnection({ source }) {
  return (
    <div className="data-catalog-connection">
      <div className="data-catalog-connection__heading">
        <Database size={17} aria-hidden="true" />
        <div>
          <span>{source.engine}</span>
          <strong>{source.name}</strong>
        </div>
      </div>
      <div className="data-catalog-connection__value">
        <code>{source.connectionString || 'Not available'}</code>
        <CopySecretButton
          value={source.connectionString}
          label={`${source.name} connection string`}
          disabled={!source.connectionString}
          unavailableTitle="Connection string is not available"
        />
      </div>
    </div>
  );
}

function AwsGlueCatalogSection() {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError('');

    try {
      const request = api.awsGlue.configure({ accessKeyId, secretAccessKey, region });
      setAccessKeyId('');
      setSecretAccessKey('');
      const response = await request;
      setResult(response);
    } catch (err) {
      setError(err.message || 'AWS Glue catalog configuration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="glass-card p-5 space-y-4" aria-labelledby="aws-glue-catalog-heading">
      <div>
        <p className="section-kicker">External data catalog</p>
        <h3 id="aws-glue-catalog-heading" className="text-lg font-bold mt-1">AWS Glue Data Catalog</h3>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Mount an AWS Glue catalog in the <code>PG</code> schema as <code>GLUE_CAT</code>.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="lakehouse-form-grid">
          <label className="lakehouse-field" htmlFor="aws-glue-access-key-id">
            <span>AWS Access Key ID</span>
            <input
              id="aws-glue-access-key-id"
              className="lakehouse-input"
              type="text"
              value={accessKeyId}
              autoComplete="off"
              required
              onChange={(event) => setAccessKeyId(event.target.value)}
            />
          </label>
          <label className="lakehouse-field" htmlFor="aws-glue-secret-access-key">
            <span>AWS Secret Access Key</span>
            <input
              id="aws-glue-secret-access-key"
              className="lakehouse-input"
              type="password"
              value={secretAccessKey}
              autoComplete="new-password"
              required
              onChange={(event) => setSecretAccessKey(event.target.value)}
            />
          </label>
          <label className="lakehouse-field" htmlFor="aws-glue-region">
            <span>AWS Region</span>
            <input
              id="aws-glue-region"
              className="lakehouse-input"
              type="text"
              value={region}
              placeholder="us-east-1"
              required
              onChange={(event) => setRegion(event.target.value)}
            />
          </label>
        </div>

        <p className="text-xs text-[var(--color-text-dim)]">
          Credentials are submitted once to create the ADB credential <code>AWS_CRED</code>. They are not stored in this browser, the custom image, Terraform, or application configuration.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Configuring AWS Glue...' : 'Configure AWS Glue Catalog'}
          </button>
          {submitting && <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />}
        </div>
      </form>

      {result && (
        <div className="lakehouse-message is-success" role="status">
          <p>AWS Glue catalog <code>{result.catalogName}</code> is mounted for <code>PG</code> in region <code>{result.region}</code>.</p>
        </div>
      )}
      {error && <div className="lakehouse-message is-error" role="alert"><p>{error}</p></div>}
    </section>
  );
}

export default function DataSources({ dataStudioUrl, hasLakehouseConnection, pgPassword }) {
  const { currentUser } = useUser();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creatingCatalogs, setCreatingCatalogs] = useState(false);
  const [catalogResult, setCatalogResult] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [showImportance, setShowImportance] = useState(false);
  const seededPgPassword = pgPassword || 'From DBPASSWORD';
  const canCopySeededPgPassword = Boolean(pgPassword);

  const loadSources = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.dataSources.list());
    } catch (err) {
      setError(err.message || 'Data source details are unavailable.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const sources = Array.isArray(result?.sources) ? result.sources : [];
  const isAdmin = currentUser?.ROLE === 'admin';

  const createDatabaseLinks = async () => {
    setCreatingCatalogs(true);
    setCatalogError('');
    setCatalogResult(null);
    try {
      setCatalogResult(await api.sourceCatalogs.create());
    } catch (err) {
      setCatalogError(err.message || 'Database links could not be created.');
    } finally {
      setCreatingCatalogs(false);
    }
  };

  const replaceDatabaseLinks = async () => {
    setCreatingCatalogs(true);
    setCatalogError('');
    setCatalogResult(null);
    try {
      setCatalogResult(await api.sourceCatalogs.replace());
    } catch (err) {
      setCatalogError(err.message || 'Database links could not be replaced.');
    } finally {
      setCreatingCatalogs(false);
    }
  };

  const openDataStudio = () => {
    if (dataStudioUrl) window.open(dataStudioUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bronze-guide-page data-catalog-page fade-in">
      <section className="bronze-guide-hero data-catalog-hero">
        <div className="bronze-guide-hero__copy">
          <p className="section-kicker">Catalog</p>
          <h2>Data Catalog</h2>
        </div>

        <div className="bronze-guide-actions">
          <div className="bronze-guide-action-row">
            <ImportanceButton onClick={() => setShowImportance(true)} />
            <JetButton
              label="Open Data Studio"
              iconClass="oj-fwk-icon oj-fwk-icon-arrow-end"
              chroming="callToAction"
              disabled={!hasLakehouseConnection || !dataStudioUrl}
              className="bronze-guide-open-button"
              onAction={openDataStudio}
              title={hasLakehouseConnection ? 'Open Data Studio in a new tab' : 'Connect to ADB first'}
            />
          </div>

          <div className="streaming-osa-credentials" aria-label="Data Studio login credentials">
            <strong className="streaming-osa-credentials__title">Login information</strong>
            <div>
              <span>Username</span>
              <div className="credential-copy-row">
                <strong>{PG_USERNAME}</strong>
                <CopySecretButton value={PG_USERNAME} label="PG username" />
              </div>
            </div>
            <div>
              <span>Password</span>
              <div className="credential-copy-row">
                <strong>{seededPgPassword}</strong>
                <CopySecretButton
                  value={pgPassword}
                  label="PG password"
                  disabled={!canCopySeededPgPassword}
                  unavailableTitle="Connect to ADB first to copy the seeded PG password"
                />
              </div>
            </div>
          </div>
        </div>

        <section className="bronze-guide-source bronze-guide-source--hero data-catalog-links" aria-labelledby="database-links-title">
          <div>
            <p className="section-kicker">Data Studio catalogs</p>
            <h3 id="database-links-title">Create Database Links</h3>
          </div>
          <div className="data-catalog-links__controls">
            {isAdmin ? (
              <>
                <JetButton
                  label={creatingCatalogs ? 'Creating Database Links…' : 'Create Database Links'}
                  chroming="solid"
                  disabled={creatingCatalogs}
                  onAction={() => void createDatabaseLinks()}
                />
                <JetButton
                  label="Replace Database Links"
                  chroming="outlined"
                  disabled={creatingCatalogs}
                  onAction={() => void replaceDatabaseLinks()}
                />
              </>
            ) : (
              <p>Switch to an administrator to create the database links.</p>
            )}
          </div>
        </section>

        <section className="bronze-guide-source bronze-guide-source--hero data-catalog-connections" aria-labelledby="source-connections-title">
          <div>
            <h3 id="source-connections-title">Source database connection strings</h3>
          </div>
          {error ? (
            <div className="data-catalog-message" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="data-catalog-message" role="status">
              <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
              <span>Loading source connection details…</span>
            </div>
          ) : (
            <div className="data-catalog-connection-list">
              {sources.map((source) => <SourceConnection key={source.id} source={source} />)}
            </div>
          )}
        </section>
      </section>

      <AwsGlueCatalogSection />

      {catalogError ? (
        <section className="glass-card p-5 data-sources-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Database links were not created</strong>
            <p>{catalogError}</p>
          </div>
        </section>
      ) : null}

      {catalogResult ? (
        <section className="glass-card p-5 data-source-catalog-success" role="status">
          <strong>Database links are ready</strong>
          <p>{catalogResult.catalogs.map((catalog) => `${catalog.engine}: ${catalog.catalogName}${catalog.replaced ? ' (replaced)' : ''}`).join(' · ')}</p>
        </section>
      ) : null}

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.dataCatalog}
      />
    </div>
  );
}
