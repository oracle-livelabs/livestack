/**
 * OracleInfoPanel — collapsible "Oracle Internals" explainer widget.
 * Collapsed by default. Click the toggle to reveal rich content
 * describing which Oracle database features power each page.
 */
import { useState } from 'react';
import { Database, ChevronDown } from 'lucide-react';

export default function OracleInfoPanel({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2">
      {/* Toggle trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[11px] font-medium tracking-wide
                   text-[var(--color-text-dim)] hover:text-[var(--color-text)]
                   border border-[var(--color-border)] hover:border-[var(--color-oracle)]
                   px-3 py-1.5 rounded-lg transition-all duration-200 group select-none"
      >
        <Database size={11} className="text-[var(--color-oracle)]" />
        <span>How Oracle Powers This</span>
        <ChevronDown
          size={11}
          className={`ml-1 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Panel body */}
      {open && (
        <div
          className="mt-3 rounded-xl border border-[var(--color-border)]
                     border-t-2 overflow-hidden fade-in"
          style={{ borderTopColor: '#c74634' }}
        >
          {/* Oracle red header bar */}
          <div
            className="flex items-center gap-2 px-5 py-2.5"
            style={{ background: 'linear-gradient(90deg,rgba(199,70,52,0.18),rgba(199,70,52,0.04))' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <ellipse cx="9" cy="9" rx="8" ry="8" stroke="#c74634" strokeWidth="1.5"/>
              <ellipse cx="9" cy="9" rx="4" ry="8" stroke="#c74634" strokeWidth="1.5"/>
              <line x1="1" y1="9" x2="17" y2="9" stroke="#c74634" strokeWidth="1.5"/>
            </svg>
            <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: '#c74634' }}>
              Oracle Database Internals
            </span>
          </div>

          {/* Content */}
          <div className="bg-[var(--color-surface)]/60 backdrop-blur-md p-5">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared sub-components used inside panel content ─────────────────── */

export function FeatureBadge({ label, color = 'blue' }) {
  const palettes = {
    orange: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
    blue:   'bg-blue-500/15   text-blue-300   border-blue-500/25',
    green:  'bg-green-500/15  text-green-300  border-green-500/25',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
    cyan:   'bg-cyan-500/15   text-cyan-300   border-cyan-500/25',
    red:    'bg-red-500/15    text-red-300    border-red-500/25',
    yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
    pink:   'bg-pink-500/15   text-pink-300   border-pink-500/25',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${palettes[color] || palettes.blue}`}>
      {label}
    </span>
  );
}

export function SqlBlock({ code }) {
  return (
    <pre
      className="text-[10px] leading-relaxed font-mono rounded-lg p-3 overflow-x-auto"
      style={{ background: 'rgba(0,0,0,0.5)', color: '#86efac' }}
    >
      {code}
    </pre>
  );
}

export function DiagramBox({ label, sub, color = '#1B84ED', wide = false }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-center border ${wide ? 'col-span-2' : ''}`}
      style={{ borderColor: color + '55', background: color + '18' }}
    >
      <div className="text-[10px] font-semibold" style={{ color }}>{label}</div>
      {sub && <div className="text-[9px] mt-0.5" style={{ color: color + 'aa' }}>{sub}</div>}
    </div>
  );
}
