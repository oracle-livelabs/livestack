import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize2, RefreshCw, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopySecretButton from '../components/CopySecretButton';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { JetButton } from '../components/JetControls';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

const GUIDE_FETCH_TIMEOUT_MS = 15000;
const REMARK_PLUGINS = [remarkGfm];
const PG_USERNAME = 'PG';

const DEFAULT_GUIDE = {
  title: 'Transform Iceberg Data',
  description: 'This demo shows how PeakGear transforms product data stored in an external Apache Iceberg table. Oracle Data Transforms reads the Iceberg-backed Bronze source, applies a business transformation, and writes the result to a new Gold product table while leaving the original Bronze data unchanged.',
  importance: 'silverProcess',
  markdownUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/process-bronze-to-silver/process-bronze-to-silver.md',
  imageDirectoryUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/process-bronze-to-silver/images/',
  sourceUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/process-bronze-to-silver/process-bronze-to-silver.md',
  sourceDirectoryUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/process-bronze-to-silver/',
  loadingDescription: 'Retrieving the latest Bronze-to-Silver instructions and images.',
  guideLabel: 'LiveLabs Bronze to Silver guide',
};

function transformGuideUrl(url, key, guide) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('#')) return key === 'href' ? value : '';

  try {
    const baseUrl = key === 'src' ? guide.markdownUrl : guide.sourceDirectoryUrl;
    const resolvedUrl = new URL(value, baseUrl);

    if (key === 'src') {
      return resolvedUrl.protocol === 'https:' && resolvedUrl.href.startsWith(guide.imageDirectoryUrl)
        ? resolvedUrl.href
        : '';
    }

    return ['http:', 'https:', 'mailto:'].includes(resolvedUrl.protocol) ? resolvedUrl.href : '';
  } catch {
    return '';
  }
}

