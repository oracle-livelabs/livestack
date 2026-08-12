import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

async function writeClipboardText(value) {
  const text = String(value ?? '');

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea-based path for non-secure origins.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

export default function CopySecretButton({
  value,
  label = 'password',
  disabled = false,
  unavailableTitle = 'Password is not available to copy',
  className = '',
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = String(value ?? '');
  const canCopy = !disabled && text.trim().length > 0;

  useEffect(() => {
    if (!copied && !failed) return undefined;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [copied, failed]);

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await writeClipboardText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  };

  const title = canCopy
    ? copied
      ? 'Copied'
      : `Copy ${label}`
    : unavailableTitle;

  return (
    <button
      type="button"
      className={`copy-secret-button ${copied ? 'is-copied' : ''} ${failed ? 'is-error' : ''} ${className}`.trim()}
      onClick={handleCopy}
      disabled={!canCopy}
      aria-label={title}
      title={title}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
