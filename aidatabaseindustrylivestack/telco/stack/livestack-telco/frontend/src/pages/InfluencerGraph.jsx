import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Network, Users, Star, Search, X, TrendingUp, MapPin, Zap, ChevronRight, Play, Loader2, Code2, Table2, Clock, RotateCcw } from 'lucide-react';
import * as d3 from 'd3';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/TelcoStory';

// ── Relationship type colors ──────────────────────────────────────────────────
const CONNECTION_COLORS = {
  subscribes_to: '#312D2A',
  served_by: '#437C94',
  reports_signal: '#AA643B',
  shares_site: '#796087',
  impacted_by: '#C74634',
  assigned_crew: '#4C825C',
  escalates_case: '#A36472',
  uses_device: '#5F7D4F',
  enterprise_contact: '#4F7D7B',
  capacity_dependency: '#AA643B',
  same_region: '#437C94',
  service_path: '#4F7D7B',
  churn_risk_link: '#C74634',
};

// ── Entity type colors (Redwood) ─────────────────────────────────────────────
const PLATFORM_COLORS = {
  subscriber: '#A36472',
  enterprise_account: '#437C94',
  service_line: '#4F7D7B',
  network_site: '#C74634',
  outage_event: '#AA643B',
  support_case: '#796087',
  device: '#4C825C',
  field_crew: '#5F7D4F',
  account_advocate: '#A36472',
  capacity_pool: '#437C94',
  case_anchor: '#312D2A',
  instagram: '#A36472',
  tiktok: '#4F7D7B',
  youtube: '#C74634',
  twitter: '#437C94',
  threads: '#796087',
};

function platformColor(p) {
  return PLATFORM_COLORS[(p || '').toLowerCase()] || '#C74634';
}

function toTitleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^5g$/i.test(part)) return '5G';
      if (/^iot$/i.test(part)) return 'IoT';
      if (/^wifi$/i.test(part)) return 'Wi-Fi';
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatEntityTypeLabel(type) {
  const labels = {
    subscriber: 'Subscriber Segment',
    enterprise_account: 'Enterprise Account',
    service_line: 'Service Line',
    network_site: 'Network Site',
    outage_event: 'Outage Event',
    support_case: 'Support Case',
    device: 'Device',
    field_crew: 'Field Crew',
    account_advocate: 'Signal Owner',
    capacity_pool: 'Capacity Pool',
    case_anchor: 'Case Anchor',
  };
  return labels[(type || '').toLowerCase()] || toTitleCase(type);
}

function formatRelationshipLabel(type) {
  const labels = {
    subscribes_to: 'Subscribes to service',
    served_by: 'Served by site',
    reports_signal: 'Reports signal',
    shares_site: 'Shares network site',
    impacted_by: 'Impacted by event',
    assigned_crew: 'Assigned field crew',
    escalates_case: 'Escalates case',
    uses_device: 'Uses device',
    enterprise_contact: 'Enterprise contact',
    capacity_dependency: 'Capacity dependency',
    same_region: 'Same region',
    service_path: 'Service path',
    churn_risk_link: 'Churn risk link',
  };
  return labels[(type || '').toLowerCase()] || toTitleCase(type);
}

function formatEntityLabel(entity) {
  return entity?.DISPLAY_NAME || entity?.HANDLE || 'Unknown entity';
}

function getAffectedSubscribers(entity) {
  return entity?.AFFECTED_SUBSCRIBERS ?? entity?.FOLLOWER_COUNT ?? 0;
}

function getImpactRisk(entity) {
  return entity?.IMPACT_RISK ?? entity?.INFLUENCE_SCORE ?? 0;
}

function getExperienceScore(entity) {
  if (entity?.EXPERIENCE_SCORE !== undefined && entity?.EXPERIENCE_SCORE !== null) {
    return Number(entity.EXPERIENCE_SCORE);
  }
  if (entity?.ENGAGEMENT_RATE !== undefined && entity?.ENGAGEMENT_RATE !== null) {
    return Number(entity.ENGAGEMENT_RATE) * 100;
  }
  return null;
}

function formatImpactRisk(entity) {
  const risk = getImpactRisk(entity);
  return typeof risk === 'number' && Number.isFinite(risk) ? risk.toFixed(1) : (risk || '-');
}

