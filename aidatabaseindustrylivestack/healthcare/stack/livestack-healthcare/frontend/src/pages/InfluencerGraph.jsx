import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { Network, Users, Star, Search, X, TrendingUp, Zap, Play, Loader2, Code2, Table2, Clock, ArrowRight, RotateCcw } from 'lucide-react';
import * as d3 from 'd3';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, getPlatformColor, getPlatformClassName, getPlatformDisplayName } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { SceneStoryPanel } from '../components/HealthcareStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

// ── Connection type colors ──────────────────────────────────────────────────
const CONNECTION_COLORS = {
  had_encounter:       '#312D2A',
  diagnosed_with:      '#C74634',
  received_medication: '#4C825C',
  ordered_procedure:   '#437C94',
  treated_by:          '#796087',
  occurred_at:         '#AA643B',
  has_care_gap:        '#A36472',
  followed_by:         '#4F7D7B',
  assigned_to:         '#5F7D4F',
  escalated_to:        '#AA643B',
  readmitted_after:    '#C74634',
  lab_indicates:       '#437C94',
  uses_device:         '#F0CC71',
  shares_provider:     '#796087',
  case_signal:         '#C74634',
};

const EDGE_CATEGORY_ORDER = ['Clinical Events', 'Care Coordination', 'Risk & Gaps'];

// ── Platform colors (Redwood) ───────────────────────────────────────────────
const PLATFORM_COLORS = {
  patient:    '#C74634',
  encounter:  '#437C94',
  condition:  '#AA643B',
  medication: '#4C825C',
  procedure:  '#4F7D7B',
  provider:   '#796087',
  facility:   '#312D2A',
  care_gap:   '#A36472',
  device:     '#F0CC71',
  lab_result: '#437C94',
};

function platformColor(p) {
  return PLATFORM_COLORS[(p || '').toLowerCase()] || getPlatformColor(p) || '#C74634';
}

const GRAPH_CANVAS_BACKGROUND = 'var(--color-surface)';
const GRAPH_NODE_STROKE = 'rgba(49,45,42,0.24)';
const GRAPH_NODE_HOVER_STROKE = '#312D2A';
const GRAPH_CENTER_STROKE = '#FFFFFF';
const GRAPH_LABEL_COLOR = '#161513';
const GRAPH_LABEL_HALO = '#FFFFFF';
const GRAPH_LINK_MIN_OPACITY = 0.2;
const GRAPH_LINK_MAX_OPACITY = 0.52;

