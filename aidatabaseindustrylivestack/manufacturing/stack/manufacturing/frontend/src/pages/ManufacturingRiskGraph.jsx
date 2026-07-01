import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Database, GitBranch, MapPin, Network, ShieldCheck } from 'lucide-react';
import * as d3 from 'd3';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { JetSelectSingle } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/ManufacturingStory';
import { formatNumber } from '../utils/format';

const HOP_DEPTHS = [1, 2, 3, 4, 5];

const ENTITY_COLORS = {
  supplier: '#C74634',
  part: '#4C825C',
  plant: '#437C94',
  work_order: '#AA643B',
  production_signal: '#312D2A',
};

const MAX_RENDERED_ENTITIES = 38;
const HOP_RENDER_LIMITS = { 1: 20, 2: 8, 3: 4, 4: 3, 5: 2 };
const ENTITY_RENDER_ORDER = ['supplier', 'part', 'plant', 'work_order', 'production_signal'];

function entityColor(entityType) {
  return ENTITY_COLORS[String(entityType || '').toLowerCase()] || '#6F757E';
}

function isSourceLinked(entity) {
  const sourceObject = String(entity?.sourceObject || '').trim().toUpperCase();
  const sourceKey = String(entity?.sourceKey || '').trim();
  return Boolean(sourceObject && sourceKey);
}

function provenanceText(entity) {
  if (!entity) return 'Not provided';
  return isSourceLinked(entity)
    ? `Source-linked: ${entity.sourceObject} / ${entity.sourceKey || 'key not provided'}`
    : 'Relational source unavailable';
}

function displayLabel(value, fallback = 'Not provided') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function truncateLabel(value, length = 20) {
  const label = String(value || '').trim();
  return label.length > length ? `${label.slice(0, length - 3)}...` : label;
}

function riskColor(score) {
  const value = Number(score) || 0;
  if (value >= 80) return '#C74634';
  if (value >= 60) return '#AA643B';
  if (value >= 40) return '#796087';
  return '#4C825C';
}

function buildVisibleNetwork(entities = [], relationships = [], centerKey) {
  const entityByKey = new Map(entities.map((entity) => [entity.entityKey, entity]));
  if (!centerKey || !entityByKey.has(centerKey)) {
    return { entities: [], relationships: [] };
  }

  const selectedKeys = new Set([centerKey]);
  const degreeByKey = new Map();
  for (const relationship of relationships) {
    degreeByKey.set(
      relationship.fromEntityKey,
      (degreeByKey.get(relationship.fromEntityKey) || 0) + 1
    );
    degreeByKey.set(
      relationship.toEntityKey,
      (degreeByKey.get(relationship.toEntityKey) || 0) + 1
    );
  }

  const candidateSort = (left, right) => (
    (Number(right.riskScore) || 0) - (Number(left.riskScore) || 0)
    || (degreeByKey.get(right.entityKey) || 0) - (degreeByKey.get(left.entityKey) || 0)
    || String(left.entityKey).localeCompare(String(right.entityKey))
  );

  for (let hop = 1; hop <= 5 && selectedKeys.size < MAX_RENDERED_ENTITIES; hop += 1) {
    const hopLimit = Math.min(
      HOP_RENDER_LIMITS[hop] || 0,
      MAX_RENDERED_ENTITIES - selectedKeys.size
    );
    if (!hopLimit) continue;

    const candidates = entities
      .filter((entity) => entity.entityKey !== centerKey && (Number(entity.hop) || 1) === hop)
      .filter((entity) => (
        hop === 1 || relationships.some((relationship) => (
          (relationship.fromEntityKey === entity.entityKey && selectedKeys.has(relationship.toEntityKey))
          || (relationship.toEntityKey === entity.entityKey && selectedKeys.has(relationship.fromEntityKey))
        ))
      ));
    const queues = new Map();
    for (const candidate of candidates) {
      const entityType = String(candidate.entityType || 'other').toLowerCase();
      const queue = queues.get(entityType) || [];
      queue.push(candidate);
      queues.set(entityType, queue);
    }
    for (const queue of queues.values()) queue.sort(candidateSort);

    const typeOrder = [
      ...ENTITY_RENDER_ORDER,
      ...[...queues.keys()].filter((entityType) => !ENTITY_RENDER_ORDER.includes(entityType)).sort(),
    ];
    let added = 0;
    while (added < hopLimit) {
      let progressed = false;
      for (const entityType of typeOrder) {
        const candidate = queues.get(entityType)?.shift();
        if (!candidate || selectedKeys.has(candidate.entityKey)) continue;
        selectedKeys.add(candidate.entityKey);
        added += 1;
        progressed = true;
        if (added >= hopLimit || selectedKeys.size >= MAX_RENDERED_ENTITIES) break;
      }
      if (!progressed) break;
    }
  }

  const visibleEntities = entities
    .filter((entity) => selectedKeys.has(entity.entityKey))
    .sort((left, right) => (
      (left.entityKey === centerKey ? -1 : 0) - (right.entityKey === centerKey ? -1 : 0)
      || (Number(left.hop) || 0) - (Number(right.hop) || 0)
      || candidateSort(left, right)
    ));
  const visibleRelationships = relationships.filter((relationship) => (
    selectedKeys.has(relationship.fromEntityKey) && selectedKeys.has(relationship.toEntityKey)
  ));

  return { entities: visibleEntities, relationships: visibleRelationships };
}

