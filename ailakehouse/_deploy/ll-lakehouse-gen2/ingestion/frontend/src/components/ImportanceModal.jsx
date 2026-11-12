import { useEffect } from 'react';
import { X } from 'lucide-react';

export function ImportanceButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`streaming-importance-button ${className}`.trim()}
      onClick={onClick}
    >
      Why is this important?
    </button>
  );
}

export default function ImportanceModal({ open, onClose, content }) {
  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open || !content) return null;

  const {
    titleId,
    title,
    kicker = 'Business Outcome',
    beneficiary,
    builder,
    lead,
    example,
    steps = [],
    value,
    closeLabel = 'Close explanation',
  } = content;

  return (
    <div
      className="streaming-importance-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="streaming-importance-modal__backdrop"
        onClick={onClose}
        aria-label={closeLabel}
      />
      <div className="streaming-importance-modal__panel">
        <div className="streaming-importance-modal__header">
          <div>
            <p className="section-kicker">{kicker}</p>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="streaming-importance-modal__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={18} />
          </button>
        </div>

        {(beneficiary || builder) && (
          <dl className="streaming-importance-personas">
            {beneficiary && (
              <div>
                <dt>Business outcome for</dt>
                <dd>{beneficiary}</dd>
              </div>
            )}
            {builder && (
              <div>
                <dt>Built by</dt>
                <dd>{builder}</dd>
              </div>
            )}
          </dl>
        )}

        {lead && <p className="streaming-importance-modal__lead">{lead}</p>}
        {example && <p className="streaming-importance-modal__example">{example}</p>}

        {steps.length > 0 && (
          <ol className="streaming-importance-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        )}

        {value && (
          <div className="streaming-importance-modal__value">
            <strong>Business value</strong>
            <span>{value}</span>
          </div>
        )}
      </div>
    </div>
  );
}
