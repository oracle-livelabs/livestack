/**
 * RightOraclePanel — collapsible, drag-resizable right sidebar.
 * Drag the left edge to resize. Double-click the drag handle to reset width.
 * Width is persisted to localStorage across page reloads.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useOraclePanelCtx } from '../context/OraclePanelContext';

const MIN_WIDTH   = 260;
const MAX_WIDTH   = 680;
const DEFAULT_WIDTH = 360;
const STORAGE_KEY = 'oraclePanel_width';
const COLLAPSED_W = 40;

function loadWidth() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

export default function RightOraclePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth]         = useState(loadWidth);
  const [dragging, setDragging]   = useState(false);
  const panelRef   = useRef(null);
  const startXRef  = useRef(0);
  const startWRef  = useRef(0);

  const { content } = useOraclePanelCtx() || {};

  /* ── Persist width ───────────────────────────────────────── */
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
  }, [width]);

  /* ── Drag-resize handlers ────────────────────────────────── */
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault();
    if (collapsed) return;
    startXRef.current = e.clientX;
    startWRef.current = width;
    setDragging(true);
  }, [collapsed, width]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      // Drag handle is on the LEFT edge; dragging left → wider, right → narrower
      const delta = startXRef.current - e.clientX;
      const next  = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWRef.current + delta));
      setWidth(next);
    };

    const onMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [dragging]);

  /* ── Global cursor while dragging ───────────────────────── */
  useEffect(() => {
    if (dragging) {
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  if (!content) return null;

  const panelWidth = collapsed ? COLLAPSED_W : width;

  return (
    <aside
      ref={panelRef}
      className="flex-shrink-0 border-l border-[var(--color-border)] flex flex-row relative"
      style={{
        width: panelWidth,
        background: '#161616',
        // Only animate width when NOT dragging (avoid lag)
        transition: dragging ? 'none' : 'width 0.25s ease',
      }}
    >
      {/* ── Drag handle (left edge, visible when expanded) ── */}
      {!collapsed && (
        <div
          onMouseDown={onHandleMouseDown}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          title="Drag to resize · Double-click to reset"
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center group"
          style={{ width: 8, cursor: 'col-resize' }}
        >
          {/* Visible grip strip */}
          <div
            className="h-full transition-all duration-150"
            style={{
              width: dragging ? 3 : 2,
              background: dragging
                ? '#c74634'
                : 'transparent',
              borderRadius: 2,
            }}
          />
          {/* Hover highlight */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-r"
            style={{ background: 'rgba(199,70,52,0.18)' }}
          />
          {/* Grip dots */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-0 group-hover:opacity-60 transition-opacity">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-1 h-1 rounded-full" style={{ background: '#c74634' }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Panel content (full-height flex column) ───────── */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ marginLeft: collapsed ? 0 : 8 }}>

        {/* Header / toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Show Oracle Internals' : 'Collapse panel'}
          className="flex items-center gap-2 px-3 py-3 border-b border-[var(--color-border)]
                     hover:bg-[var(--color-surface-hover)] transition-colors w-full flex-shrink-0"
        >
          {collapsed ? (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="mx-auto flex-shrink-0">
              <ellipse cx="9" cy="9" rx="8" ry="8" stroke="#c74634" strokeWidth="1.5"/>
              <ellipse cx="9" cy="9" rx="4" ry="8" stroke="#c74634" strokeWidth="1.5"/>
              <line x1="1" y1="9" x2="17" y2="9" stroke="#c74634" strokeWidth="1.5"/>
            </svg>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
                <ellipse cx="9" cy="9" rx="8" ry="8" stroke="#c74634" strokeWidth="1.5"/>
                <ellipse cx="9" cy="9" rx="4" ry="8" stroke="#c74634" strokeWidth="1.5"/>
                <line x1="1" y1="9" x2="17" y2="9" stroke="#c74634" strokeWidth="1.5"/>
              </svg>
              <span
                className="text-[10px] font-semibold tracking-wider uppercase flex-1 text-left truncate"
                style={{ color: '#c74634' }}
              >
                Oracle Internals
              </span>
              {/* Width indicator while dragging */}
              {dragging && (
                <span className="text-[9px] font-mono text-[var(--color-text-dim)] flex-shrink-0 mr-1">
                  {width}px
                </span>
              )}
              <ChevronRight size={12} className="text-[var(--color-text-dim)] flex-shrink-0" />
            </>
          )}
        </button>

        {/* Scrollable content */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {content}
          </div>
        )}
      </div>
    </aside>
  );
}