function formatExperienceScore(entity) {
  const score = getExperienceScore(entity);
  return typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : '-';
}

function formatGraphNodeLabel(entity) {
  const label = formatEntityLabel(entity);
  return label.length > 30 ? `${label.slice(0, 27)}...` : label;
}

function entityInitials(entity) {
  return formatEntityLabel(entity)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
}

const GRAPH_CANVAS_BACKGROUND = 'var(--color-surface)';
const GRAPH_NODE_STROKE = 'rgba(49,45,42,0.24)';
const GRAPH_NODE_HOVER_STROKE = '#312D2A';
const GRAPH_CENTER_STROKE = '#FFFFFF';
const GRAPH_LABEL_COLOR = '#161513';
const GRAPH_LABEL_HALO = '#FFFFFF';
const GRAPH_LINK_MIN_OPACITY = 0.2;
const GRAPH_LINK_MAX_OPACITY = 0.52;

function buildNetworkEvidence(entity) {
  const label = formatEntityLabel(entity).toLowerCase();
  const entityKey = String(entity?.ENTITY_KEY || entity?.HANDLE || '').toUpperCase();
  const type = String(entity?.PLATFORM || entity?.NICHE || '').toLowerCase();
  const impactRisk = Number(getImpactRisk(entity) || 0);
  const affected = getAffectedSubscribers(entity);

  if (entityKey.includes('OUT-EVENT-501') || label.includes('game-day 5g congestion')) {
    return [
      { label: 'Cells / sectors', value: 'NY-MID-5G-18A / 18C' },
      { label: 'PRB utilization', value: '94%' },
      { label: 'RRC setup failures', value: '7.8%' },
      { label: 'Handover failures', value: '3.4%' },
      { label: 'Throughput', value: '18 Mbps median downlink' },
      { label: 'Latency / packet loss', value: '86 ms / 1.9%' },
      { label: 'Backhaul', value: '82% saturated' },
      { label: 'Restoration', value: 'Capacity reroute in progress' },
    ];
  }

  if (type === 'network_site') {
    return [
      { label: 'Site / sector health', value: impactRisk >= 85 ? 'Major degradation' : 'Watchlist' },
      { label: 'PRB utilization', value: `${Math.min(96, Math.max(63, Math.round(impactRisk)))}%` },
      { label: 'Affected subscribers', value: formatNumber(affected) },
      { label: 'Restoration', value: impactRisk >= 85 ? 'Field crew assigned' : 'Monitoring' },
    ];
  }

  if (type === 'outage_event' || type === 'support_case') {
    return [
      { label: 'Incident state', value: impactRisk >= 90 ? 'Major incident active' : 'Triage active' },
      { label: 'Ticket aging', value: impactRisk >= 90 ? 'SLA breach risk' : 'Within SLA watch' },
      { label: 'Affected subscribers', value: formatNumber(affected) },
      { label: 'Escalation path', value: 'NOC -> field operations -> care' },
    ];
  }

  if (type === 'field_crew') {
    return [
      { label: 'Crew skill', value: 'RAN / fiber repair' },
      { label: 'Dispatch SLA', value: '2 hr target' },
      { label: 'Site access', value: 'Approved' },
      { label: 'Repair status', value: 'Work order assigned' },
    ];
  }

  return [
    { label: 'Impact status', value: impactRisk >= 80 ? 'Customer-impacting' : 'Operational watch' },
    { label: 'Affected subscribers', value: formatNumber(affected) },
    { label: 'Suspected domain', value: type.includes('service') ? 'Service line' : 'Service assurance' },
    { label: 'Case linkage', value: 'Correlated graph evidence' },
  ];
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
        // Scale radius by number of connections: more links -> larger vertex
        radius: d.type === 'center'
          ? Math.max(22, 18 + (lc / maxLinks) * 14)
          : Math.max(6, 6 + (lc / maxLinks) * 16),
        hopOpacity: d.type === 'center' ? 1.0
          : d.hopLevel === 1 ? 0.96
          : d.hopLevel === 2 ? 0.86
          : 0.72,
      };
      nodeMap.set(n.id, n);
      return n;
    });

    const links = data.edges.map(d => ({
      ...d,
      source:   d.source,
      target:   d.target,
      color:    CONNECTION_COLORS[d.type] || '#312D2A',
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
          .attr('opacity', 0.72);
    });

    // ── Edge visible lines ────────────────────────────────────────────────
    const link = g.selectAll('.link')
      .data(links).enter().append('line')
      .attr('class', 'link')
      .attr('stroke', d => d.color)
      .attr('stroke-opacity', d => Math.max(GRAPH_LINK_MIN_OPACITY, Math.min(GRAPH_LINK_MAX_OPACITY, d.strength * 0.5)))
      .attr('stroke-width', d => Math.max(1, d.strength * 1.9))
      .attr('marker-end', d => `url(#arrow-${d.color.replace('#', '')})`);

    // ── Edge invisible hit-area lines (for hover) ─────────────────────────
    const linkHit = g.selectAll('.link-hit')
      .data(links).enter().append('line')
      .attr('class', 'link-hit')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .style('cursor', 'default')
      .on('mouseover', function(event, d) {
        const typeLabel = formatRelationshipLabel(d.type || 'unknown');
        const color     = CONNECTION_COLORS[d.type] || '#6F757E';
        tip.html(`
          <div style="font-size:11px;line-height:1.65;color:#161513">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
              <strong style="color:#161513">${typeLabel}</strong>
            </div>
            <div>Strength: <strong>${Math.round((d.strength || 0) * 100)}%</strong></div>
            <div>Events: <strong>${formatNumber(d.eventCount || d.interactions || 0)}</strong></div>
            <div>Affected subscribers: <strong>${formatNumber(d.affectedSubscribers || d.affectedCount || 0)}</strong></div>
            <div style="color:#6F757E;font-size:10px;margin-top:2px">Radius step ${d.hopLevel}</div>
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
      .attr('stroke-width', 1.25)
      .attr('stroke-dasharray', '5 4')
      .attr('opacity', 0.38);

    // Main circle
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.type === 'center' ? '#C74634' : platformColor(d.PLATFORM))
      .attr('stroke', d => d.type === 'center' ? GRAPH_CENTER_STROKE : GRAPH_NODE_STROKE)
      .attr('stroke-width', d => d.type === 'center' ? 2.5 : 1.4)
      .attr('opacity', d => d.hopOpacity);

    // Compact visual flag for high-impact nodes.
    const isHighRisk = d => d.IS_VERIFIED === 'Y' || d.IS_VERIFIED === 1 || d.IS_VERIFIED === true || getImpactRisk(d) >= 90;
    node.filter(d => isHighRisk(d)).append('text')
      .text('!')
      .attr('dy', d => -d.radius + 4)
      .attr('dx', d => d.radius - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4C825C')
      .attr('font-size', '9px');

    // Entity label
    node.append('text')
      .text(d => formatGraphNodeLabel(d))
      .attr('dy', d => d.radius + 13)
      .attr('text-anchor', 'middle')
      .attr('fill', GRAPH_LABEL_COLOR)
      .attr('stroke', GRAPH_LABEL_HALO)
      .attr('stroke-width', d => d.type === 'center' ? 3.5 : 3)
      .attr('stroke-linejoin', 'round')
      .attr('paint-order', 'stroke fill')
      .attr('font-size', d => d.type === 'center' ? '12px' : '9.5px')
      .attr('font-weight', d => d.type === 'center' ? 700 : 600)
      .attr('font-family', '"Oracle Sans", "Oracle Sans VF", sans-serif')
      .attr('pointer-events', 'none');

    // ── Node hover tooltip ────────────────────────────────────────────────
    node
      .on('mouseover', function(event, d) {
        const pc    = platformColor(d.PLATFORM);
        const score = formatImpactRisk(d);
        const eng   = formatExperienceScore(d);
        tip.html(`
          <div style="font-size:11px;min-width:180px;line-height:1.7;color:#161513">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;border-bottom:1px solid rgba(49,45,42,0.12);padding-bottom:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${pc}"></span>
              <strong style="color:#161513">${formatEntityLabel(d)}</strong>
              ${isHighRisk(d) ? '<span style="color:#C74634;font-size:10px;font-weight:600">high impact</span>' : ''}
            </div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px">
              <span style="color:#6F757E">Entity Type</span><span>${formatEntityTypeLabel(d.PLATFORM)}</span>
              <span style="color:#6F757E">Entity Key</span><span>${d.ENTITY_KEY || d.HANDLE || '-'}</span>
              <span style="color:#6F757E">Region</span><span>${d.REGION || '-'}</span>
              <span style="color:#6F757E">City</span><span>${d.CITY || '-'}</span>
              <span style="color:#6F757E">Affected Subscribers</span><span>${formatNumber(getAffectedSubscribers(d))}</span>
              <span style="color:#6F757E">Linked Entities</span><span style="color:#161513;font-weight:600">${d.linkCount || 0}</span>
              <span style="color:#6F757E">Impact Risk</span><span>${score}</span>
              <span style="color:#6F757E">Experience Score</span><span>${eng}</span>
              <span style="color:#6F757E">Radius</span><span>${d.type === 'center' ? '0 (center)' : d.hopLevel}</span>
            </div>
            <div style="color:#C74634;font-size:10px;font-weight:600;margin-top:6px;text-align:center">Click to explore impact network -></div>
          </div>
        `)
        .style('opacity', 1)
        .style('left', (event.pageX + 14) + 'px')
        .style('top',  (event.pageY - 10) + 'px');

        d3.select(this).select('circle:last-of-type')
          .attr('stroke', d.type === 'center' ? GRAPH_CENTER_STROKE : GRAPH_NODE_HOVER_STROKE)
          .attr('stroke-width', d.type === 'center' ? 2.5 : 2);
      })
      .on('mousemove', function(event) {
        tip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        tip.style('opacity', 0);
        d3.select(this).select('circle:last-of-type')
          .attr('stroke', d.type === 'center' ? GRAPH_CENTER_STROKE : GRAPH_NODE_STROKE)
          .attr('stroke-width', d.type === 'center' ? 2.5 : 1.4);
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
        style={{ background: GRAPH_CANVAS_BACKGROUND, borderRadius: 4, border: '1px solid var(--color-border)', display: 'block' }} />
      {/* D3-managed tooltip (not React state - avoids re-render conflicts) */}
      <div ref={tooltipRef} style={{
        position: 'fixed', pointerEvents: 'none', opacity: 0,
        background: 'var(--color-surface)', border: '1px solid rgba(49,45,42,0.14)',
        borderRadius: 8, padding: '8px 12px', zIndex: 9999, color: '#161513',
        boxShadow: '0 8px 24px rgba(49,45,42,0.18)', maxWidth: 260,
        transition: 'opacity 0.1s ease',
      }} />
    </div>
  );
}

// ── NodeDetailPanel ──────────────────────────────────────────────────────────
function NodeDetailPanel({ node, network, onExplore, onClose }) {
  if (!node) return null;

  const score = formatImpactRisk(node);
  const eng   = formatExperienceScore(node);
  const networkEvidence = buildNetworkEvidence(node);

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
            {entityInitials(node)}
          </div>
          <div>
            <p className="font-semibold text-sm flex items-center gap-1">
              {formatEntityLabel(node)}
              {(node.IS_VERIFIED === 'Y' || node.IS_VERIFIED === 1 || getImpactRisk(node) >= 90) && (
                <span className="tone-red text-xs">High impact</span>
              )}
            </p>
            <p className="text-xs text-[var(--color-text-dim)]">{formatEntityTypeLabel(node.PLATFORM)}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Entity + Entity Type */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`platform-badge platform-${(node.PLATFORM || '').toLowerCase()}`}>{formatEntityTypeLabel(node.PLATFORM)}</span>
        {node.NICHE && node.NICHE !== node.PLATFORM && <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">{formatEntityTypeLabel(node.NICHE)}</span>}
        {node.CITY && <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-surface-muted)] border border-[var(--color-border)] flex items-center gap-1"><MapPin size={8} />{node.CITY}</span>}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Affected Subscribers', value: formatNumber(getAffectedSubscribers(node)), icon: Users },
          { label: 'Impact Risk',          value: score,                                   icon: Star },
          { label: 'Experience Score',     value: eng,                                     icon: TrendingUp },
          { label: 'Impact Radius',        value: node.type === 'center' ? 'Center' : `Step ${node.hopLevel}`, icon: Network },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg p-2.5 text-center" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
            <Icon size={12} className="mx-auto mb-1 text-[var(--color-accent)]" />
            <p className="text-sm font-bold">{value}</p>
            <p className="text-[10px] text-[var(--color-text-dim)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Network evidence */}
      {networkEvidence.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Network Evidence</p>
          <div className="grid grid-cols-2 gap-2">
            {networkEvidence.map(item => (
              <div key={item.label} className="rounded-lg p-2.5" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-dim)]">{item.label}</p>
                <p className="text-[11px] font-semibold text-[var(--color-text)] mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationship types */}
      {Object.keys(connTypes).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Impact Relationships</p>
          <div className="space-y-1">
            {Object.entries(connTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: CONNECTION_COLORS[type] || '#6F757E' }} />
                  <span>{formatRelationshipLabel(type)}</span>
                </span>
                <span className="text-[var(--color-text-dim)]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Experience case relationships (from network.brands compatibility array for center node) */}
      {node.type === 'center' && network?.brands?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Related Experience Cases</p>
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
        <Network size={13} /> Explore Impact Network
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ── Query Explorer colors ────────────────────────────────────────────────────
const QUERY_COLORS = {
  impact_reach: { color: '#C74634', icon: Network },
  case_entities: { color: '#AA643B', icon: Users },
  capacity_dependencies: { color: '#4F7D7B', icon: Zap },
  incident_response_chain: { color: '#796087', icon: Search },
  subscriber_service_path: { color: '#437C94', icon: TrendingUp },
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
            SQL/PGQ Impact Query Explorer
          </h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            Run real SQL/PGQ queries against the <span className="tone-sienna font-mono">TELECOM_EXPERIENCE_NETWORK</span> property graph
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
              {running ? 'Running...' : 'Run Query'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg text-sm tone-red" style={{ background: 'rgba(199,70,52,0.1)', border: '1px solid rgba(199,70,52,0.3)' }}>
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
                  <Clock size={12} className="tone-pine" />
                  <strong className="text-[var(--color-text)]">{result.elapsed}</strong>ms
                </span>
                <button onClick={() => setShowSql(!showSql)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors ml-auto">
                  <Code2 size={11} /> {showSql ? 'Hide' : 'Show'} SQL
                </button>
              </div>

              {/* SQL display */}
              {showSql && result.sql && (
                <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                    Executed SQL/PGQ
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed whitespace-pre">{result.sql}</pre>
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
                                  : (val ?? '-')}
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
export default function EntityGraph() {
  const { currentUser } = useUser();
  const [selectedId,  setSelectedId]  = useState(null);
  const [depth,       setDepth]       = useState(5);
  const [search,      setSearch]      = useState('');
  const [clickedNode, setClickedNode] = useState(null);

  // Track which user the current entity list belongs to
  const [listUser, setListUser] = useState(null);

  // Entity list - refetch when user or search changes (VPD filtering)
  const { data: rawEntities, loading } = useData(
    () => api.graph.influencers({ limit: 50, ...(search ? { search } : {}) }),
    [search, currentUser?.USERNAME]
  );

  // When the entity list loads, stamp which user it belongs to
  useEffect(() => {
    if (rawEntities?.length) {
      setListUser(currentUser?.USERNAME);
    }
  }, [rawEntities]);

  // When user changes, reset selection immediately
  useEffect(() => {
    setSelectedId(null);
    setClickedNode(null);
  }, [currentUser?.USERNAME]);

  // Auto-select first entity ONLY when the list is fresh for the current user
  useEffect(() => {
    if (rawEntities?.length && !selectedId && listUser === currentUser?.USERNAME) {
      setSelectedId(rawEntities[0].INFLUENCER_ID);
    }
  }, [rawEntities, selectedId, listUser, currentUser?.USERNAME]);

  // Network for selected entity
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

  // Close detail panel when a new entity is selected from the list
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
      <RegisterOraclePanel title="Subscriber and Network Impact Graph">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Oracle's <span className="tone-sienna font-mono">Property Graph</span> engine (SQL/PGQ - ISO standard) treats the
              Seer Comms mobile subscriber and network impact graph as a first-class graph object. Edges encode relationships like
              <code className="text-xs tone-plum mx-1">served_by · impacted_by · assigned_crew · capacity_dependency</code>
              with a numeric <span className="tone-sienna font-mono">strength</span> weight.
              Graph traversal finds multi-step mobile subscriber impact chains across accounts, services, sites, cases, and crews without any external graph database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="SQL/PGQ (ISO Property Graph)" color="yellow" />
            <FeatureBadge label="GRAPH_TABLE()" color="yellow" />
            <FeatureBadge label="PGQL Traversal" color="orange" />
            <FeatureBadge label="Vertex / Edge Tables" color="purple" />
            <FeatureBadge label="Impact Scoring" color="pink" />
            <FeatureBadge label="CONNECT BY" color="blue" />
            <FeatureBadge label="Case Attribution" color="green" />
          </div>
          <SqlBlock code={`-- ISO SQL/PGQ: 5-hop subscriber impact path
SELECT reached.entity_key, reached.display_name,
       reached.entity_type, reached.risk_score, reached.affected_count
FROM GRAPH_TABLE(
  telecom_experience_network
  MATCH
    (seed IS entity) -[e IS related_to]->{1,5} (reached IS entity)
  WHERE seed.entity_key = :entity_key
  COLUMNS (
    reached.entity_key,
    reached.display_name,
    reached.entity_type,
    reached.risk_score,
    reached.affected_count
  )
)
ORDER BY risk_score DESC
FETCH FIRST 50 ROWS ONLY;`} />
          <SqlBlock code={`-- Create the property graph over relational tables
CREATE PROPERTY GRAPH telecom_experience_network
  VERTEX TABLES (
    telecom_graph_entities KEY (entity_id) LABEL entity
      PROPERTIES (entity_key, display_name, entity_type,
        region, city, risk_score, experience_score,
        affected_count, signal_count, service_value),
    telecom_experience_cases KEY (case_id) LABEL experience_case
      PROPERTIES (case_ref, case_type, case_status,
        priority, risk_score, subscribers_affected,
        service_value_at_risk)
  )
  EDGE TABLES (
    telecom_graph_relationships KEY (relationship_id)
      SOURCE KEY (from_entity)
        REFERENCES telecom_graph_entities (entity_id)
      DESTINATION KEY (to_entity)
        REFERENCES telecom_graph_entities (entity_id)
      LABEL related_to
      PROPERTIES (relationship_type, strength,
        event_count, affected_count),
    telecom_case_entities KEY (case_entity_id)
      SOURCE KEY (case_id)
        REFERENCES telecom_experience_cases (case_id)
      DESTINATION KEY (entity_id)
        REFERENCES telecom_graph_entities (entity_id)
      LABEL case_involves
      PROPERTIES (role_in_case, confidence)
  );`} />
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <DiagramBox label="telecom_graph_entities" sub="Vertex table" color="#C74634" />
            <DiagramBox label="telecom_graph_relationships" sub="Edge table" color="#AA643B" />
            <DiagramBox label="telecom_case_entities" sub="Case links" color="#A36472" />
            <DiagramBox label="post_product_mentions" sub="Attribution" color="#4C825C" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Impact Relationships</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(CONNECTION_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, flexShrink: 0 }} />
                  <span className="text-[var(--color-text-dim)]">{formatRelationshipLabel(type)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Oracle <span className="tone-pine font-mono">DBMS_RLS</span> policies transparently filter graph data based on the logged-in user's role and region.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="tone-sienna"> You are viewing only <strong>{currentUser.REGION}</strong> region data.</span>
              ) : currentUser?.ROLE === 'admin' || currentUser?.ROLE === 'analyst' ? (
                <span className="tone-pine"> You have full access to all regions.</span>
              ) : (
                <span className="tone-ocean"> You have full read access.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS" color="green" />
            <FeatureBadge label="Row-Level Security" color="green" />
            <FeatureBadge label="Region Filtering" color="blue" />
          </div>
          <SqlBlock code={`-- VPD policy function (applied to 5 graph tables)
CREATE FUNCTION vpd_graph_entities(
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
--   telecom graph views, baseline signal tables, and
--   region-filtered network operations records`} />
        </div>
      </RegisterOraclePanel>

      <SceneStoryPanel scene="graph" />

      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Network className="text-[var(--color-accent)]" /> Subscriber and Network Impact Graph
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Trace how a 5G mobile service issue connects subscribers, accounts, service lines, network sites, care cases, field crews, and revenue exposure.
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
              placeholder="Search subscriber, service, case, site, or region..."
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
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Impact Radius</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDepth(d)}
                  className="flex-1 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{
                    background: depth === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                    color:      depth === d ? '#fff'                 : 'var(--color-text-dim)',
                    border:     `1px solid ${depth === d ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}>
                  {d} Step{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Entity list */}
          <div className="glass-card p-3 max-h-[480px] overflow-y-auto">
            <h3 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={11} /> Impact Entities {rawEntities?.length ? `(${rawEntities.length})` : ''}
            </h3>
            {loading ? (
              <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">Loading...</p>
            ) : (rawEntities || []).map(inf => (
              <button key={inf.INFLUENCER_ID}
                onClick={() => handleSelectId(inf.INFLUENCER_ID)}
                className={`w-full text-left p-2 rounded-lg transition-colors text-xs mb-1 ${
                  selectedId === inf.INFLUENCER_ID
                    ? 'bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40'
                    : 'hover:bg-[var(--color-surface-hover)] border border-transparent'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{formatEntityLabel(inf)}</span>
                  <span className={`platform-badge platform-${(inf.PLATFORM || '').toLowerCase()} !text-[9px] !py-0`}>{formatEntityTypeLabel(inf.PLATFORM)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                  <span>{formatNumber(getAffectedSubscribers(inf))} affected subscribers</span>
                  <span className="text-[var(--color-accent)]">Impact risk {formatImpactRisk(inf)}</span>
                  {inf.CONNECTION_COUNT > 0 && <span>{inf.CONNECTION_COUNT} linked</span>}
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

          {/* Selected entity metrics + stats bar */}
          {network && (
            <div className="glass-card p-3">
              {network.center && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: '#C74634', border: '2px solid #C74634', color: '#FFFFFF' }}>
                    {entityInitials(network.center)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      {formatEntityLabel(network.center)}
                      {(network.center.IS_VERIFIED === 'Y' || network.center.IS_VERIFIED === 1 || getImpactRisk(network.center) >= 90) && (
                        <span className="tone-red text-xs">High impact</span>
                      )}
                      <span className={`platform-badge platform-${(network.center.PLATFORM || '').toLowerCase()} !text-[9px] !py-0 ml-1`}>{formatEntityTypeLabel(network.center.PLATFORM)}</span>
                      {network.center.NICHE && network.center.NICHE !== network.center.PLATFORM && <span className="text-[10px] text-[var(--color-text-dim)] font-normal ml-1">{formatEntityTypeLabel(network.center.NICHE)}</span>}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-dim)]">Selected impact entity - highest impact score in this network</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: 'Affected Subscribers', value: formatNumber(getAffectedSubscribers(network.center)) },
                  { label: 'Impact Risk',          value: formatImpactRisk(network.center) },
                  { label: 'Experience Score',     value: formatExperienceScore(network.center) },
                  { label: 'Linked Entities',      value: network.center?.TOTAL_CONNECTIONS || 0 },
                  { label: 'Entities',             value: stats.nodeCount  || network.nodes?.length  || 0 },
                  { label: 'Relationships',        value: stats.edgeCount  || network.edges?.length  || 0 },
                  { label: 'Impact Radius',        value: `${stats.depth || depth} step${(stats.depth || depth) > 1 ? 's' : ''}` },
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
              Loading network...
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
              Select a Seer Comms subscriber, service, case, site, or region to explore the impact network
            </div>
          )}

          {/* Edge type legend */}
          {network && (
            <div className="glass-card p-3 flex flex-wrap gap-x-4 gap-y-1.5">
              <p className="w-full text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-1">Impact Relationships</p>
              {Object.entries(CONNECTION_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]">
                  <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: color }} />
                  <span>{formatRelationshipLabel(type)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Experience case relationships */}
          {network?.brands?.length > 0 && !clickedNode && (
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                Related Mobile Experience Cases - {formatEntityLabel(network.center)}
              </h4>
              <div className="flex flex-wrap gap-2">
                {network.brands.map(b => (
                  <div key={b.LINK_ID} className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="font-medium">{b.BRAND_NAME}</span>
                    <span className="text-[var(--color-text-dim)] ml-1.5">({b.RELATIONSHIP_TYPE})</span>
                    {b.REVENUE_ATTRIBUTED > 0 && (
                      <span className="tone-pine ml-1.5 text-[10px]">
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

      {/* ── SQL/PGQ Impact Query Explorer ── */}
      <GraphQueryExplorer />
    </div>
  );
}
