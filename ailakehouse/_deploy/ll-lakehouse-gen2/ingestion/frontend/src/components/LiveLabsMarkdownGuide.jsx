import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Maximize2, RefreshCw, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const GUIDE_FETCH_TIMEOUT_MS = 15000;
const REMARK_PLUGINS = [remarkGfm];

function resolveGuideUrl(url, key, { markdownUrl, imageDirectoryUrl, sourceDirectoryUrl }) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('#')) return key === 'href' ? value : '';

  try {
    const baseUrl = key === 'src' ? markdownUrl : sourceDirectoryUrl;
    const resolvedUrl = new URL(value, baseUrl);

    if (key === 'src') {
      return resolvedUrl.protocol === 'https:' && resolvedUrl.href.startsWith(imageDirectoryUrl)
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

export default function LiveLabsMarkdownGuide({
  markdownUrl,
  imageDirectoryUrl,
  sourceUrl,
  sourceDirectoryUrl,
  ariaLabel,
  loadingDescription,
}) {
  const [guideState, setGuideState] = useState({ status: 'loading', markdown: '', error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const imageTriggerRef = useRef(null);
  const lightboxCloseRef = useRef(null);
  const lightboxTitleId = useId();

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
        const response = await fetch(markdownUrl, {
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
  }, [markdownUrl, reloadToken]);

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

  const transformUrl = (url, key) => resolveGuideUrl(url, key, {
    markdownUrl,
    imageDirectoryUrl,
    sourceDirectoryUrl,
  });

  return (
    <>
      <section
        className="silver-guide-live"
        aria-label={ariaLabel}
        aria-busy={guideState.status === 'loading'}
      >
        {guideState.status === 'loading' && (
          <div className="silver-guide-live__status" role="status" aria-live="polite">
            <span className="silver-guide-live__spinner" aria-hidden="true" />
            <div>
              <strong>Loading the LiveLabs guide</strong>
              <p>{loadingDescription}</p>
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
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
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
              urlTransform={transformUrl}
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
          aria-labelledby={lightboxTitleId}
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
              <h3 id={lightboxTitleId}>{selectedImage.title}</h3>
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
    </>
  );
}