function firstDefined(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function getMetric(source, ...keys) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function formatMetricValue(value, emptyLabel = 'Not calculated') {
  const metric = firstDefined(value);
  if (metric === undefined) return emptyLabel;
  const numeric = Number(metric);
  return Number.isFinite(numeric) ? formatNumber(numeric) : String(metric);
}

function formatScoreValue(value, emptyLabel = 'Not calculated') {
  const metric = firstDefined(value);
  if (metric === undefined) return emptyLabel;
  const numeric = Number(metric);
  if (!Number.isFinite(numeric)) return String(metric);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function getNodeMetadata(node) {
  if (!node) {
    return {
      nodeId: 'Unknown node',
      nodeType: '',
      displayName: 'Unknown node',
      clinicalLabel: 'Unknown node',
      description: '',
    };
  }

  const nodeId = getMetric(node, 'NODE_ID', 'node_id', 'HANDLE') || 'Unknown node';
  const nodeType = getMetric(node, 'NODE_TYPE', 'node_type', 'PLATFORM') || '';
  const displayName = getMetric(node, 'DISPLAY_NAME', 'display_name') || nodeId;
  const clinicalLabel = getMetric(node, 'CLINICAL_LABEL', 'clinical_label') || displayName || nodeId;
  const description = getMetric(node, 'DESCRIPTION', 'description') || '';

  return { nodeId, nodeType, displayName, clinicalLabel, description };
}

function getConciseDisplayName(displayName, nodeId) {
  const cleaned = String(displayName || nodeId || '')
    .replace(/^De-identified\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const separatorIndex = cleaned.indexOf(' - ');
  if (separatorIndex > 0) {
    return cleaned.slice(0, separatorIndex);
  }

  return cleaned || String(nodeId || '');
}

function truncateGraphLabel(value, maxLength) {
  const label = String(value || '').trim();
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getGraphNodeLabel(node) {
  const { nodeId, displayName } = getNodeMetadata(node);
  const conciseName = getConciseDisplayName(displayName, nodeId);
  return truncateGraphLabel(conciseName || nodeId, node?.type === 'center' ? 22 : 16);
}

function escapeTooltipValue(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function formatEdgeTypeLabel(type) {
  return String(type || 'unknown')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Unknown Edge';
}

function normalizeEdgeMetadata(row = {}) {
  const edgeType = getMetric(row, 'edgeType', 'edge_type', 'EDGE_TYPE', 'type') || 'unknown';
  const displayName = getMetric(row, 'displayName', 'display_name', 'DISPLAY_NAME', 'edgeDisplayName', 'EDGE_DISPLAY_NAME')
    || formatEdgeTypeLabel(edgeType);
  const category = getMetric(row, 'category', 'CATEGORY', 'edgeCategory', 'EDGE_CATEGORY') || 'Uncategorized';
  const description = getMetric(row, 'description', 'DESCRIPTION', 'edgeDescription', 'EDGE_DESCRIPTION') || '';

  return {
    edgeType,
    displayName,
    category,
    description,
    color: CONNECTION_COLORS[edgeType] || '#6F757E',
  };
}

function buildEdgeMetadataMap(edgeMetadata = []) {
  return new Map((edgeMetadata || []).map(row => {
    const metadata = normalizeEdgeMetadata(row);
    return [metadata.edgeType, metadata];
  }));
}

function getEdgeMetadata(edge, edgeMetadataByType = new Map()) {
  const edgeType = getMetric(edge, 'edgeType', 'edge_type', 'type', 'EDGE_TYPE', 'RELATIONSHIP_TYPE') || 'unknown';
  return {
    ...normalizeEdgeMetadata(edgeMetadataByType.get(edgeType) || { edgeType }),
    ...normalizeEdgeMetadata({ ...edgeMetadataByType.get(edgeType), ...edge, edgeType }),
  };
}

function getEdgeLegendItems(edgeMetadata = []) {
  const metadataItems = (edgeMetadata || []).map(normalizeEdgeMetadata);
  if (metadataItems.length) return metadataItems;
  return Object.keys(CONNECTION_COLORS).map(edgeType => normalizeEdgeMetadata({ edgeType }));
}

function getEdgeLegendGroups(edgeMetadata = []) {
  const groups = new Map();

  getEdgeLegendItems(edgeMetadata).forEach(item => {
    const category = item.category || 'Uncategorized';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });

  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    }))
    .sort((left, right) => {
      const leftIndex = EDGE_CATEGORY_ORDER.indexOf(left.category);
      const rightIndex = EDGE_CATEGORY_ORDER.indexOf(right.category);
      const leftRank = leftIndex === -1 ? EDGE_CATEGORY_ORDER.length : leftIndex;
      const rightRank = rightIndex === -1 ? EDGE_CATEGORY_ORDER.length : rightIndex;
      return leftRank - rightRank || left.category.localeCompare(right.category);
    });
}

function getFindingValue(finding, ...keys) {
  return getMetric(finding, ...keys);
}

function formatFindingType(value) {
  return String(value || 'pathway_finding')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getFindingList(finding, listKey, rawKey) {
  const listValue = getFindingValue(finding, listKey);
  if (Array.isArray(listValue)) return listValue.filter(Boolean);
  return String(getFindingValue(finding, rawKey) || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const FINDING_PRIORITY = [
  'care_gap',
  'care_gap_pathway',
  'high_risk_pathway',
  'shared_provider',
  'coordination_hub',
  'case_evidence',
];

function getCompactPathwayFindings(findings = [], maxItems = 4) {
  const sorted = [...findings].sort((left, right) => {
    const leftType = getFindingValue(left, 'findingType', 'finding_type', 'FINDING_TYPE');
    const rightType = getFindingValue(right, 'findingType', 'finding_type', 'FINDING_TYPE');
    const leftRank = FINDING_PRIORITY.indexOf(leftType);
    const rightRank = FINDING_PRIORITY.indexOf(rightType);
    const leftPriority = leftRank === -1 ? FINDING_PRIORITY.length : leftRank;
    const rightPriority = rightRank === -1 ? FINDING_PRIORITY.length : rightRank;
    const leftRisk = Number(getFindingValue(left, 'riskScore', 'risk_score', 'RISK_SCORE')) || 0;
    const rightRisk = Number(getFindingValue(right, 'riskScore', 'risk_score', 'RISK_SCORE')) || 0;
    return leftPriority - rightPriority || rightRisk - leftRisk;
  });

  const seenTypes = new Set();
  const compact = [];

  sorted.forEach(finding => {
    const findingType = getFindingValue(finding, 'findingType', 'finding_type', 'FINDING_TYPE') || 'pathway_finding';
    if (seenTypes.has(findingType) || compact.length >= maxItems) return;
    seenTypes.add(findingType);
    compact.push(finding);
  });

  return compact;
}

function PathwayFindingsPanel({ findings = [], depth }) {
  if (!findings.length) return null;

  const compactFindings = getCompactPathwayFindings(findings);
  const recommendedFinding = compactFindings.find(finding =>
    getFindingValue(finding, 'recommendedAction', 'recommended_action', 'RECOMMENDED_ACTION')
  );
  const recommendedAction = recommendedFinding
    ? getFindingValue(recommendedFinding, 'recommendedAction', 'recommended_action', 'RECOMMENDED_ACTION')
    : null;
  const recommendedQueryKey = recommendedFinding
    ? getFindingValue(recommendedFinding, 'recommendedQueryKey', 'recommended_query_key', 'RECOMMENDED_QUERY_KEY')
    : null;

  return (
    <div className="glass-card p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)] flex items-center gap-1.5">
            <Zap size={12} className="text-[var(--color-accent)]" />
            Key Pathway Findings
          </h4>
          <p className="text-[11px] leading-relaxed text-[var(--color-text-dim)] mt-0.5">
            Database-backed graph insights for the selected center node at {depth} hop{depth > 1 ? 's' : ''}.
          </p>
        </div>
        <span className="hidden sm:inline text-[10px] font-mono text-[var(--color-text-dim)] whitespace-nowrap">
          CARE_GRAPH_PATHWAY_FINDINGS
        </span>
      </div>

      <ul className="space-y-1.5">
        {compactFindings.map((finding, index) => {
          const findingId = getFindingValue(finding, 'findingId', 'finding_id', 'FINDING_ID') || `finding-${index}`;
          const findingType = getFindingValue(finding, 'findingType', 'finding_type', 'FINDING_TYPE');
          const description = getFindingValue(finding, 'description', 'DESCRIPTION');
          const supportingNodeIds = getFindingList(finding, 'supportingNodeIds', 'supporting_node_ids').slice(0, 3);

          return (
            <li key={findingId} className="flex gap-2 text-xs leading-relaxed text-[var(--color-text)]">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-accent)]" />
              <span className="min-w-0">
                <span className="font-semibold">{formatFindingType(findingType)}:</span>{' '}
                {description || 'A database-backed pathway finding is available for this selected graph node.'}
                {supportingNodeIds.length > 0 && (
                  <span className="ml-1 text-[10px] font-mono text-[var(--color-text-dim)]">
                    {supportingNodeIds.join(', ')}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {recommendedAction && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-text)]">
            <ArrowRight size={11} className="text-[var(--color-accent)]" />
            Recommended next step:
          </span>
          <span className="text-[var(--color-text-dim)]">{recommendedAction}</span>
          {recommendedQueryKey && (
            <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
              query: {recommendedQueryKey}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function getNodeEntityId(node) {
  return getMetric(
    node,
    'INFLUENCER_ID',
    'influencer_id',
    'ENTITY_ID',
    'entity_id',
    'id',
    'NODE_ID',
    'node_id',
    'HANDLE',
    'handle',
  );
}

function EdgeLegend({ groups, compact = false }) {
  return (
    <div className={compact ? 'grid grid-cols-1 sm:grid-cols-3 gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
      {groups.map(({ category, items }) => (
        <section key={category} className={compact ? 'min-w-0' : 'min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5'}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">{category}</p>
          <div className={compact ? 'flex flex-wrap gap-x-2 gap-y-1' : 'space-y-1'}>
            {items.map(({ edgeType, displayName, color, description }) => (
              <div
                key={edgeType}
                className="inline-flex max-w-full items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]"
                title={description ? `${description} Edge type: ${edgeType}` : `Edge type: ${edgeType}`}
                aria-label={`${displayName}. ${description || `Canonical edge type ${edgeType}`}`}
              >
                <span className="w-2.5 h-1.5 rounded-sm inline-block flex-shrink-0" style={{ background: color }} />
                <span className="truncate">{displayName}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
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
          : d.hopLevel === 1 ? 0.96
          : d.hopLevel === 2 ? 0.86
          : 0.72,
      };
      nodeMap.set(n.id, n);
      return n;
    });

    const edgeMetadataByType = buildEdgeMetadataMap(data.edgeMetadata);
    const links = data.edges.map(d => {
      const edgeMetadata = getEdgeMetadata(d, edgeMetadataByType);
      return {
        ...d,
        ...edgeMetadata,
        source:   d.source,
        target:   d.target,
        type:     edgeMetadata.edgeType,
        color:    edgeMetadata.color || CONNECTION_COLORS[edgeMetadata.edgeType] || '#312D2A',
        strength: d.strength || 0.5,
      };
    });

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
        const { edgeType, displayName, category, description } = getEdgeMetadata(d, edgeMetadataByType);
        const color = CONNECTION_COLORS[edgeType] || '#6F757E';
        tip.html(`
          <div style="font-size:11px;line-height:1.65;color:#161513">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
              <strong style="color:#161513">${escapeTooltipValue(displayName)}</strong>
            </div>
            <div>Category: <strong>${escapeTooltipValue(category)}</strong></div>
            <div>Edge type: <strong style="font-family:monospace">${escapeTooltipValue(edgeType)}</strong></div>
            <div>Strength: <strong>${Math.round((d.strength || 0) * 100)}%</strong></div>
            <div>Interactions: <strong>${formatNumber(d.interactions || 0)}</strong></div>
            <div style="color:#6F757E;font-size:10px;margin-top:2px">Hop ${d.hopLevel}</div>
            ${description ? `<div style="color:#6F757E;font-size:10px;line-height:1.45;margin-top:4px;max-width:232px">${escapeTooltipValue(description)}</div>` : ''}
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

    // Verified badge (✓)
    const isVerified = d => d.IS_VERIFIED === 'Y' || d.IS_VERIFIED === 1 || d.IS_VERIFIED === true;
    node.filter(d => isVerified(d)).append('text')
      .text('✓')
      .attr('dy', d => -d.radius + 4)
      .attr('dx', d => d.radius - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4C825C')
      .attr('font-size', '9px');

    // Compact database-backed node label. Full metadata remains available in the tooltip.
    node.append('text')
      .text(d => getGraphNodeLabel(d))
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
        const { nodeId, nodeType, displayName, clinicalLabel, description } = getNodeMetadata(d);
        const pc    = platformColor(nodeType);
        const pathwayVolume = formatMetricValue(getMetric(d, 'PATHWAY_VOLUME', 'pathway_volume', 'FOLLOWER_COUNT'));
        const score = formatScoreValue(getMetric(d, 'RISK_SCORE', 'risk_score', 'INFLUENCE_SCORE'));
        const openGaps = formatMetricValue(getMetric(d, 'OPEN_CARE_GAP_COUNT', 'open_care_gap_count'));
        const directLinks = formatMetricValue(firstDefined(
          getMetric(d, 'DIRECT_CONNECTION_COUNT', 'direct_connection_count', 'TOTAL_CONNECTIONS', 'CONNECTION_COUNT'),
          d.linkCount,
        ));
        tip.html(`
          <div style="font-size:11px;min-width:180px;line-height:1.7;color:#161513">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;border-bottom:1px solid rgba(49,45,42,0.12);padding-bottom:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${pc}"></span>
              <strong style="color:#161513">${escapeTooltipValue(clinicalLabel)}</strong>
              ${isVerified(d) ? '<span style="color:#4C825C;font-size:10px;font-weight:600">✓ verified</span>' : ''}
            </div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px">
              <span style="color:#6F757E">Node ID</span><span style="font-family:monospace">${escapeTooltipValue(nodeId)}</span>
              <span style="color:#6F757E">Display name</span><span>${escapeTooltipValue(displayName)}</span>
              <span style="color:#6F757E">Entity</span><span style="text-transform:capitalize">${escapeTooltipValue(getPlatformDisplayName(nodeType) || nodeType || '-')}</span>
              <span style="color:#6F757E">Domain</span><span>${escapeTooltipValue(d.NICHE || '-')}</span>
              <span style="color:#6F757E">City</span><span>${escapeTooltipValue(d.CITY || '-')}</span>
              <span style="color:#6F757E">Pathway volume</span><span>${pathwayVolume}</span>
              <span style="color:#6F757E">Direct links</span><span style="color:#161513;font-weight:600">${directLinks}</span>
              <span style="color:#6F757E">Risk score</span><span>${score}</span>
              <span style="color:#6F757E">Open care gaps</span><span>${openGaps}</span>
              <span style="color:#6F757E">Hop</span><span>${d.type === 'center' ? '0 (center)' : d.hopLevel}</span>
            </div>
            ${description ? `<div style="color:#6F757E;font-size:10px;line-height:1.45;margin-top:6px;max-width:236px">${escapeTooltipValue(description)}</div>` : ''}
            <div style="color:#C74634;font-size:10px;font-weight:600;margin-top:6px;text-align:center">Click to explore network →</div>
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

// ── Query Explorer colors ────────────────────────────────────────────────────
const QUERY_COLORS = {
  care_gap_paths:    { color: '#C74634', icon: Network },
  readmission_chain: { color: '#AA643B', icon: TrendingUp },
  shared_care_team:  { color: '#796087', icon: Users },
  case_map:          { color: '#4F7D7B', icon: Table2 },
  care_hubs:         { color: '#4C825C', icon: Star },
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
            Run real SQL/PGQ queries against the <span className="tone-sienna font-mono">CARE_PATHWAY_NETWORK</span> property graph
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
                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(49,45,42,0.4)', border: '1px solid rgba(107,116,148,0.25)' }}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-wider" style={{ background: 'rgba(107,116,148,0.1)' }}>
                    Executed SQL/PGQ
                  </div>
                  <pre className="p-3 text-[11px] font-mono tone-pine overflow-x-auto leading-relaxed whitespace-pre">{result.sql}</pre>
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
export default function InfluencerGraph() {
  const { currentUser } = useUser();
  const [selectedId,  setSelectedId]  = useState(null);
  const [depth,       setDepth]       = useState(5);
  const [search,      setSearch]      = useState('');
  const [nodeListMaxHeight, setNodeListMaxHeight] = useState(null);
  const nodeListRef = useRef(null);
  const edgeTypesRef = useRef(null);

  // Track which user the current influencer list belongs to
  const [listUser, setListUser] = useState(null);

  // Influencer list - refetch when user or search changes (VPD filtering)
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

  const handleSelectId = useCallback((id) => {
    setSelectedId(id);
    setNetwork(null);
  }, [setNetwork]);

  const handleExplore = useCallback((id) => {
    setSelectedId(id);
    setNetwork(null);
  }, [setNetwork]);

  const handleNodeClick = useCallback((node) => {
    const nodeEntityId = getNodeEntityId(node);
    if (nodeEntityId) handleExplore(nodeEntityId);
  }, [handleExplore]);

  // Stats
  const stats = network?.stats || {};
  const edgeLegendGroups = useMemo(
    () => getEdgeLegendGroups(network?.edgeMetadata),
    [network?.edgeMetadata]
  );

  useLayoutEffect(() => {
    const updateNodeListHeight = () => {
      const nodeList = nodeListRef.current;
      const edgeTypes = edgeTypesRef.current;

      if (!nodeList || !edgeTypes || window.innerWidth < 1024) {
        setNodeListMaxHeight(null);
        return;
      }

      const nodeTop = nodeList.getBoundingClientRect().top + window.scrollY;
      const edgeBottom = edgeTypes.getBoundingClientRect().bottom + window.scrollY;
      const nextHeight = Math.max(420, Math.round(edgeBottom - nodeTop));

      setNodeListMaxHeight(current =>
        Math.abs((current || 0) - nextHeight) > 1 ? nextHeight : current
      );
    };

    const frame = window.requestAnimationFrame(updateNodeListHeight);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateNodeListHeight)
      : null;

    if (nodeListRef.current) resizeObserver?.observe(nodeListRef.current);
    if (edgeTypesRef.current) resizeObserver?.observe(edgeTypesRef.current);
    window.addEventListener('resize', updateNodeListHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateNodeListHeight);
    };
  }, [network, edgeLegendGroups, rawInfluencers?.length, loading, loadingNet]);

  return (
    <div className="space-y-6 fade-in">

      {/* Oracle panel */}
      <RegisterOraclePanel title="Care Pathway Graph">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Oracle's <span className="tone-sienna font-mono">Property Graph</span> engine (SQL/PGQ - ISO standard) treats the
              care pathway as a first-class graph object. Vertices represent de-identified patients, encounters, diagnoses,
              medications, providers, facilities, devices, and care gaps. Edges encode relationships like
              <code className="text-xs tone-plum mx-1">had_encounter · diagnosed_with · has_care_gap · assigned_to</code>
              with a numeric <span className="tone-sienna font-mono">strength</span> weight.
              Graph traversal finds multi-hop readmission, care-gap, and shared-care-team patterns without any external graph database.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="SQL/PGQ (ISO Property Graph)" color="yellow" />
            <FeatureBadge label="GRAPH_TABLE()" color="yellow" />
            <FeatureBadge label="PGQL Traversal" color="orange" />
            <FeatureBadge label="Vertex / Edge Tables" color="purple" />
            <FeatureBadge label="Care Gap Paths" color="pink" />
            <FeatureBadge label="CONNECT BY" color="blue" />
            <FeatureBadge label="Readmission Risk" color="green" />
          </div>
          <SqlBlock code={`-- ISO SQL/PGQ: Patient-to-care-gap traversal
SELECT patient_key, patient_label, encounter_key,
       encounter_label, gap_key, gap_label,
       gap_edge, strength
FROM GRAPH_TABLE(
  care_pathway_network
  MATCH
    (patient IS care_entity)
    -[e1 IS clinical_link]->
    (encounter IS care_entity)
    -[e2 IS clinical_link]->
    (gap IS care_entity)
  WHERE patient.entity_key = :patient_key
    AND gap.entity_type = 'care_gap'
  COLUMNS (
    patient.entity_key AS patient_key,
    patient.clinical_label AS patient_label,
    encounter.entity_key AS encounter_key,
    encounter.clinical_label AS encounter_label,
    gap.entity_key AS gap_key,
    gap.clinical_label AS gap_label,
    e2.relationship_type AS gap_edge,
    e2.strength AS strength
  )
)
ORDER BY strength DESC;`} />
          <SqlBlock code={`-- Create the property graph over relational tables
CREATE OR REPLACE PROPERTY GRAPH care_pathway_network
  VERTEX TABLES (
    care_graph_entities KEY (entity_id) LABEL care_entity
      PROPERTIES (entity_id, entity_key, node_id,
        entity_type, node_type, display_name,
        clinical_label, description, clinical_domain, risk_score,
        volume_count, engagement_rate, city, region),
    care_pathway_cases KEY (case_id) LABEL care_case
      PROPERTIES (case_id, case_key, case_type,
        severity, status, risk_score)
  )
  EDGE TABLES (
    care_graph_relationships KEY (relationship_id)
      SOURCE KEY (from_entity_id)
        REFERENCES care_graph_entities (entity_id)
      DESTINATION KEY (to_entity_id)
        REFERENCES care_graph_entities (entity_id)
      LABEL clinical_link
      PROPERTIES (relationship_type, strength,
        interaction_count, evidence_text),
    care_case_entities KEY (case_entity_id)
      SOURCE KEY (case_id)
        REFERENCES care_pathway_cases (case_id)
      DESTINATION KEY (entity_id)
        REFERENCES care_graph_entities (entity_id)
      LABEL case_involves
      PROPERTIES (role, evidence_score, note)
  );`} />
          <SqlBlock code={`-- Friendly node metadata for SQL, Ask Data, and tooltips
SELECT node_id, node_type, display_name,
       clinical_label, description
FROM care_graph_node_metadata
WHERE node_id IN ('COND-SEPSIS', 'GAP-READMIT-RISK', 'PAT-1007')
ORDER BY node_id;`} />
          <SqlBlock code={`-- Friendly edge metadata for SQL, Ask Data, and graph legends
SELECT edge_type, display_name, category, description
FROM care_graph_edge_metadata
ORDER BY category, edge_type;`} />
          <SqlBlock code={`-- Healthcare metric projection used by the graph API
SELECT node_id, node_type, display_name,
       clinical_label, pathway_volume,
       patient_count, encounter_count, risk_score,
       open_care_gap_count, direct_connection_count
FROM care_graph_entity_metrics
ORDER BY risk_score DESC;`} />
          <SqlBlock code={`-- Database-backed pathway findings used by the graph page
SELECT finding_type, title, description,
       supporting_node_ids, supporting_edge_types,
       risk_score, recommended_action,
       recommended_query_key
FROM care_graph_pathway_findings
WHERE center_node_id = 'COND-SEPSIS'
  AND min_graph_depth <= 3
ORDER BY risk_score DESC;`} />
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <DiagramBox label="care entities" sub="Vertex table" color="#C74634" />
            <DiagramBox label="clinical links" sub="Edge table" color="#AA643B" />
            <DiagramBox label="pathway cases" sub="Case vertices" color="#A36472" />
            <DiagramBox label="case evidence" sub="Case edges" color="#4C825C" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Edge Types</p>
            <EdgeLegend groups={edgeLegendGroups} compact />
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
          <SqlBlock code={`-- VPD policy function (same pattern can protect graph tables)
CREATE FUNCTION vpd_care_graph_entities(
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

-- Apply via DBMS_RLS.ADD_POLICY to:
--   care_graph_entities,
--   care_graph_relationships,
--   care_pathway_cases,
--   care_case_entities`} />
        </div>
      </RegisterOraclePanel>

      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Network className="text-[var(--color-accent)]" /> Care Pathway Graph
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Explore de-identified patient journeys, care gaps, shared care-team relationships, and risk pathways using <span className="tone-sienna">Oracle Property Graph SQL/PGQ</span>.
        </p>
      </div>

      <SceneStoryPanel scene="graph" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* ── Left column: list + controls ─────────────────────────────── */}
        <div className="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col">

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, encounter, gap, provider..."
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

          {/* Care graph entity list */}
          <div
            ref={nodeListRef}
            className="glass-card p-3 max-h-[560px] overflow-y-auto lg:flex-none"
            style={nodeListMaxHeight ? { maxHeight: `${nodeListMaxHeight}px` } : undefined}
          >
            <h3 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={11} /> Care Graph Nodes {rawInfluencers?.length ? `(${rawInfluencers.length})` : ''}
            </h3>
            {loading ? (
              <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">Loading…</p>
            ) : (rawInfluencers || []).map(inf => {
              const { nodeId, nodeType, displayName, clinicalLabel } = getNodeMetadata(inf);
              const pathwayVolume = formatMetricValue(getMetric(inf, 'PATHWAY_VOLUME', 'pathway_volume', 'FOLLOWER_COUNT'));
              const riskScore = formatScoreValue(getMetric(inf, 'RISK_SCORE', 'risk_score', 'INFLUENCE_SCORE'));
              const directLinks = getMetric(inf, 'DIRECT_CONNECTION_COUNT', 'direct_connection_count', 'CONNECTION_COUNT');

              return (
                <button key={inf.INFLUENCER_ID}
                  onClick={() => handleSelectId(inf.INFLUENCER_ID)}
                  className={`w-full text-left p-2 rounded-lg transition-colors text-xs mb-1 ${
                    selectedId === inf.INFLUENCER_ID
                      ? 'bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40'
                      : 'hover:bg-[var(--color-surface-hover)] border border-transparent'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{displayName}</span>
                    <span className={`${getPlatformClassName(nodeType)} !text-[9px] !py-0`}>{getPlatformDisplayName(nodeType)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-[var(--color-text-dim)]">{clinicalLabel}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    <span className="font-mono">{nodeId}</span>
                    <span>{pathwayVolume} pathway volume</span>
                    <span className="text-[var(--color-accent)]">risk {riskScore}</span>
                    {Number(directLinks) > 0 && <span>{formatMetricValue(directLinks)} links</span>}
                  </div>
                </button>
              );
            })}
          </div>

        </div>

        {/* ── Right column: graph + stats ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">

          {/* Selected care entity metrics + stats bar */}
          {network && (
            <div className="glass-card p-3">
              {network.center && (
                (() => {
                  const {
                    nodeId: centerNodeId,
                    nodeType: centerType,
                    displayName: centerDisplayName,
                    clinicalLabel: centerLabel,
                    description: centerDescription,
                  } = getNodeMetadata(network.center);

                  return (
                    <div className="mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ background: '#C74634', border: '2px solid #C74634', color: '#FFFFFF' }}>
                          {String(centerDisplayName || centerNodeId || '?').replace('@','').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm flex items-center gap-1.5">
                            {centerDisplayName}
                            {(network.center.IS_VERIFIED === 'Y' || network.center.IS_VERIFIED === 1) && (
                              <span className="tone-pine text-xs">✓</span>
                            )}
                            <span className={`${getPlatformClassName(centerType)} !text-[9px] !py-0 ml-1`}>{getPlatformDisplayName(centerType)}</span>
                            {network.center.NICHE && <span className="text-[10px] text-[var(--color-text-dim)] font-normal ml-1">{network.center.NICHE}</span>}
                          </p>
                          <p className="text-xs text-[var(--color-text-dim)] truncate">{centerLabel}</p>
                          <p className="text-[10px] text-[var(--color-text-dim)]">
                            <span className="font-mono">{centerNodeId}</span> - canonical node ID for SQL/PGQ demos
                          </p>
                        </div>
                      </div>
                      {centerDescription && (
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-dim)]">{centerDescription}</p>
                      )}
                    </div>
                  );
                })()
              )}
              <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                <span className="font-semibold text-[var(--color-text)]">Current pathway focus:</span> Sepsis-related care journeys, readmission risk, follow-up gaps, medications, procedures, providers, encounters, and facility touchpoints connected within the selected graph depth.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
                {[
                  { label: 'Pathway Volume', value: formatMetricValue(getMetric(network.center, 'PATHWAY_VOLUME', 'pathway_volume', 'FOLLOWER_COUNT')), color: '#C74634' },
                  { label: 'Risk Score', value: formatScoreValue(getMetric(network.center, 'RISK_SCORE', 'risk_score', 'INFLUENCE_SCORE')), color: '#AA643B' },
                  { label: 'Open Care Gaps', value: formatMetricValue(getMetric(network.center, 'OPEN_CARE_GAP_COUNT', 'open_care_gap_count')), color: '#A36472' },
                  { label: 'Direct Connections', value: formatMetricValue(getMetric(network.center, 'DIRECT_CONNECTION_COUNT', 'direct_connection_count', 'TOTAL_CONNECTIONS')), color: '#4F7D7B' },
                  { label: 'Connected Nodes', value: formatMetricValue(firstDefined(getMetric(network.center, 'CONNECTED_NODE_COUNT', 'connected_node_count'), stats.connectedNodeCount, stats.connected_node_count, stats.nodeCount, network.nodes?.length, 0)), color: '#5F7D4F' },
                  { label: 'Pathway Relationships', value: formatMetricValue(firstDefined(getMetric(network.center, 'PATHWAY_RELATIONSHIP_COUNT', 'pathway_relationship_count'), stats.pathwayRelationshipCount, stats.pathway_relationship_count, stats.edgeCount, network.edges?.length, 0)), color: '#796087' },
                  { label: 'Graph Depth', value: `${firstDefined(getMetric(network.center, 'GRAPH_DEPTH', 'graph_depth'), stats.graphDepth, stats.graph_depth, stats.depth, depth)} hop${firstDefined(getMetric(network.center, 'GRAPH_DEPTH', 'graph_depth'), stats.graphDepth, stats.graph_depth, stats.depth, depth) > 1 ? 's' : ''}`, color: '#437C94' },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-lg border p-2 text-left"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: s.color }}
                  >
                    <span className="mb-1 block h-1.5 w-8 rounded-sm" style={{ background: s.color }} />
                    <p className="text-sm font-bold leading-tight">{s.value}</p>
                    <p className="mt-0.5 text-[9px] leading-tight text-[var(--color-text-dim)]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PathwayFindingsPanel findings={network?.findings || []} depth={depth} />

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
              Select a care graph node to explore its network
            </div>
          )}

          {/* Edge type legend */}
          {network && (
            <div ref={edgeTypesRef} className="glass-card p-3">
              <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Edge Types</p>
              <EdgeLegend groups={edgeLegendGroups} />
            </div>
          )}

        </div>
      </div>

      {/* ── Graph Query Explorer ── */}
      <div style={{ marginTop: '0.75rem' }}>
        <GraphQueryExplorer />
      </div>
    </div>
  );
}
