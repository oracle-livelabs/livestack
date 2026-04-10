import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Network, Users, Star, Search, X, TrendingUp, MapPin, Award, Zap, ChevronRight, Play, Loader2, Code2, Table2, Clock, ArrowRight, RotateCcw } from 'lucide-react';
import * as d3 from 'd3';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, getPlatformColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

// ── Connection type colors ──────────────────────────────────────────────────
const CONNECTION_COLORS = {
  follows:      '#4A4544',
  collaborates: '#1B84ED',
  reshared:     '#D4760A',
  inspired_by:  '#7B48A5',
  tagged:       '#2D9F5E',
  co_creator:   '#C74634',
  mentions:     '#1AADA8',
};

// ── Platform colors (Redwood) ───────────────────────────────────────────────
const PLATFORM_COLORS = {
  instagram: '#D4549A',
  tiktok:    '#1AADA8',
  youtube:   '#C74634',
  twitter:   '#1B84ED',
  twitch:    '#7B48A5',
};

function platformColor(p) {
  return PLATFORM_COLORS[(p || '').toLowerCase()] || '#C74634';
}

// ── ForceGraph ───────────────────────────────────────────────────────────────
function ForceGraph({ data, depth, height = 520, onNodeClick }) {
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef   = useRef(null);
  const onClickRef   = useRef(onNodeClick);
  const [measuredWidth, setMeasuredWidth] = useState(800);

  // Keep stable reference to callback so D3 handlers don't go stale
  useEffect(() => { onClickRef.current = onNodeClick; }, [onNodeClick]);

  // Measure actual container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setMeasuredWidth(w);
      }
    });
    ro.observe(el);
    // Set initial width immediately
    const initW = el.getBoundingClientRect().width;
    if (initW > 0) setMeasuredWidth(Math.round(initW));
    return () => ro.disconnect();
  }, []);

  const width = measuredWidth;

  useEffect(() => {
    if (!data || !data.nodes?.length || !width) return;

    // ── Clean up previous render ──────────────────────────────────────────
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const tip = d3.select(tooltipRef.current);
    tip.style('opacity', 0);

    // ── Build node/link data ──────────────────────────────────────────────
    // Count links per node to scale vertex size by connectivity
    const linkCounts = new Map();
    data.edges.forEach(e => {
      linkCounts.set(e.source, (linkCounts.get(e.source) || 0) + 1);
      linkCounts.set(e.target, (linkCounts.get(e.target) || 0) + 1);
    });
    const maxLinks = Math.max(1, ...linkCounts.values());

    const nodeMap = new Map();
    const nodes = data.nodes.map(d => {
      const lc = linkCounts.get(d.INFLUENCER_ID) || 0;
      const n = {
        ...d,
        id:         d.INFLUENCER_ID,
        linkCount:  lc,
        // Scale radius by number of connections: more links → larger vertex
        radius: d.type === 'center'
          ? Math.max(22, 18 + (lc / maxLinks) * 14)
          : Math.max(6, 6 + (lc / maxLinks) * 16),
        hopOpacity: d.type === 'center' ? 1.0
          : d.hopLevel === 1 ? 0.92
          : d.hopLevel === 2 ? 0.75
          : 0.55,
      };
      nodeMap.set(n.id, n);
      return n;
    });

    const links = data.edges.map(d => ({
      ...d,
      source:   d.source,
      target:   d.target,
      color:    CONNECTION_COLORS[d.type] || '#4A4544',
      strength: d.strength || 0.5,
    }));

    // ── SVG scaffolding ───────────────────────────────────────────────────
    const g = svg.append('g');

    const zoomBehavior = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoomBehavior);

    // ── Simulation ────────────────────────────────────────────────────────
    const chargeStr = depth === 1 ? -280 : depth === 2 ? -200 : depth === 3 ? -140 : depth === 4 ? -100 : -70;
    const linkDist  = depth === 1 ?  110 : depth === 2 ?   90 : depth === 3 ?  70 : depth === 4 ?   55 :  45;

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(linkDist).strength(d => d.strength * 0.4))
      .force('charge', d3.forceManyBody().strength(chargeStr))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.radius + 5));

    // ── Arrowhead marker definitions (one per connection color) ────────────
    const defs = svg.append('defs');
    const usedColors = [...new Set(links.map(d => d.color))];
    usedColors.forEach(color => {
      defs.append('marker')
        .attr('id', `arrow-${color.replace('#', '')}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
          .attr('d', 'M0,-3.5L8,0L0,3.5')
          .attr('fill', color)
          .attr('opacity', 0.7);
    });

    // ── Edge visible lines ────────────────────────────────────────────────
    const link = g.selectAll('.link')
      .data(links).enter().append('line')
      .attr('class', 'link')
      .attr('stroke', d => d.color)
      .attr('stroke-opacity', d => Math.max(0.15, d.strength * 0.55))
      .attr('stroke-width', d => Math.max(0.5, d.strength * 2.5))
      .attr('marker-end', d => `url(#arrow-${d.color.replace('#', '')})`);

    // ── Edge invisible hit-area lines (for hover) ─────────────────────────
    const linkHit = g.selectAll('.link-hit')
      .data(links).enter().append('line')
      .attr('class', 'link-hit')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .style('cursor', 'default')
      .on('mouseover', function(event, d) {
        const typeLabel = (d.type || 'unknown').replace(/_/g, ' ');
        const color     = CONNECTION_COLORS[d.type] || '#aaa';
        tip.html(`
          <div style="font-size:11px;line-height:1.6">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
              <strong style="text-transform:capitalize">${typeLabel}</strong>
            </div>
            <div>Strength: <strong>${Math.round((d.strength || 0) * 100)}%</strong></div>
            <div>Interactions: <strong>${formatNumber(d.interactions || 0)}</strong></div>
            <div style="color:#aaa;font-size:10px;margin-top:2px">Hop ${d.hopLevel}</div>
          </div>
        `)
        .style('opacity', 1)
        .style('left', (event.pageX + 14) + 'px')
        .style('top',  (event.pageY - 10) + 'px');
      })
      .on('mousemove', function(event) {
        tip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', () => tip.style('opacity', 0));

    // ── Node groups ───────────────────────────────────────────────────────
    const node = g.selectAll('.node')
      .data(nodes).enter().append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Center node orbit ring
    node.filter(d => d.type === 'center').append('circle')
      .attr('r', d => d.radius + 8)
      .attr('fill', 'none')
      .attr('stroke', '#C74634')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .attr('opacity', 0.5);

    // Main circle
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.type === 'center' ? '#C74634' : platformColor(d.PLATFORM))
      .attr('stroke', d => d.type === 'center' ? '#fff' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', d => d.type === 'center' ? 2.5 : 1)
      .attr('opacity', d => d.hopOpacity);

    // Verified badge (✓)
    const isVerified = d => d.IS_VERIFIED === 'Y' || d.IS_VERIFIED === 1 || d.IS_VERIFIED === true;
    node.filter(d => isVerified(d)).append('text')
      .text('✓')
      .attr('dy', d => -d.radius + 4)
      .attr('dx', d => d.radius - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#2D9F5E')
      .attr('font-size', '9px');

    // Handle label
    node.append('text')
      .text(d => (d.HANDLE || '').replace('@', ''))
      .attr('dy', d => d.radius + 13)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9D9893')
      .attr('font-size', d => d.type === 'center' ? '11px' : '9px')
      .attr('font-weight', d => d.type === 'center' ? 600 : 400)
      .attr('font-family', 'DM Sans, sans-serif')
      .attr('pointer-events', 'none');

    // ── Node hover tooltip ────────────────────────────────────────────────
    node
      .on('mouseover', function(event, d) {
        const pc    = platformColor(d.PLATFORM);
        const score = typeof d.INFLUENCE_SCORE === 'number'
          ? d.INFLUENCE_SCORE.toFixed(1)
          : (d.INFLUENCE_SCORE || '—');
        const eng   = typeof d.ENGAGEMENT_RATE === 'number'
          ? (d.ENGAGEMENT_RATE * 100).toFixed(2) + '%'
          : (d.ENGAGEMENT_RATE || '—');
        tip.html(`
          <div style="font-size:11px;min-width:180px;line-height:1.7">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${pc}"></span>
              <strong>@${d.HANDLE || '?'}</strong>
              ${isVerified(d) ? '<span style="color:#2D9F5E;font-size:10px">✓ verified</span>' : ''}
            </div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px">
              <span style="color:#9D9893">Platform</span><span style="text-transform:capitalize">${d.PLATFORM || '—'}</span>
              <span style="color:#9D9893">Niche</span><span>${d.NICHE || '—'}</span>
              <span style="color:#9D9893">City</span><span>${d.CITY || '—'}</span>
              <span style="color:#9D9893">Followers</span><span>${formatNumber(d.FOLLOWER_COUNT || 0)}</span>
              <span style="color:#9D9893">Links</span><span style="color:#E87B1A;font-weight:600">${d.linkCount || 0}</span>
              <span style="color:#9D9893">Score</span><span>${score}</span>
              <span style="color:#9D9893">Engagement</span><span>${eng}</span>
              <span style="color:#9D9893">Hop</span><span>${d.type === 'center' ? '0 (center)' : d.hopLevel}</span>
            </div>
            <div style="color:#C74634;font-size:10px;margin-top:5px;text-align:center">Click to explore network →</div>
          </div>
        `)
        .style('opacity', 1)
        .style('left', (event.pageX + 14) + 'px')
        .style('top',  (event.pageY - 10) + 'px');

        d3.select(this).select('circle:last-of-type')
          .attr('stroke', '#fff')
          .attr('stroke-width', 2.5);
      })
      .on('mousemove', function(event) {
        tip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        tip.style('opacity', 0);
        d3.select(this).select('circle:last-of-type')
          .attr('stroke', d.type === 'center' ? '#fff' : 'rgba(255,255,255,0.2)')
          .attr('stroke-width', d.type === 'center' ? 2.5 : 1);
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        tip.style('opacity', 0);
        onClickRef.current?.(d);
      });

    // ── Tick ──────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      // Shorten edge at target end so arrow sits at the node boundary
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return d.target.x - (dx / dist) * (d.target.radius + 2);
        })
        .attr('y2', d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return d.target.y - (dy / dist) * (d.target.radius + 2);
        });
      linkHit.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
              .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // ── Auto-center & fit graph after simulation settles ────────────────
    simulation.on('end', () => {
      // Compute bounding box of all nodes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(d => {
        const r = d.radius + 15; // include label space
        if (d.x - r < minX) minX = d.x - r;
        if (d.y - r < minY) minY = d.y - r;
        if (d.x + r > maxX) maxX = d.x + r;
        if (d.y + r + 15 > maxY) maxY = d.y + r + 15;
      });
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (bw <= 0 || bh <= 0) return;

      const padding = 40;
      const scale = Math.min(
        (width - padding * 2) / bw,
        (height - padding * 2) / bh,
        1.5 // don't zoom in too much
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const tx = width / 2 - cx * scale;
      const ty = height / 2 - cy * scale;

      svg.transition().duration(600).call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
    });

    return () => { simulation.stop(); tip.style('opacity', 0); };
  }, [data, depth, width, height]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} width={width} height={height}
        style={{ background: 'rgba(26,24,22,0.5)', borderRadius: 12, border: '1px solid var(--color-border)', display: 'block' }} />
      {/* D3-managed tooltip (not React state — avoids re-render conflicts) */}
      <div ref={tooltipRef} style={{
        position: 'fixed', pointerEvents: 'none', opacity: 0,
        background: 'rgba(26,24,22,0.97)', border: '1px solid rgba(199,70,52,0.35)',
        borderRadius: 8, padding: '8px 12px', zIndex: 9999, color: '#F5F4F2',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)', maxWidth: 260,
        transition: 'opacity 0.1s ease',
      }} />
    </div>
  );
}