function GraphMetric({ label, value, helper }) {
  return (
    <div className="min-w-0 border-l-2 border-[var(--color-border)] pl-3">
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
      <p className="text-[10px] uppercase text-[var(--color-text-dim)]">{label}</p>
      {helper ? <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">{helper}</p> : null}
    </div>
  );
}

function HopDepthSelector({ value, onValueChange }) {
  const activeDepth = Number(value) || 1;
  const selectDepth = (depth) => onValueChange(String(depth));

  const handleKeyDown = (event, depth) => {
    let nextDepth = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextDepth = Math.min(5, depth + 1);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextDepth = Math.max(1, depth - 1);
    if (event.key === 'Home') nextDepth = 1;
    if (event.key === 'End') nextDepth = 5;
    if (nextDepth === null || nextDepth === depth) return;

    event.preventDefault();
    selectDepth(nextDepth);
    event.currentTarget.parentElement
      ?.querySelector(`[data-hop-depth="${nextDepth}"]`)
      ?.focus();
  };

  return (
    <div>
      <p className="text-[10px] uppercase text-[var(--color-text-dim)] mb-2">Graph depth (hops)</p>
      <div
        className="manufacturing-hop-selector"
        role="radiogroup"
        aria-label="Traversal depth"
        style={{ '--hop-progress': `${((activeDepth - 1) / 4) * 100}%` }}
      >
        <span className="manufacturing-hop-selector__track" aria-hidden="true" />
        {HOP_DEPTHS.map((depth) => {
          const selected = depth === activeDepth;
          return (
            <button
              key={depth}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Show ${depth} graph hop${depth === 1 ? '' : 's'}`}
              title={`${depth} graph hop${depth === 1 ? '' : 's'}`}
              tabIndex={selected ? 0 : -1}
              data-hop-depth={depth}
              className={`manufacturing-hop-selector__step ${selected ? 'manufacturing-hop-selector__step--selected' : ''}`}
              onClick={() => selectDepth(depth)}
              onKeyDown={(event) => handleKeyDown(event, depth)}
            >
              <span className="manufacturing-hop-selector__dot" aria-hidden="true">{depth}</span>
              <span className="manufacturing-hop-selector__label">{depth === 1 ? 'hop' : 'hops'}</span>
            </button>
          );
        })}
      </div>
      <p className="manufacturing-hop-selector__summary">
        Traverse up to {activeDepth} relationship layer{activeDepth === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function NetworkCanvas({ entities, relationships, centerKey, onEntitySelect }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 560 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = () => {
      const width = Math.max(300, Math.round(container.getBoundingClientRect().width || 900));
      const height = Math.max(440, Math.min(620, Math.round(width * 0.62)));
      setDimensions((current) => (
        current.width === width && current.height === height ? current : { width, height }
      ));
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || !entities?.length) return undefined;

    const { width, height } = dimensions;
    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();

    const knownEntityKeys = new Set(entities.map((entity) => entity.entityKey));
    const nodes = entities.map((entity) => ({ ...entity, id: entity.entityKey }));
    const links = (relationships || [])
      .filter((relationship) => (
        knownEntityKeys.has(relationship.fromEntityKey)
        && knownEntityKeys.has(relationship.toEntityKey)
      ))
      .map((relationship) => ({
        ...relationship,
        source: relationship.fromEntityKey,
        target: relationship.toEntityKey,
      }));

    const viewport = svg.append('g').attr('class', 'manufacturing-graph-viewport');
    const zoom = d3.zoom()
      .scaleExtent([0.45, 3])
      .on('zoom', (event) => viewport.attr('transform', event.transform));
    svg.call(zoom);

    const link = viewport.append('g')
      .attr('aria-hidden', 'true')
      .selectAll('line')
      .data(links, (relationship) => relationship.relationshipId)
      .join('line')
      .attr('stroke', '#7A736E')
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', (relationship) => (
        Math.max(1, Math.min(4, 1 + (Number(relationship.strength) || 0) * 2))
      ));

    link.append('title').text((relationship) => {
      const evidence = relationship.evidenceText ? `\n${relationship.evidenceText}` : '';
      return `${displayLabel(relationship.relationshipType)}${evidence}`;
    });

    const node = viewport.append('g')
      .selectAll('g')
      .data(nodes, (entity) => entity.entityKey)
      .join('g')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', (entity) => (
        `${entity.displayName}, ${displayLabel(entity.entityType)}, risk ${entity.riskScore ?? 'not scored'}`
      ))
      .style('cursor', 'pointer')
      .on('click', (_, entity) => onEntitySelect(entity.entityKey))
      .on('keydown', (event, entity) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEntitySelect(entity.entityKey);
        }
      });

    node.append('circle')
      .attr('r', (entity) => (
        entity.entityKey === centerKey
          ? 20
          : 11 + Math.min(7, (Number(entity.riskScore) || 0) / 15)
      ))
      .attr('fill', (entity) => entityColor(entity.entityType))
      .attr('fill-opacity', 0.94)
      .attr('stroke', (entity) => entity.entityKey === centerKey ? '#FFFFFF' : 'rgba(49,45,42,0.35)')
      .attr('stroke-width', (entity) => entity.entityKey === centerKey ? 4 : 1.5);

    node.append('circle')
      .attr('r', (entity) => entity.entityKey === centerKey ? 25 : 0)
      .attr('fill', 'none')
      .attr('stroke', (entity) => riskColor(entity.riskScore))
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 3');

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (entity) => entity.entityKey === centerKey ? 38 : 30)
      .attr('font-size', (entity) => entity.entityKey === centerKey ? 11 : 9)
      .attr('font-weight', (entity) => entity.entityKey === centerKey ? 700 : 600)
      .attr('fill', '#161513')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .style('pointer-events', 'none')
      .text((entity) => truncateLabel(entity.operationsLabel || entity.displayName || entity.entityKey));

    node.append('title').text((entity) => [
      entity.displayName,
      displayLabel(entity.entityType),
      `Risk score: ${entity.riskScore ?? 'not scored'}`,
      `Provenance: ${provenanceText(entity)}`,
    ].join('\n'));

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((entity) => entity.id).distance((relationship) => 82 + (relationship.hop || 1) * 12).strength(0.55))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((entity) => entity.entityKey === centerKey ? 48 : 35))
      .force('x', d3.forceX(width / 2).strength(0.045))
      .force('y', d3.forceY(height / 2).strength(0.06));

    const drag = d3.drag()
      .on('start', (event, entity) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        entity.fx = entity.x;
        entity.fy = entity.y;
      })
      .on('drag', (event, entity) => {
        entity.fx = event.x;
        entity.fy = event.y;
      })
      .on('end', (event, entity) => {
        if (!event.active) simulation.alphaTarget(0);
        entity.fx = null;
        entity.fy = null;
      });
    node.call(drag);

    simulation.on('tick', () => {
      nodes.forEach((entity) => {
        entity.x = Math.max(70, Math.min(width - 70, entity.x || width / 2));
        entity.y = Math.max(34, Math.min(height - 48, entity.y || height / 2));
      });
      link
        .attr('x1', (relationship) => relationship.source.x)
        .attr('y1', (relationship) => relationship.source.y)
        .attr('x2', (relationship) => relationship.target.x)
        .attr('y2', (relationship) => relationship.target.y);
      node.attr('transform', (entity) => `translate(${entity.x},${entity.y})`);
    });

    return () => {
      simulation.stop();
      svg.on('.zoom', null);
    };
  }, [centerKey, dimensions, entities, onEntitySelect, relationships]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden bg-[var(--color-surface-muted)]"
      style={{ minHeight: dimensions.height }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label="Manufacturing production risk network"
      />
    </div>
  );
}

function ProvenanceRow({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2 border-b border-[var(--color-border)]/60 last:border-b-0">
      <dt className="text-[10px] uppercase text-[var(--color-text-dim)]">{label}</dt>
      <dd className={`text-xs text-[var(--color-text)] break-words ${mono ? 'font-mono' : ''}`}>{value || 'Not provided'}</dd>
    </div>
  );
}

function RiskCases({ cases }) {
  return (
    <section aria-labelledby="manufacturing-risk-cases-title">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase text-[var(--color-text-dim)]">Graph-derived evidence</p>
          <h3 id="manufacturing-risk-cases-title" className="text-base font-semibold mt-1">Connected Risk Cases</h3>
        </div>
        <span className="text-xs text-[var(--color-text-dim)]">{cases.length} case{cases.length === 1 ? '' : 's'}</span>
      </div>

      {cases.length ? (
        <div className="border-y border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {cases.map((riskCase) => (
            <article key={riskCase.caseKey} className="py-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle size={15} style={{ color: riskColor(riskCase.riskScore) }} aria-hidden="true" />
                  <span className="font-mono text-xs text-[var(--color-text)]">{riskCase.caseKey}</span>
                </div>
                <p className="text-sm font-semibold mt-2">{displayLabel(riskCase.caseType)}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] uppercase">
                  <span style={{ color: riskColor(riskCase.riskScore) }}>{riskCase.severity || 'Unrated'}</span>
                  <span className="text-[var(--color-text-dim)]">Risk {riskCase.riskScore ?? '-'}</span>
                  <span className="text-[var(--color-text-dim)]">{riskCase.status || 'Unknown'}</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--color-text)] leading-relaxed">{riskCase.summary || 'No case summary is available.'}</p>
                <div className="mt-3 space-y-2">
                  {(riskCase.evidence || []).map((evidence) => (
                    <div
                      key={`${evidence.caseEntityId}-${evidence.entity?.entityKey}`}
                      className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] text-xs"
                    >
                      <span className="font-medium text-[var(--color-text)]">
                        {evidence.entity?.displayName || evidence.entity?.entityKey}
                      </span>
                      <span className="text-[var(--color-text-dim)]">
                        {displayLabel(evidence.role)} · evidence {evidence.evidenceScore ?? '-'}
                        {evidence.note ? ` · ${evidence.note}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-8 border-y border-[var(--color-border)] text-sm text-[var(--color-text-dim)]">
          No risk cases are connected to the visible network.
        </p>
      )}
    </section>
  );
}

export default function ManufacturingRiskGraph() {
  const { currentUser } = useUser();
  const userKey = currentUser?.USERNAME;
  const [selectedEntityKey, setSelectedEntityKey] = useState('');
  const [depth, setDepth] = useState('2');

  const {
    data: directory,
    loading: loadingDirectory,
    error: directoryError,
  } = useData(() => api.manufacturing.graph.entities({ limit: 100 }), [userKey]);

  const directoryEntities = useMemo(() => directory?.entities || [], [directory]);

  useEffect(() => {
    if (!directoryEntities.length) {
      setSelectedEntityKey('');
      return;
    }
    if (!directoryEntities.some((entity) => entity.entityKey === selectedEntityKey)) {
      setSelectedEntityKey(directoryEntities[0].entityKey);
    }
  }, [directoryEntities, selectedEntityKey]);

  const {
    data: networkData,
    loading: loadingNetwork,
    error: networkError,
  } = useData(
    () => selectedEntityKey
      ? api.manufacturing.graph.network(selectedEntityKey, Number(depth))
      : Promise.resolve(null),
    [selectedEntityKey, depth, userKey]
  );

  const entityOptions = useMemo(() => directoryEntities.map((entity) => ({
    value: entity.entityKey,
    label: `${entity.displayName} · ${displayLabel(entity.entityType)}`,
  })), [directoryEntities]);

  const entities = networkData?.entities || [];
  const relationships = networkData?.relationships || [];
  const cases = networkData?.cases || [];
  const center = networkData?.center || directoryEntities.find((entity) => entity.entityKey === selectedEntityKey);
  const centerKey = center?.entityKey || selectedEntityKey;
  const visibleNetwork = useMemo(
    () => buildVisibleNetwork(entities, relationships, centerKey),
    [centerKey, entities, relationships]
  );
  const renderedEntities = visibleNetwork.entities;
  const renderedRelationships = visibleNetwork.relationships;
  const centerHasProvenance = isSourceLinked(center);
  const stats = networkData?.stats || {};
  const oracleEvidence = networkData || directory;
  const entityTypes = useMemo(() => (
    [...new Set(renderedEntities.map((entity) => entity.entityType).filter(Boolean))]
      .sort((left, right) => String(left).localeCompare(String(right)))
  ), [renderedEntities]);

  return (
    <div className="space-y-6 fade-in">
      <RegisterOraclePanel title="Manufacturing Risk Graph">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase mb-2">Oracle Runtime Evidence</p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              The network is traversed directly through Oracle SQL Property Graph queries. The values below come from the active API response.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="SQL Property Graph" color="orange" />
            <FeatureBadge label="SQL/PGQ GRAPH_TABLE" color="yellow" />
            <FeatureBadge label="Per-vertex provenance" color="green" />
            <FeatureBadge label="VPD-aware execution" color="red" />
          </div>
          <dl className="border-y border-[var(--color-border)]">
            <ProvenanceRow label="Source object" value={oracleEvidence?.sourceObject} mono />
            <ProvenanceRow label="Execution" value={oracleEvidence?.executionMode} mono />
            <ProvenanceRow label="Query key" value={oracleEvidence?.queryKey} mono />
            <ProvenanceRow label="Dataset" value={oracleEvidence ? `${oracleEvidence.datasetSource} / ${oracleEvidence.datasetVersion}` : null} mono />
          </dl>
          <SqlBlock code={oracleEvidence?.sql || '-- Waiting for Oracle graph evidence'} />
          {oracleEvidence?.binds ? (
            <pre className="text-[10px] font-mono text-[var(--color-text-dim)] whitespace-pre-wrap break-words">
{JSON.stringify(oracleEvidence.binds, null, 2)}
            </pre>
          ) : null}
        </div>
      </RegisterOraclePanel>

      <header>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Network className="tone-ocean" aria-hidden="true" /> Manufacturing Risk Graph
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Oracle graph paths connect suppliers, parts, plants, work orders, and production signals rebuilt from the active relational dataset.
        </p>
      </header>

      <SceneStoryPanel scene="graph" />

      <section className="border-y border-[var(--color-border)] py-4" aria-label="Graph controls">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(240px,0.8fr)_minmax(320px,1.2fr)] lg:items-end">
          <div>
            <p className="text-[10px] uppercase text-[var(--color-text-dim)] mb-2">Center entity</p>
            <JetSelectSingle
              value={selectedEntityKey}
              options={entityOptions}
              placeholder={loadingDirectory ? 'Loading entities' : 'Select an entity'}
              ariaLabel="Center entity"
              className="manufacturing-graph-center-select"
              disabled={loadingDirectory || !entityOptions.length}
              onValueChange={setSelectedEntityKey}
            />
          </div>
          <HopDepthSelector value={depth} onValueChange={setDepth} />
          <div className="grid grid-cols-3 gap-4">
            <GraphMetric label="Graph entities" value={formatNumber(directory?.stats?.graphEntityCount)} helper="current dataset" />
            <GraphMetric label="Relationships" value={formatNumber(directory?.stats?.graphRelationshipCount)} helper="current dataset" />
            <GraphMetric label="Visible cases" value={formatNumber(stats.caseCount)} helper={`${stats.traversedDepth ?? 0} hops traversed`} />
          </div>
        </div>
        {directoryError ? <p className="text-sm tone-red mt-3">{directoryError}</p> : null}
      </section>

      <section className="border border-[var(--color-border)] overflow-hidden" aria-labelledby="manufacturing-network-title">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] flex-wrap">
          <div>
            <p className="text-[10px] uppercase text-[var(--color-text-dim)]">SQL/PGQ traversal</p>
            <h3 id="manufacturing-network-title" className="text-sm font-semibold mt-1">
              {center?.displayName || 'Manufacturing production network'}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-dim)] flex-wrap">
            {loadingNetwork ? <span>Refreshing network...</span> : null}
            <span>{formatNumber(renderedEntities.length)} rendered / {formatNumber(stats.entityCount ?? entities.length)} traversed entities</span>
            <span>{formatNumber(renderedRelationships.length)} rendered / {formatNumber(stats.relationshipCount ?? relationships.length)} traversed relationships</span>
            <span>{stats.graphTableExecutions ?? 0} GRAPH_TABLE executions</span>
          </div>
        </div>

        {networkError ? (
          <div className="min-h-[440px] flex items-center justify-center p-6">
            <p className="text-sm tone-red text-center">{networkError}</p>
          </div>
        ) : !selectedEntityKey || (loadingNetwork && !networkData) ? (
          <div className="min-h-[440px] flex items-center justify-center p-6">
            <p className="text-sm text-[var(--color-text-dim)]">Loading the Oracle property graph...</p>
          </div>
        ) : entities.length ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <NetworkCanvas
                entities={renderedEntities}
                relationships={renderedRelationships}
                centerKey={center?.entityKey}
                onEntitySelect={setSelectedEntityKey}
              />
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 py-3 border-t border-[var(--color-border)]">
                {entityTypes.map((entityType) => (
                  <span key={entityType} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: entityColor(entityType) }} aria-hidden="true" />
                    {displayLabel(entityType)}
                  </span>
                ))}
              </div>
            </div>

            <aside className="border-t lg:border-t-0 lg:border-l border-[var(--color-border)] p-4 min-w-0">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="tone-sienna" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Center Entity</h3>
              </div>
              <p className="text-base font-bold mt-3 break-words">{center?.displayName || center?.entityKey}</p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1 leading-relaxed">{center?.description || 'No entity description is available.'}</p>

              <div className="grid grid-cols-2 gap-3 my-4">
                <GraphMetric label="Risk score" value={center?.riskScore ?? '-'} helper={displayLabel(center?.entityType)} />
                <GraphMetric label="Volume" value={formatNumber(center?.volumeCount)} helper={center?.operationsDomain || 'operations'} />
              </div>

              <dl className="border-y border-[var(--color-border)]">
                <ProvenanceRow label="Entity key" value={center?.entityKey} mono />
                <ProvenanceRow label="Source object" value={center?.sourceObject} mono />
                <ProvenanceRow label="Source key" value={center?.sourceKey} mono />
                <ProvenanceRow label="Dataset version" value={center?.datasetVersion || networkData?.datasetVersion} mono />
                <ProvenanceRow label="Provenance" value={centerHasProvenance ? 'Source-linked relational row' : 'Relational source unavailable'} />
                {centerHasProvenance ? (
                  <ProvenanceRow label="Source verification" value={center?.verified ? 'Verified' : 'Not verified'} />
                ) : null}
              </dl>

              {(center?.city || center?.region) ? (
                <p className="flex items-center gap-2 mt-4 text-xs text-[var(--color-text-dim)]">
                  <MapPin size={13} aria-hidden="true" /> {[center.city, center.region].filter(Boolean).join(', ')}
                </p>
              ) : null}
              <p className="flex items-center gap-2 mt-3 text-xs text-[var(--color-text-dim)]">
                {centerHasProvenance && center?.verified ? <ShieldCheck size={13} className="tone-pine" aria-hidden="true" /> : <Database size={13} aria-hidden="true" />}
                {provenanceText(center)} · {networkData?.executionMode}
              </p>
            </aside>
          </div>
        ) : (
          <div className="min-h-[440px] flex items-center justify-center p-6">
            <p className="text-sm text-[var(--color-text-dim)]">No graph entities are visible for this user context.</p>
          </div>
        )}
      </section>

      <RiskCases cases={cases} />
    </div>
  );
}
