import { useState } from 'react';
import { CheckCircle2, Clipboard } from 'lucide-react';
import CopySecretButton from '../components/CopySecretButton';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { JetButton } from '../components/JetControls';
import LiveLabsMarkdownGuide from '../components/LiveLabsMarkdownGuide';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

const PG_USERNAME = 'PG';
const OBJECT_STORAGE_PREFIX = 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/qGpMGRxKi6wtrlG_dURHlmdUUGZ9euFDDXV12zsI7eEkzAkvXNKJaMbtCnKlfXp_/n/c4u04/b/ai-lh/o/';
const GUIDE_MARKDOWN_URL = 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/batch-and-file-loading/batch-and-file-loading.md';
const GUIDE_IMAGE_DIRECTORY_URL = 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/batch-and-file-loading/images/';
const GUIDE_SOURCE_URL = 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/batch-and-file-loading/batch-and-file-loading.md';
const GUIDE_SOURCE_DIRECTORY_URL = 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/batch-and-file-loading/';

export default function BronzeDataLoadGuide({ dataStudioUrl, hasLakehouseConnection, pgPassword }) {
  const [showImportance, setShowImportance] = useState(false);
  const [copiedPrefix, setCopiedPrefix] = useState(false);
  const seededPgPassword = pgPassword || 'From DBPASSWORD';
  const canCopySeededPgPassword = Boolean(pgPassword);

  const openDataStudio = () => {
    if (!dataStudioUrl) return;
    window.open(dataStudioUrl, '_blank', 'noopener,noreferrer');
  };

  const copyObjectStoragePrefix = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(OBJECT_STORAGE_PREFIX);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = OBJECT_STORAGE_PREFIX;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setCopiedPrefix(true);
    window.setTimeout(() => setCopiedPrefix(false), 1600);
  };

  return (
    <div className="bronze-guide-page fade-in">
      <section className="bronze-guide-hero">
        <div className="bronze-guide-hero__copy">
          <p className="section-kicker">Ingest</p>
          <h2>Load Bronze data with Data Studio</h2>
          <p>
            Use this guided flow to load the PeakGear product master extract from Object Storage
            into a Bronze table in the PG schema.
          </p>
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
                <CopySecretButton
                  value={PG_USERNAME}
                  label="PG username"
                  disabled={!PG_USERNAME}
                  unavailableTitle="PG username is not available to copy"
                />
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

        <section className="bronze-guide-source bronze-guide-source--hero" aria-labelledby="bronze-source-title">
          <div>
            <h3 id="bronze-source-title">Object Storage prefix</h3>
            <p>Paste this URL into the Cloud Store public URL field.</p>
          </div>
          <div className="bronze-guide-source__url">
            <code>{OBJECT_STORAGE_PREFIX}</code>
            <button
              type="button"
              className="bronze-guide-copy-button"
              onClick={copyObjectStoragePrefix}
              aria-label="Copy Object Storage PAR URL"
            >
              {copiedPrefix ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
              {copiedPrefix ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </section>
      </section>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.bronzeLoad}
      />

      <LiveLabsMarkdownGuide
        markdownUrl={GUIDE_MARKDOWN_URL}
        imageDirectoryUrl={GUIDE_IMAGE_DIRECTORY_URL}
        sourceUrl={GUIDE_SOURCE_URL}
        sourceDirectoryUrl={GUIDE_SOURCE_DIRECTORY_URL}
        ariaLabel="LiveLabs Batch and File Loading guide"
        loadingDescription="Retrieving the latest Batch and File Loading instructions and images."
      />
    </div>
  );
}