// ── NodeDetailPanel ──────────────────────────────────────────────────────────
function NodeDetailPanel({ node, network, onExplore, onClose }) {
  if (!node) return null;

  const score = typeof node.INFLUENCE_SCORE === 'number' ? node.INFLUENCE_SCORE.toFixed(1) : (node.INFLUENCE_SCORE || '—');
  const eng   = typeof node.ENGAGEMENT_RATE === 'number'
    ? (node.ENGAGEMENT_RATE * 100).toFixed(2) + '%'
    : (node.ENGAGEMENT_RATE || '—');

  // Count connections by type for this node
  const connTypes = {};
  (network?.edges || []).forEach(e => {
    const isRelated = e.source === node.INFLUENCER_ID || e.target === node.INFLUENCER_ID
      || e.source?.id === node.INFLUENCER_ID || e.target?.id === node.INFLUENCER_ID;
    if (isRelated) {
      connTypes[e.type] = (connTypes[e.type] || 0) + 1;
    }
  });

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ background: platformColor(node.PLATFORM) + '33', border: `2px solid ${platformColor(node.PLATFORM)}`, color: platformColor(node.PLATFORM) }}>
            {(node.HANDLE || '?').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm flex items-center gap-1">
              @{node.HANDLE}
              {(node.IS_VERIFIED === 'Y' || node.IS_VERIFIED === 1) && (
                <span className="text-green-400 text-xs">✓</span>
              )}
            </p>
            <p className="text-xs text-[var(--color-text-dim)]">{node.DISPLAY_NAME}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Platform + Niche */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`platform-badge platform-${(node.PLATFORM || '').toLowerCase()}`}>{node.PLATFORM}</span>
        {node.NICHE && <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)]">{node.NICHE}</span>}
        {node.CITY && <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center gap-1"><MapPin size={8} />{node.CITY}</span>}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Followers', value: formatNumber(node.FOLLOWER_COUNT || 0), icon: Users },
          { label: 'Score',     value: score,                                   icon: Star },
          { label: 'Engagement', value: eng,                                    icon: TrendingUp },
          { label: 'Hop Level', value: node.type === 'center' ? 'Center' : `Hop ${node.hopLevel}`, icon: Network },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
            <Icon size={12} className="mx-auto mb-1 text-[var(--color-accent)]" />
            <p className="text-sm font-bold">{value}</p>
            <p className="text-[10px] text-[var(--color-text-dim)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Connection types */}
      {Object.keys(connTypes).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Connection Types</p>
          <div className="space-y-1">
            {Object.entries(connTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: CONNECTION_COLORS[type] || '#666' }} />
                  <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                </span>
                <span className="text-[var(--color-text-dim)]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand relationships (from network.brands for center node) */}
      {node.type === 'center' && network?.brands?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Brand Relationships</p>
          <div className="space-y-1">
            {network.brands.slice(0, 5).map(b => (
              <div key={b.LINK_ID} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)]">
                <span className="font-medium truncate">{b.BRAND_NAME}</span>
                <span className="text-[var(--color-text-dim)] text-[10px] ml-2">{b.RELATIONSHIP_TYPE}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explore button */}
      <button
        onClick={() => onExplore(node.INFLUENCER_ID)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
        style={{ background: 'var(--color-accent)', color: '#fff' }}>
        <Network size={13} /> Explore Network
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ── Query Explorer colors ────────────────────────────────────────────────────
const QUERY_COLORS = {
  influence_reach:     { color: '#C74634', icon: Network },
  mutual_connections:  { color: '#D4760A', icon: Users },
  brand_propagation:   { color: '#D4549A', icon: TrendingUp },
  cross_platform:      { color: '#1AADA8', icon: Zap },
  community_hubs:      { color: '#2D9F5E', icon: Star },
};

// ── GraphQueryExplorer ───────────────────────────────────────────────────────
function GraphQueryExplorer() {
  const [queries, setQueries]         = useState([]);
  const [activeQuery, setActiveQuery] = useState(null);
  const [params, setParams]           = useState({});
  const [result, setResult]           = useState(null);
  const [running, setRunning]         = useState(false);
  const [error, setError]             = useState(null);
  const [showSql, setShowSql]         = useState(false);

  // Load available queries on mount
  useEffect(() => {
    api.graph.exampleQueries().then(qs => {
      setQueries(qs);
    }).catch(() => {});
  }, []);

  // Set default params when selecting a query
  const selectQuery = useCallback((q) => {
    setActiveQuery(q);
    setResult(null);
    setError(null);
    setShowSql(false);
    const defaults = {};
    (q.params || []).forEach(p => { defaults[p.key] = p.default || ''; });
    setParams(defaults);
  }, []);

  const runQuery = useCallback(async () => {
    if (!activeQuery) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.graph.runExample(activeQuery.id, params);
      setResult(res);
      setShowSql(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, [activeQuery, params]);

  const resetExplorer = useCallback(() => {
    setActiveQuery(null);
    setResult(null);
    setError(null);
    setShowSql(false);
    setParams({});
  }, []);

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Code2 size={18} className="text-[var(--color-accent)]" />
            Graph Query Explorer
          </h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            Run real SQL/PGQ queries against the <span className="text-yellow-400 font-mono">INFLUENCER_NETWORK</span> property graph
          </p>
        </div>
        {activeQuery && (
          <button onClick={resetExplorer}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            <RotateCcw size={11} /> Back to queries
          </button>
        )}
      </div>

      {/* Query selector cards */}
      {!activeQuery && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {queries.map(q => {
            const qStyle = QUERY_COLORS[q.id] || { color: '#C74634', icon: Network };
            const QIcon = qStyle.icon;
            return (
              <button key={q.id} onClick={() => selectQuery(q)}
                className="text-left p-3.5 rounded-xl border border-[var(--color-border)]/50 hover:border-opacity-100 transition-all group"
                style={{ background: `${qStyle.color}08`, borderColor: `${qStyle.color}30` }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${qStyle.color}22` }}>
                    <QIcon size={16} style={{ color: qStyle.color }} />
                  </div>
                  <span className="text-xs font-bold leading-tight group-hover:text-[var(--color-accent)] transition-colors">
                    {q.name}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">{q.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Active query: params + run */}
      {activeQuery && (
        <div className="space-y-4">
          {/* Query header */}
          <div className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: `${(QUERY_COLORS[activeQuery.id] || {}).color || '#C74634'}10`, border: `1px solid ${(QUERY_COLORS[activeQuery.id] || {}).color || '#C74634'}30` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${(QUERY_COLORS[activeQuery.id] || {}).color || '#C74634'}22` }}>
              {(() => { const QI = (QUERY_COLORS[activeQuery.id] || {}).icon || Network; return <QI size={20} style={{ color: (QUERY_COLORS[activeQuery.id] || {}).color || '#C74634' }} />; })()}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold">{activeQuery.name}</h4>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{activeQuery.description}</p>
            </div>
          </div>

          {/* Parameters */}
          <div className="flex flex-wrap items-end gap-3">
            {(activeQuery.params || []).map(p => (
              <div key={p.key} className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider block mb-1">
                  {p.label}
                </label>
                <input
                  type={p.type === 'number' ? 'number' : 'text'}
                  value={params[p.key] || ''}
                  onChange={e => setParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] font-mono"
                  placeholder={String(p.default)}
                />
              </div>
            ))}
            <button onClick={runQuery} disabled={running}
              className="px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: 'var(--color-accent)', color: '#fff' }}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? 'Running…' : 'Run Query'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Stats bar */}
              <div className="flex items-center gap-4 text-xs text-[var(--color-text-dim)]">
                <span className="flex items-center gap-1">
                  <Table2 size={12} className="text-[var(--color-accent)]" />
                  <strong className="text-[var(--color-text)]">{result.rowCount}</strong> rows returned
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-green-400" />
                  <strong className="text-[var(--color-text)]">{result.elapsed}</strong>ms
                </span>
                <button onClick={() => setShowSql(!showSql)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors ml-auto">
                  <Code2 size={11} /> {showSql ? 'Hide' : 'Show'} SQL
                </button>
              </div>

              {/* SQL display */}
              {showSql && result.sql && (
                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(124,109,240,0.25)' }}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-wider" style={{ background: 'rgba(124,109,240,0.1)' }}>
                    Executed SQL/PGQ
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-green-300/90 overflow-x-auto leading-relaxed whitespace-pre">{result.sql}</pre>
                </div>
              )}

              {/* Results table */}
              {result.rows?.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--color-surface)]">
                          {Object.keys(result.rows[0]).map(col => (
                            <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider whitespace-nowrap border-b border-[var(--color-border)]">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]/50 transition-colors">
                            {Object.entries(row).map(([col, val], j) => (
                              <td key={j} className="px-3 py-2 whitespace-nowrap font-mono">
                                {typeof val === 'number'
                                  ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(3))
                                  : (val ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.rows?.length === 0 && (
                <div className="text-center py-6 text-sm text-[var(--color-text-dim)]">
                  No results found. Try different parameters.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function InfluencerGraph() {
  const { currentUser } = useUser();
  const [selectedId,  setSelectedId]  = useState(null);
  const [depth,       setDepth]       = useState(5);
  const [search,      setSearch]      = useState('');
  const [clickedNode, setClickedNode] = useState(null);

  // Track which user the current influencer list belongs to
  const [listUser, setListUser] = useState(null);

  // Influencer list — refetch when user or search changes (VPD filtering)
  const { data: rawInfluencers, loading } = useData(
    () => api.graph.influencers({ limit: 50, ...(search ? { search } : {}) }),
    [search, currentUser?.USERNAME]
  );

  // When the influencer list loads, stamp which user it belongs to
  useEffect(() => {
    if (rawInfluencers?.length) {
      setListUser(currentUser?.USERNAME);
    }
  }, [rawInfluencers]);

  // When user changes, reset selection immediately
  useEffect(() => {
    setSelectedId(null);
    setClickedNode(null);
  }, [currentUser?.USERNAME]);

  // Auto-select first influencer ONLY when the list is fresh for the current user
  useEffect(() => {
    if (rawInfluencers?.length && !selectedId && listUser === currentUser?.USERNAME) {
      setSelectedId(rawInfluencers[0].INFLUENCER_ID);
    }
  }, [rawInfluencers, selectedId, listUser, currentUser?.USERNAME]);

  // Network for selected influencer
  const { data: network, loading: loadingNet, refetch: refetchNet, setData: setNetwork } = useData(
    () => selectedId ? api.graph.network(selectedId, depth) : Promise.resolve(null),
    [selectedId, depth, currentUser?.USERNAME],
    { autoFetch: false }
  );

  // Refetch network only when we have a valid selection
  useEffect(() => {
    if (selectedId) {
      refetchNet();
    } else {
      setNetwork(null);
    }
  }, [selectedId, depth]);

  // Close detail panel when a new influencer is selected from the list
  const handleSelectId = useCallback((id) => {
    setSelectedId(id);
    setClickedNode(null);
  }, []);

  // Node click from graph
  const handleNodeClick = useCallback((d) => {
    setClickedNode(d);
  }, []);

  const handleExplore = useCallback((id) => {
    setSelectedId(id);
    setClickedNode(null);
  }, []);

  // Stats
  const stats = network?.stats || {};

  return (
    <div className="space-y-6 fade-in">

      {/* Oracle panel */}
      <RegisterOraclePanel title="Influencer Graph">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Oracle's <span className="text-yellow-400 font-mono">Property Graph</span> engine (SQL/PGQ — ISO standard) treats the
              influencer network as a first-class graph object. Edges encode relationships like
              <code className="text-xs text-purple-300 mx-1">follows · collaborates · reshared · inspired_by</code>
              with a numeric <span className="text-yellow-400 font-mono">strength</span> weight.
              Graph traversal finds multi-hop influence chains (up to 5 hops) without any external graph database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="SQL/PGQ (ISO Property Graph)" color="yellow" />
            <FeatureBadge label="GRAPH_TABLE()" color="yellow" />
            <FeatureBadge label="PGQL Traversal" color="orange" />
            <FeatureBadge label="Vertex / Edge Tables" color="purple" />
            <FeatureBadge label="Influence Scoring" color="pink" />
            <FeatureBadge label="CONNECT BY" color="blue" />
            <FeatureBadge label="Brand Attribution" color="green" />
          </div>
          <SqlBlock code={`-- ISO SQL/PGQ: 5-hop influence chain
SELECT reached.influencer_id, reached.handle,
       reached.follower_count, reached.influence_score
FROM GRAPH_TABLE(
  influencer_graph
  MATCH
    (seed IS influencer {handle: :handle})
    -[e IS connection]->{1,5}    -- 1 to 5 hops
    (reached IS influencer)
  COLUMNS (
    reached.influencer_id,
    reached.handle,
    reached.follower_count,
    reached.influence_score
  )
)
ORDER BY influence_score DESC
FETCH FIRST 50 ROWS ONLY;`} />
          <SqlBlock code={`-- Create the property graph over relational tables
CREATE PROPERTY GRAPH influencer_network
  VERTEX TABLES (
    influencers    KEY (influencer_id) LABEL influencer
      PROPERTIES (influencer_id, handle, display_name,
        platform, follower_count, engagement_rate,
        influence_score, niche, city, region, is_verified),
    brands         KEY (brand_id)      LABEL brand
      PROPERTIES (brand_id, brand_name,
        brand_category, social_tier),
    products       KEY (product_id)    LABEL product
      PROPERTIES (product_id, product_name,
        category, unit_price),
    social_posts   KEY (post_id)       LABEL social_post
      PROPERTIES (post_id, platform, posted_at,
        virality_score, momentum_flag)
  )
  EDGE TABLES (
    influencer_connections  KEY (connection_id)
      SOURCE KEY (from_influencer)
        REFERENCES influencers (influencer_id)
      DESTINATION KEY (to_influencer)
        REFERENCES influencers (influencer_id)
      LABEL connects_to
      PROPERTIES (connection_type, strength,
        interaction_count),
    brand_influencer_links  KEY (link_id)
      SOURCE KEY (influencer_id)
        REFERENCES influencers (influencer_id)
      DESTINATION KEY (brand_id)
        REFERENCES brands (brand_id)
      LABEL promotes
      PROPERTIES (relationship_type, post_count,
        avg_engagement, revenue_attributed),
    post_product_mentions   KEY (mention_id)
      SOURCE KEY (post_id)
        REFERENCES social_posts (post_id)
      DESTINATION KEY (product_id)
        REFERENCES products (product_id)
      LABEL mentions_product
      PROPERTIES (confidence_score, mention_type)
  );`} />
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <DiagramBox label="influencers" sub="Vertex table" color="#C74634" />
            <DiagramBox label="influencer_connections" sub="Edge table" color="#D4760A" />
            <DiagramBox label="brand_influencer_links" sub="Brand edges" color="#D4549A" />
            <DiagramBox label="post_product_mentions" sub="Attribution" color="#2D9F5E" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Edge Types</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(CONNECTION_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, flexShrink: 0 }} />
                  <span className="capitalize text-[var(--color-text-dim)]">{type.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Oracle <span className="text-green-400 font-mono">DBMS_RLS</span> policies transparently filter graph data based on the logged-in user's role and region.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="text-yellow-400"> You are viewing only <strong>{currentUser.REGION}</strong> region data.</span>
              ) : currentUser?.ROLE === 'admin' || currentUser?.ROLE === 'analyst' ? (
                <span className="text-green-400"> You have full access to all regions.</span>
              ) : (
                <span className="text-blue-400"> You have full read access.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS" color="green" />
            <FeatureBadge label="Row-Level Security" color="green" />
            <FeatureBadge label="Region Filtering" color="blue" />
          </div>
          <SqlBlock code={`-- VPD policy function (applied to 5 graph tables)
CREATE FUNCTION vpd_graph_influencers(
  p_schema VARCHAR2, p_table VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30) := sc_security_ctx.get_role();
  v_region VARCHAR2(100):= sc_security_ctx.get_region();
BEGIN
  IF v_role IN ('admin','analyst') THEN
    RETURN NULL;        -- full access
  END IF;
  IF v_role = 'fulfillment_mgr'
     AND v_region IS NOT NULL THEN
    RETURN 'region = ''' || v_region || '''';
  END IF;
  RETURN NULL;          -- everyone else: full access
END;

-- Applied via DBMS_RLS.ADD_POLICY to:
--   influencers, social_posts,
--   influencer_connections,
--   brand_influencer_links,
--   post_product_mentions`} />
        </div>
      </RegisterOraclePanel>

      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Network className="text-[var(--color-accent)]" /> Influencer Network Graph
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Explore influencer connections via <span className="text-yellow-400">Oracle Property Graph (SQL/PGQ)</span> — hover vertices/edges for details, click to explore
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* ── Left column: list + controls ─────────────────────────────── */}
        <div className="space-y-3">

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search handle, niche…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Depth toggle */}
          <div className="glass-card p-3">
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Graph Depth (Hops)</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDepth(d)}
                  className="flex-1 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{
                    background: depth === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                    color:      depth === d ? '#fff'                 : 'var(--color-text-dim)',
                    border:     `1px solid ${depth === d ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}>
                  {d} Hop{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Influencer list */}
          <div className="glass-card p-3 max-h-[480px] overflow-y-auto">
            <h3 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={11} /> Influencers {rawInfluencers?.length ? `(${rawInfluencers.length})` : ''}
            </h3>
            {loading ? (
              <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">Loading…</p>
            ) : (rawInfluencers || []).map(inf => (
              <button key={inf.INFLUENCER_ID}
                onClick={() => handleSelectId(inf.INFLUENCER_ID)}
                className={`w-full text-left p-2 rounded-lg transition-colors text-xs mb-1 ${
                  selectedId === inf.INFLUENCER_ID
                    ? 'bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40'
                    : 'hover:bg-[var(--color-surface-hover)] border border-transparent'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{inf.HANDLE}</span>
                  <span className={`platform-badge platform-${(inf.PLATFORM || '').toLowerCase()} !text-[9px] !py-0`}>{inf.PLATFORM}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                  <span>{formatNumber(inf.FOLLOWER_COUNT)}</span>
                  <span className="text-[var(--color-accent)]">★ {inf.INFLUENCE_SCORE}</span>
                  {inf.CONNECTION_COUNT > 0 && <span>{inf.CONNECTION_COUNT} links</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Node detail panel */}
          {clickedNode && (
            <NodeDetailPanel
              node={clickedNode}
              network={network}
              onExplore={handleExplore}
              onClose={() => setClickedNode(null)}
            />
          )}
        </div>

        {/* ── Right column: graph + stats ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">

          {/* Selected influencer metrics + stats bar */}
          {network && (
            <div className="glass-card p-3">
              {network.center && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: 'rgba(199,70,52,0.2)', border: '2px solid #C74634', color: '#C74634' }}>
                    {(network.center.HANDLE || '?').replace('@','').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      {network.center.HANDLE}
                      {(network.center.IS_VERIFIED === 'Y' || network.center.IS_VERIFIED === 1) && (
                        <span className="text-green-400 text-xs">✓</span>
                      )}
                      <span className={`platform-badge platform-${(network.center.PLATFORM || '').toLowerCase()} !text-[9px] !py-0 ml-1`}>{network.center.PLATFORM}</span>
                      {network.center.NICHE && <span className="text-[10px] text-[var(--color-text-dim)] font-normal ml-1">{network.center.NICHE}</span>}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-dim)]">Center node — highest influence score in network</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: 'Followers',   value: formatNumber(network.center?.FOLLOWER_COUNT || 0) },
                  { label: 'Score',       value: network.center?.INFLUENCE_SCORE || 0 },
                  { label: 'Engagement',  value: network.center?.ENGAGEMENT_RATE ? `${(network.center.ENGAGEMENT_RATE * 100).toFixed(1)}%` : '—' },
                  { label: 'Connections', value: network.center?.TOTAL_CONNECTIONS || 0 },
                  { label: 'Nodes',       value: stats.nodeCount  || network.nodes?.length  || 0 },
                  { label: 'Edges',       value: stats.edgeCount  || network.edges?.length  || 0 },
                  { label: 'Depth',       value: `${stats.depth || depth} hop${(stats.depth || depth) > 1 ? 's' : ''}` },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <p className="text-sm font-bold">{s.value}</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graph or placeholder */}
          {loadingNet ? (
            <div className="glass-card p-14 text-center text-[var(--color-text-dim)]">
              <Network size={28} className="mx-auto mb-3 opacity-40" />
              Loading network…
            </div>
          ) : network ? (
            <ForceGraph
              data={network}
              depth={depth}
              height={520}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <div className="glass-card p-14 text-center text-[var(--color-text-dim)]">
              <Network size={28} className="mx-auto mb-3 opacity-40" />
              Select an influencer to explore their network
            </div>
          )}

          {/* Edge type legend */}
          {network && (
            <div className="glass-card p-3 flex flex-wrap gap-x-4 gap-y-1.5">
              <p className="w-full text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-1">Edge Types</p>
              {Object.entries(CONNECTION_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]">
                  <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: color }} />
                  <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Brand relationships */}
          {network?.brands?.length > 0 && !clickedNode && (
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                Brand Relationships — {network.center?.HANDLE}
              </h4>
              <div className="flex flex-wrap gap-2">
                {network.brands.map(b => (
                  <div key={b.LINK_ID} className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="font-medium">{b.BRAND_NAME}</span>
                    <span className="text-[var(--color-text-dim)] ml-1.5">({b.RELATIONSHIP_TYPE})</span>
                    {b.REVENUE_ATTRIBUTED > 0 && (
                      <span className="text-green-400 ml-1.5 text-[10px]">
                        ${formatNumber(b.REVENUE_ATTRIBUTED)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Graph Query Explorer ── */}
      <GraphQueryExplorer />
    </div>
  );
}