function GuideLink({ href = '', children, title }) {
  if (!href) return <span>{children}</span>;

  const opensNewTab = /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      title={title}
      target={opensNewTab ? '_blank' : undefined}
      rel={opensNewTab ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

function GuideImage({ src, alt = '', title, onSelect }) {
  if (!src) return null;

  const accessibleLabel = alt || title || 'LiveLabs guide image';

  return (
    <button
      type="button"
      className="silver-guide-markdown__image"
      data-guide-image-src={src}
      onClick={(event) => onSelect({ src, alt, title: title || accessibleLabel }, event.currentTarget)}
      aria-label={`Enlarge image: ${accessibleLabel}`}
    >
      <img src={src} alt={alt} title={title} loading="lazy" decoding="async" />
      <span>
        <Maximize2 size={14} aria-hidden="true" />
        Enlarge
      </span>
    </button>
  );
}

export default function SilverProcessGuide({
  dataTransformsUrl,
  hasLakehouseConnection,
  pgPassword,
  guide: guideOverrides,
  extraCredentials = [],
}) {
  const guide = { ...DEFAULT_GUIDE, ...guideOverrides };
  const [showImportance, setShowImportance] = useState(false);
  const [guideState, setGuideState] = useState({ status: 'loading', markdown: '', error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const imageTriggerRef = useRef(null);
  const lightboxCloseRef = useRef(null);
  const seededPgPassword = pgPassword || 'From DBPASSWORD';
  const canCopySeededPgPassword = Boolean(pgPassword);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, GUIDE_FETCH_TIMEOUT_MS);

    setGuideState({ status: 'loading', markdown: '', error: '' });

    async function loadGuide() {
      try {
        const response = await fetch(guide.markdownUrl, {
          cache: 'no-cache',
          headers: { Accept: 'text/plain' },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`LiveLabs returned HTTP ${response.status}`);
        }

        const markdown = await response.text();
        if (!markdown.trim()) {
          throw new Error('LiveLabs returned an empty guide');
        }

        if (active) {
          setGuideState({ status: 'ready', markdown, error: '' });
        }
      } catch (error) {
        if (!active || (error.name === 'AbortError' && !timedOut)) return;
        setGuideState({
          status: 'error',
          markdown: '',
          error: timedOut
            ? 'The LiveLabs request timed out after 15 seconds.'
            : error.message || 'The LiveLabs guide could not be loaded.',
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    loadGuide();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [guide.markdownUrl, reloadToken]);

  useEffect(() => {
    if (!selectedImage) return undefined;

    const scrollContainer = document.querySelector('.app-content');
    const previousBodyOverflow = document.body.style.overflow;
    const previousContentOverflow = scrollContainer?.style.overflow;
    document.body.style.overflow = 'hidden';
    if (scrollContainer) scrollContainer.style.overflow = 'hidden';
    lightboxCloseRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedImage(null);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        lightboxCloseRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (scrollContainer) scrollContainer.style.overflow = previousContentOverflow || '';
      window.setTimeout(() => {
        if (document.querySelector('.bronze-guide-lightbox')) return;
        const currentTrigger = Array.from(document.querySelectorAll('[data-guide-image-src]'))
          .find((element) => element.getAttribute('data-guide-image-src') === selectedImage.src);
        (currentTrigger || imageTriggerRef.current)?.focus();
      }, 0);
    };
  }, [selectedImage]);

  const openDataTransforms = () => {
    if (!dataTransformsUrl) return;
    window.open(dataTransformsUrl, '_blank', 'noopener,noreferrer');
  };

  const openImage = (image, trigger) => {
    imageTriggerRef.current = trigger;
    setSelectedImage(image);
  };

  const markdownComponents = {
    h1: ({ children }) => <h2>{children}</h2>,
    h2: ({ children }) => <h3>{children}</h3>,
    h3: ({ children }) => <h4>{children}</h4>,
    h4: ({ children }) => <h5>{children}</h5>,
    h5: ({ children }) => <h6>{children}</h6>,
    h6: ({ children }) => <h6>{children}</h6>,
    a: GuideLink,
    img: (props) => <GuideImage {...props} onSelect={openImage} />,
    table: ({ children }) => (
      <div className="silver-guide-markdown__table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  const credentialsPanel = (
    <div className="streaming-osa-credentials" aria-label="Data Transforms login credentials">
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
      {extraCredentials.map(({ label, value, unavailableTitle }) => (
        <div key={label}>
          <span>{label}</span>
          <div className="credential-copy-row">
            <strong>{value || 'Unavailable'}</strong>
            <CopySecretButton
              value={value}
              label={label}
              disabled={!value}
              unavailableTitle={unavailableTitle || `${label} is not available to copy`}
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bronze-guide-page fade-in">
      <section className={`bronze-guide-hero ${guide.fullWidthCredentials ? 'bronze-guide-hero--full-width-credentials' : ''}`}>
        <div className="bronze-guide-hero__copy">
          <p className="section-kicker">Process</p>
          <h2>{guide.title}</h2>
          <p>{guide.description}</p>
        </div>
        <div className="bronze-guide-actions">
          <div className="bronze-guide-action-row">
            <ImportanceButton onClick={() => setShowImportance(true)} />
            <JetButton
              label="Open Data Transforms"
              iconClass="oj-fwk-icon oj-fwk-icon-arrow-end"
              chroming="callToAction"
              disabled={!hasLakehouseConnection || !dataTransformsUrl}
              className="bronze-guide-open-button silver-guide-open-button"
              onAction={openDataTransforms}
              title={hasLakehouseConnection ? 'Open Data Transforms in a new tab' : 'Connect to ADB first'}
            />
          </div>
          {!guide.fullWidthCredentials && credentialsPanel}
        </div>
        {guide.fullWidthCredentials && credentialsPanel}
      </section>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT[guide.importance]}
      />

      <section
        className="silver-guide-live"
        aria-label={guide.guideLabel}
        aria-busy={guideState.status === 'loading'}
      >
        {guideState.status === 'loading' && (
          <div className="silver-guide-live__status" role="status" aria-live="polite">
            <span className="silver-guide-live__spinner" aria-hidden="true" />
            <div>
              <strong>Loading the LiveLabs guide</strong>
              <p>{guide.loadingDescription}</p>
            </div>
          </div>
        )}

        {guideState.status === 'error' && (
          <div className="silver-guide-live__error" role="alert">
            <div>
              <strong>The LiveLabs guide is temporarily unavailable</strong>
              <p>{guideState.error}</p>
            </div>
            <div className="silver-guide-live__error-actions">
              <button type="button" onClick={() => setReloadToken((current) => current + 1)}>
                <RefreshCw size={16} aria-hidden="true" />
                Retry
              </button>
              <a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer">
                Open guide source
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        )}

        {guideState.status === 'ready' && (
          <article className="silver-guide-markdown">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              components={markdownComponents}
              skipHtml
              urlTransform={(url, key) => transformGuideUrl(url, key, guide)}
            >
              {guideState.markdown}
            </ReactMarkdown>
          </article>
        )}
      </section>

      {selectedImage && (
        <div
          className="bronze-guide-lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="silver-guide-lightbox-title"
        >
          <button
            type="button"
            className="bronze-guide-lightbox__backdrop"
            tabIndex={-1}
            aria-label="Close enlarged image"
            onClick={() => setSelectedImage(null)}
          />
          <div className="bronze-guide-lightbox__panel">
            <div className="bronze-guide-lightbox__header">
              <h3 id="silver-guide-lightbox-title">{selectedImage.title}</h3>
              <button
                ref={lightboxCloseRef}
                type="button"
                onClick={() => setSelectedImage(null)}
                aria-label="Close enlarged image"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <img src={selectedImage.src} alt={selectedImage.alt} />
          </div>
        </div>
      )}
    </div>
  );
}
