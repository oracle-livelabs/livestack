import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Network,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { RetailSceneStory } from '../components/RetailStory';
import ReturnInvestigationWorkspace from '../components/returns/ReturnInvestigationWorkspace';
import ReturnDecisionLifecycle from '../components/returns/ReturnDecisionLifecycle';
import { JetButton, JetInputText, JetSelectSingle, JetProgressCircle } from '../components/JetControls';
import { useUser } from '../context/UserContext';

const RISK_OPTIONS = [
  { value: '', label: 'All risk' },
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Very High', label: 'Very High' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'Needs Review', label: 'Needs Review' },
  { value: 'In Review', label: 'In Review' },
  { value: 'Approved Draft', label: 'Approved Draft' },
  { value: 'Denied Draft', label: 'Denied Draft' },
  { value: 'Needs Info Draft', label: 'Needs Info Draft' },
];

function riskColor(risk) {
  switch (risk) {
    case 'Very High': return '#C74634';
    case 'High': return '#AA643B';
    case 'Medium': return '#437C94';
    case 'Low': return '#4C825C';
    default: return '#7A736E';
  }
}

function StatCard({ label, value, sub, icon: Icon, tone = '#437C94' }) {
  return (
    <div className="glass-card p-4 border border-[var(--color-border)]/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold font-mono">{value}</p>
          {sub && <p className="mt-1 text-xs text-[var(--color-text-dim)]">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${tone}18`, color: tone }}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ReturnQueue({ requests, selectedId, loading, onSelect }) {
  const rows = Array.isArray(requests) ? requests : [];

  if (loading) {
    return (
      <div className="glass-card p-5 flex items-center gap-3 text-sm text-[var(--color-text-dim)]">
        <JetProgressCircle value={-1} size="sm" /> Loading return queue...
      </div>
    );
  }

  if (!rows.length) {
    return <div className="glass-card p-5 text-sm text-[var(--color-text-dim)]">No returns match the selected filters.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((item) => {
        const selected = String(item.RETURN_ID) === String(selectedId);
        return (
          <button
            key={item.RETURN_ID}
            type="button"
            onClick={() => onSelect(item.RETURN_ID)}
            className={`glass-card p-4 w-full text-left transition-colors ${selected ? 'border border-teal-soft' : 'border border-transparent hover:border-[var(--color-border)]'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-mono text-[var(--color-text-dim)]">RET-{String(item.RETURN_ID).padStart(4, '0')}</span>
                  <span
                    className="px-2 py-0.5 text-[10px] font-semibold rounded-full"
                    style={{ background: `${riskColor(item.RISK_RATING)}1f`, color: riskColor(item.RISK_RATING), border: `1px solid ${riskColor(item.RISK_RATING)}55` }}
                  >
                    {item.RISK_RATING} risk
                  </span>
                  <span className="text-[11px] text-[var(--color-text-dim)]">{item.STATUS}</span>
                </div>
                <p className="font-medium truncate">{item.PRODUCT_NAME}</p>
                <p className="text-xs text-[var(--color-text-dim)] truncate">{item.CUSTOMER_NAME} · {item.RETURN_REASON}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono font-semibold">{formatCurrency(item.RETURN_VALUE)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">{Math.round((item.CONFIDENCE_SCORE || 0) * 100)}% confidence</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EvidenceList({ documents = [], analysis, analysisError, onAnalyze, analyzing }) {
  const rows = Array.isArray(documents) ? documents : [];

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><FileSearch size={17} className="tone-teal" /> Evidence matches</h3>
          <p className="text-xs text-[var(--color-text-dim)]">Policy, images, WMS scans, and history snippets ranked for the selected return.</p>
        </div>
        <JetButton
          label={analyzing ? 'Analyzing...' : 'Run Analysis'}
          chroming="callToAction"
          iconClass="oj-fwk-icon oj-fwk-icon-gear"
          disabled={analyzing}
          onAction={onAnalyze}
        />
      </div>

      {analysis?.explanation && (
        <div className="mb-4 p-3 rounded-lg border border-teal-soft bg-[var(--color-surface-muted)]/70">
          <p className="text-xs uppercase tracking-wider tone-teal mb-1">Analysis result</p>
          <p className="text-sm leading-relaxed">{analysis.explanation}</p>
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">Generated by relational SQL in the active Oracle VPD session.</p>
        </div>
      )}

      {analysisError && (
        <div
          className="mb-4 p-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-surface-muted)]/70"
          data-testid="returns-analysis-error"
          role="alert"
        >
          <p className="text-xs uppercase tracking-wider tone-red mb-1">Analysis could not run</p>
          <p className="text-sm leading-relaxed">{analysisError}</p>
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">The selected return and its stored evidence remain available for manual review.</p>
        </div>
      )}

      {analyzing && (
        <div className="mb-4 flex items-center gap-2 text-xs text-[var(--color-text-dim)]" role="status" aria-live="polite">
          <JetProgressCircle value={-1} size="sm" /> Running scoped Oracle SQL analysis...
        </div>
      )}

      <div className="space-y-3">
        {rows.map((doc, index) => (
          <div key={doc.DOCUMENT_ID || `${doc.TITLE}-${index}`} className="p-3 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg)]/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs tone-sienna font-semibold">{doc.DOCUMENT_TYPE}</p>
                <p className="text-sm font-medium">{doc.TITLE}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm" style={{ color: riskColor((doc.SIMILARITY_SCORE || 0) > 0.94 ? 'Low' : 'Medium') }}>
                  {Math.round((doc.SIMILARITY_SCORE || 0) * 100)}%
                </p>
                <p className="text-[10px] text-[var(--color-text-dim)]">match</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-dim)]">{doc.EXCERPT}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const CUSTOMER_GRAPH_COLORS = {
  customer: '#C74634',
  return: '#796087',
  order: '#437C94',
  product: '#4C825C',
};

const CUSTOMER_GRAPH_LABELS = {
  customer: 'Customer',
  return: 'Return',
  order: 'Order',
  product: 'Product',
};

function customerGraphNodeDetail(node) {
  if (node.type === 'customer') return `${node.tier || 'standard'} · ${formatCurrency(node.value || 0)} lifetime value`;
  if (node.type === 'return') return `${node.risk || 'Unknown'} risk · ${node.recommendation || 'Review'} · ${formatCurrency(node.value || 0)}`;
  if (node.type === 'order') return `${node.status || 'Unknown status'} · ${formatCurrency(node.value || 0)}`;
  return node.category || 'Retail product';
}

function CustomerGraphCanvas({ nodes, edges }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(640);
  const height = Math.max(310, Math.min(410, 280 + (nodes.length * 10)));

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const nextWidth = Math.round(element.getBoundingClientRect().width);
      if (nextWidth > 0) setWidth(nextWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !nodes.length || !width) return undefined;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const typePosition = (type) => {
      if (type === 'customer') return { x: width * 0.16, y: height * 0.5 };
      if (type === 'return') return { x: width * 0.45, y: height * 0.5 };
      if (type === 'order') return { x: width * 0.79, y: height * 0.3 };
      return { x: width * 0.79, y: height * 0.7 };
    };
    const graphNodes = nodes.map((node) => ({
      ...node,
      ...typePosition(node.type),
      radius: node.type === 'customer' ? 29 : node.type === 'return' ? 24 : 21,
    }));
    const graphEdges = edges.map((edge) => ({
      ...edge,
      source: edge.from,
      target: edge.to,
    }));
    const customerNode = graphNodes.find((node) => node.type === 'customer');
    if (customerNode) {
      customerNode.fx = width * 0.16;
      customerNode.fy = height / 2;
    }

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'customer-value-graph-arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-3.5L8,0L0,3.5')
      .attr('fill', '#6F757E');

    const layer = svg.append('g');
    const link = layer.selectAll('.customer-graph-link')
      .data(graphEdges)
      .join('line')
      .attr('class', 'customer-graph-link')
      .attr('stroke', '#6F757E')
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.4)
      .attr('marker-end', 'url(#customer-value-graph-arrow)');

    const edgeLabel = layer.selectAll('.customer-graph-edge-label')
      .data(graphEdges)
      .join('text')
      .attr('class', 'customer-graph-edge-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', 8)
      .attr('font-weight', 700)
      .attr('letter-spacing', '0.04em')
      .attr('fill', '#6F757E')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 4)
      .text((edge) => edge.label);

    const node = layer.selectAll('.customer-graph-node')
      .data(graphNodes)
      .join('g')
      .attr('class', 'customer-graph-node')
      .style('cursor', 'grab')
      .call(d3.drag()
        .on('start', (event, datum) => {
          if (!event.active) simulation.alphaTarget(0.25).restart();
          datum.fx = datum.x;
          datum.fy = datum.y;
        })
        .on('drag', (event, datum) => {
          datum.fx = event.x;
          datum.fy = event.y;
        })
        .on('end', (event, datum) => {
          if (!event.active) simulation.alphaTarget(0);
          if (datum.type !== 'customer') {
            datum.fx = null;
            datum.fy = null;
          }
        }));

    node.append('circle')
      .attr('r', (datum) => datum.radius)
      .attr('fill', (datum) => CUSTOMER_GRAPH_COLORS[datum.type] || '#6F757E')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2.5);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', '#FFFFFF')
      .attr('font-size', 10)
      .attr('font-weight', 700)
      .text((datum) => CUSTOMER_GRAPH_LABELS[datum.type]?.slice(0, 1) || '?');

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (datum) => datum.radius + 14)
      .attr('fill', 'var(--color-text)')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('paint-order', 'stroke')
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 4)
      .text((datum) => String(datum.label || '').length > 24 ? `${String(datum.label).slice(0, 22)}…` : datum.label);

    node.append('title')
      .text((datum) => `${CUSTOMER_GRAPH_LABELS[datum.type] || datum.type}: ${datum.label}\n${customerGraphNodeDetail(datum)}`);

    const simulation = d3.forceSimulation(graphNodes)
      .force('link', d3.forceLink(graphEdges).id((datum) => datum.id).distance((edge) => edge.type === 'submitted' ? 145 : 125).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-380))
      .force('x', d3.forceX((datum) => typePosition(datum.type).x).strength(0.42))
      .force('y', d3.forceY((datum) => typePosition(datum.type).y).strength(0.38))
      .force('collision', d3.forceCollide().radius((datum) => datum.radius + 42))
      .on('tick', () => {
        for (const datum of graphNodes) {
          datum.x = Math.max(datum.radius + 16, Math.min(width - datum.radius - 16, datum.x));
          datum.y = Math.max(datum.radius + 16, Math.min(height - datum.radius - 28, datum.y));
        }
        link
          .attr('x1', (edge) => edge.source.x)
          .attr('y1', (edge) => edge.source.y)
          .attr('x2', (edge) => {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy)) || 1;
            return edge.target.x - ((dx / distance) * (edge.target.radius + 5));
          })
          .attr('y2', (edge) => {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy)) || 1;
            return edge.target.y - ((dy / distance) * (edge.target.radius + 5));
          });
        edgeLabel
          .attr('x', (edge) => (edge.source.x + edge.target.x) / 2)
          .attr('y', (edge) => ((edge.source.y + edge.target.y) / 2)
            + (edge.type === 'for_product' ? 16 : -12));
        node.attr('transform', (datum) => `translate(${datum.x},${datum.y})`);
      });

    return () => simulation.stop();
  }, [edges, height, nodes, width]);

  return (
    <div ref={containerRef} className="w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block w-full rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface)]"
        role="img"
        aria-label={`Customer value property graph with ${nodes.length} vertices and ${edges.length} relationships`}
        data-testid="customer-value-property-graph"
      />
      <ul className="sr-only">
        {edges.map((edge) => (
          <li key={edge.id || `${edge.from}-${edge.to}`}>{edge.from} {edge.label} {edge.to}</li>
        ))}
      </ul>
    </div>
  );
}

function CustomerGraph({ graph, loading, error }) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const nodeTypes = [...new Set(nodes.map((node) => node.type))];

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold flex items-center gap-2"><Network size={17} className="tone-purple" /> Customer value graph</h3>
        <span className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider rounded-full border border-[var(--color-border)] text-[var(--color-text-dim)]">
          Property graph view
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">A VPD-scoped node-link projection of the customer, returns, originating orders, and products. Drag a vertex to inspect the topology.</p>

      {loading ? (
        <div className="min-h-[310px] rounded-lg border border-[var(--color-border)]/60 flex items-center justify-center gap-2 text-sm text-[var(--color-text-dim)]" role="status">
          <JetProgressCircle value={-1} size="sm" /> Loading customer relationships...
        </div>
      ) : error ? (
        <div className="min-h-[180px] rounded-lg border border-[var(--color-danger)]/35 flex items-center justify-center p-6 text-center" role="alert" data-testid="customer-value-graph-error">
          <div>
            <AlertTriangle size={20} className="tone-red mx-auto mb-2" />
            <p className="text-sm font-medium">Customer graph could not load</p>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">{error}</p>
          </div>
        </div>
      ) : nodes.length > 1 && edges.length ? (
        <>
          <CustomerGraphCanvas nodes={nodes} edges={edges} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[var(--color-text-dim)]">
            {nodeTypes.map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CUSTOMER_GRAPH_COLORS[type] || '#6F757E' }} />
                {CUSTOMER_GRAPH_LABELS[type] || type}
              </span>
            ))}
            <span className="ml-auto font-mono">{nodes.length} vertices · {edges.length} edges</span>
          </div>
          {graph?.projection?.execution && (
            <p className="mt-2 text-[10px] text-[var(--color-text-dim)] font-mono">{graph.projection.execution}</p>
          )}
        </>
      ) : (
        <div className="min-h-[180px] rounded-lg border border-[var(--color-border)]/60 flex items-center justify-center p-6 text-center" data-testid="customer-value-graph-empty">
          <div>
            <Network size={22} className="tone-purple mx-auto mb-2" />
            <p className="text-sm font-medium">No connected return history</p>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">This customer has no return relationships in the active VPD scope.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AskReturnFile({ selectedId, generationKey, caseContext, onOracleExecution }) {
  const [question, setQuestion] = useState('Why did Oracle recommend this return decision?');
  const [answer, setAnswer] = useState(null);
  const [askError, setAskError] = useState(null);
  const [asking, setAsking] = useState(false);
  const requestGeneration = useRef(0);
  const suggestions = [
    'Why is this recommendation being made?',
    'What policy applies to this return?',
    'What serial or accessory evidence was found?',
    'How many prior returns does this customer have?',
    'What happened in this case?',
  ];

  useEffect(() => {
    requestGeneration.current += 1;
    setAnswer(null);
    setAskError(null);
    setAsking(false);
    onOracleExecution?.(null);
  }, [generationKey, selectedId, onOracleExecution]);

  const ask = async (questionText) => {
    const askedQuestion = String(questionText || '').trim();
    if (!askedQuestion) return;
    setQuestion(askedQuestion);
    setAnswer(null);
    setAskError(null);
    setAsking(true);
    const requestId = ++requestGeneration.current;
    try {
      const result = await api.returns.ask(askedQuestion, selectedId);
      if (requestId === requestGeneration.current) {
        setAnswer(result);
        onOracleExecution?.(result?.oracle || null);
      }
    } catch (error) {
      if (requestId === requestGeneration.current) {
        setAskError(error?.message || 'The return evidence search could not run.');
        onOracleExecution?.(null);
      }
    } finally {
      if (requestId === requestGeneration.current) setAsking(false);
    }
  };

  const returnLabel = caseContext?.RETURN_ID
    ? `RET-${String(caseContext.RETURN_ID).padStart(4, '0')}`
    : 'Selected return';
  const noEvidence = answer?.status === 'not_found';

  return (
    <div className="glass-card p-5">
      <h3 className="text-base font-semibold flex items-center gap-2 mb-1"><Sparkles size={17} className="tone-teal" /> Ask the return file</h3>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Routes your question to VPD-scoped Oracle data, then blends AI Vector Search with lexical evidence signals across the selected return file.
      </p>
      <div className="mb-4 px-3 py-2.5 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg)]/40">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Active return file</p>
        <p className="text-sm font-medium mt-0.5">
          {returnLabel}
          {caseContext?.PRODUCT_NAME ? ` · ${caseContext.PRODUCT_NAME}` : ''}
          {caseContext?.CUSTOMER_NAME ? ` · ${caseContext.CUSTOMER_NAME}` : ''}
        </p>
      </div>
      <p className="text-xs font-medium mb-1.5">Question about this return</p>
      <div className="jet-control-row">
        <JetInputText value={question} placeholder="Ask about this return..." ariaLabel={`Question about ${returnLabel}`} className="jet-inline-field" disabled={asking} onValueChange={setQuestion} />
        <JetButton label={asking ? 'Searching...' : 'Ask'} chroming="callToAction" iconClass="oj-fwk-icon oj-fwk-icon-magnifier" disabled={asking} onAction={() => ask(question)} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3" aria-label="Suggested return questions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="min-h-11 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors text-left"
            disabled={asking}
            aria-label={`Ask: ${suggestion}`}
            onClick={() => ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {asking && (
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-text-dim)]" role="status" aria-live="polite">
          <JetProgressCircle value={-1} size="sm" /> Searching the active return file...
        </div>
      )}
      {askError && (
        <div className="mt-4 p-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-surface-muted)]/70" role="alert">
          <p className="text-xs uppercase tracking-wider tone-red mb-1">Evidence search could not run</p>
          <p className="text-sm leading-relaxed">{askError}</p>
        </div>
      )}
      {answer && (
        <div
          className={`mt-4 p-4 rounded-lg border bg-[var(--color-surface-muted)]/70 ${noEvidence ? 'border-[var(--color-sienna)]/45' : 'border-teal-soft'}`}
          role="status"
          aria-live="polite"
          data-testid={noEvidence ? 'return-question-no-evidence' : 'return-question-answer'}
        >
          <div className="flex items-start gap-2 mb-2">
            {noEvidence
              ? <AlertTriangle size={17} className="tone-sienna mt-0.5 flex-shrink-0" aria-hidden="true" />
              : <CheckCircle2 size={17} className="tone-teal mt-0.5 flex-shrink-0" aria-hidden="true" />}
            <div>
              <p className={`text-xs uppercase tracking-wider ${noEvidence ? 'tone-sienna' : 'tone-teal'}`}>
                {noEvidence
                  ? 'No supporting evidence found'
                  : answer.synthesis?.used
                    ? 'Cited grounded synthesis'
                    : 'Deterministic grounded answer'}
              </p>
              <p className="text-sm leading-relaxed mt-1">
                {answer.synthesis?.used
                  ? `${answer.synthesis.claims.length} validated claim${answer.synthesis.claims.length === 1 ? '' : 's'} from the active return file.`
                  : answer.summary || answer.answer}
              </p>
            </div>
          </div>

          {answer.synthesis?.used && (
            <div className="mt-4 space-y-2" aria-label="Cited synthesized claims">
              {answer.synthesis.claims.map((claim, index) => (
                <div key={`${claim.text}-${index}`} className="p-3 rounded-lg border border-teal-soft bg-[var(--color-bg)]/45">
                  <p className="text-sm leading-relaxed">{claim.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {claim.citations.map((citation) => (
                      <span key={citation} className="px-2 py-1 rounded border border-[var(--color-border)] font-mono text-[10px]">
                        {citation}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-[var(--color-text-dim)]">
                {answer.synthesis.model} · {answer.synthesis.confidence} confidence · claim citations validated
              </p>
            </div>
          )}

          {!noEvidence && answer.synthesis?.mode === 'deterministic_fallback' && (
            <p className="mt-3 text-[11px] tone-sienna" data-testid="return-synthesis-fallback">
              Model synthesis was unavailable or did not pass grounding validation. The deterministic Oracle-grounded answer is shown instead.
            </p>
          )}

          {(answer.sections || []).length > 1 && (
            <div className="mt-4 space-y-2" aria-label="Answer sections">
              {answer.sections.map((section) => (
                <div key={section.id} className="p-3 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg)]/45">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{section.title}</p>
                    {section.status === 'not_found' && <span className="text-[10px] tone-sienna">No matching evidence</span>}
                  </div>
                  <p className="text-sm leading-relaxed mt-1">{section.answer}</p>
                </div>
              ))}
            </div>
          )}

          {(answer.matchedEvidence || []).length > 0 && (
            <div className="mt-4" aria-label="Supporting evidence">
              <p className="text-xs font-semibold mb-2">Supporting evidence</p>
              <div className="space-y-2">
                {answer.matchedEvidence.map((item, index) => (
                  <div key={item.citation || `${item.sourceType}-${item.title}-${index}`} className="p-3 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg)]/45">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider tone-sienna">{item.sourceType || 'Evidence'}</p>
                        <p className="text-sm font-medium">{item.title}</p>
                      </div>
                      {Array.isArray(item.matchedTerms) && item.matchedTerms.length > 0 && (
                        <span className="text-[10px] text-[var(--color-text-dim)]">Matched: {item.matchedTerms.slice(0, 3).join(', ')}</span>
                      )}
                      {item.retrievalMode === 'oracle_vector_hybrid' && (
                        <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                          Vector {Math.round((item.semanticScore || 0) * 100)}% · hybrid {Math.round((item.hybridScore || 0) * 100)}%
                        </span>
                      )}
                    </div>
                    {item.text && (
                      <details className="mt-2 text-xs text-[var(--color-text-dim)]">
                        <summary className="cursor-pointer font-medium text-[var(--color-text)]">Inspect source evidence</summary>
                        <p className="mt-2 leading-relaxed">{item.text}</p>
                        {item.citation && <p className="mt-2 font-mono text-[10px]">{item.citation}</p>}
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <details className="mt-4 pt-3 border-t border-[var(--color-border)]/60 text-xs text-[var(--color-text-dim)]">
            <summary className="cursor-pointer font-medium text-[var(--color-text)]">How this answer was produced</summary>
            <p className="mt-2" data-testid="return-question-route">
              Routes: {(answer.intents || []).map((intent) => intent.label).join(' + ') || answer.routeLabel}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(answer.sources || []).map((source) => (
                <span key={source.label} className="px-2 py-1 rounded border border-[var(--color-border)] font-mono text-[10px]">
                  {source.label}
                </span>
              ))}
            </div>
            <p className="mt-2">
              {answer.oracle?.vectorUsed && answer.synthesis?.used
                ? `Oracle ${answer.oracle.model} vector retrieval (${answer.oracle.dimensions} dimensions) was blended with lexical matching in the active VPD session. Local ${answer.synthesis.model} then synthesized only the supplied evidence; claim citations passed the API allowlist validator.`
                : answer.oracle?.vectorUsed
                  ? `Oracle ${answer.oracle.model} vector retrieval (${answer.oracle.dimensions} dimensions) was blended with lexical matching in the active VPD session. The deterministic grounded answer was used because synthesis was skipped or rejected.`
                : 'The question was rejected as outside the return file without invoking evidence retrieval.'}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

function OracleInternalsPanel({ selectedId, analysis, askOracle }) {
  const selectedReturnLabel = selectedId
    ? `RET-${String(selectedId).padStart(4, '0')}`
    : 'selected return';

  return (
    <RegisterOraclePanel title="Returns Oracle Internals">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What&apos;s happening</p>
          <p className="text-sm leading-relaxed">
            Returns Intelligence runs three governed workloads. <span className="tone-teal font-medium">Run Analysis</span> reads canonical relational facts with deterministic SQL. <span className="tone-sienna font-medium">Ask the return file</span> retrieves current-generation evidence with Oracle AI Vector Search, blends cosine similarity with lexical coverage, and can pass only that cited packet to a local model for guarded synthesis. Admin decisions remain a separate explicit ACID transaction.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">Ask retrieval path</p>
          <div className="grid grid-cols-2 gap-2">
            <DiagramBox label="Question router" sub="deterministic intents" color="#437C94" />
            <DiagramBox label="Oracle VPD session" sub={selectedReturnLabel} color="#C74634" />
            <DiagramBox label="AI Vector Search" sub="top 8 cosine matches" color="#4F7D7B" />
            <DiagramBox label="Hybrid grounding" sub="72% vector + 28% lexical" color="#AA643B" />
            <DiagramBox label="Cited synthesis" sub="validated or fallback" color="#796087" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FeatureBadge label="Oracle AI Vector Search" color="cyan" />
          <FeatureBadge label="VECTOR(384, FLOAT32)" color="blue" />
          <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
          <FeatureBadge label="VECTOR_EMBEDDING" color="purple" />
          <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="purple" />
          <FeatureBadge label="IDX_RETURN_EVIDENCE_VEC" color="orange" />
          <FeatureBadge label="Generation-bound evidence" color="yellow" />
          <FeatureBadge label="Oracle VPD" color="red" />
          <FeatureBadge label="DBMS_SESSION identity" color="red" />
          <FeatureBadge label="Local Ollama synthesis" color="purple" />
          <FeatureBadge label="Citation allowlist" color="green" />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">SQL used by Ask the return file</p>
          <SqlBlock code={`SELECT evidence_id, return_id, source_type, source_id,
       title, evidence_text, generation_id,
       ROUND(1 - distance_score, 6) AS similarity_score
FROM (
  SELECT /*+ GATHER_PLAN_STATISTICS */
         evidence_id, return_id, source_type, source_id, title,
         CAST(evidence_text AS VARCHAR2(4000)) AS evidence_text,
         generation_id,
         VECTOR_DISTANCE(
           embedding,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2 USING :question AS DATA
           ),
           COSINE
         ) AS distance_score
  FROM return_evidence_index
  WHERE return_id = :return_id
    AND generation_id = :generation_id
  ORDER BY distance_score
  FETCH APPROXIMATE FIRST :top_k ROWS ONLY
)
ORDER BY distance_score, evidence_id;`} />
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
            Oracle supplies the semantic candidates. The Express service fuses their cosine similarity (72%) with matched question terms (28%), then grounds the routed answer in those rows and canonical relational facts.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
            The local model cannot query Oracle or write decisions. It receives only compact source IDs and facts already returned through VPD, and every generated claim must cite that allowlist. Invalid, timed-out, or unavailable synthesis falls back to the deterministic answer.
          </p>
        </div>

        {askOracle && (
          <div className="rounded-lg border border-[var(--color-border)] p-3 text-xs" data-testid="returns-vector-execution">
            <p className="font-semibold mb-1">Latest Ask execution</p>
            {askOracle.vectorUsed ? (
              <p className="tone-pine font-mono leading-relaxed">
                {askOracle.model} · {askOracle.dimensions} dimensions · {askOracle.indexName} · {askOracle.candidateCount} candidates
                {askOracle.generationId ? ` · ${askOracle.generationId}` : ''}
                <br />
                {askOracle.synthesisUsed
                  ? `Synthesis: ${askOracle.synthesisModel} · validated`
                  : `Synthesis: ${askOracle.synthesisMode}${askOracle.synthesisReason ? ` · ${askOracle.synthesisReason}` : ''}`}
              </p>
            ) : (
              <p className="tone-sienna">Vector retrieval was skipped because the question was routed out of scope.</p>
            )}
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">Deterministic analysis read</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <FeatureBadge label="Relational SQL" color="orange" />
            <FeatureBadge label="Bind variables" color="green" />
            <FeatureBadge label="VPD-scoped rows" color="red" />
          </div>
          <SqlBlock code={`-- Canonical case facts used by Run Analysis
SELECT rr.return_id, rr.risk_rating, rr.recommendation,
       rr.damage_description, rr.policy_clause,
       rr.confidence_score, p.product_name, p.category,
       c.customer_tier, c.lifetime_value,
       (SELECT COUNT(*)
          FROM return_requests prior_rr
         WHERE prior_rr.customer_id = rr.customer_id
           AND prior_rr.return_id <> rr.return_id) AS prior_return_count
FROM return_requests rr
LEFT JOIN products p ON p.product_id = rr.product_id
LEFT JOIN customers c ON c.customer_id = rr.customer_id
WHERE rr.return_id = :id;

-- Stored evidence matches shown by Run Analysis
SELECT document_type, title, excerpt, similarity_score
FROM return_documents
WHERE return_id = :id
ORDER BY similarity_score DESC NULLS LAST
FETCH FIRST 5 ROWS ONLY;`} />
        </div>

        {analysis?.oracle && (
          <div className="text-xs text-[var(--color-text-dim)] leading-relaxed">
            <p className="font-semibold text-[var(--color-text)] mb-1">Latest Run Analysis execution</p>
            <p><span className="tone-teal">Route:</span> {analysis.oracle.route}</p>
            <p><span className="tone-teal">Execution:</span> {analysis.oracle.execution}</p>
            <p><span className="tone-teal">Features:</span> {(analysis.oracle.features || []).join(', ')}</p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">Customer value graph</p>
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed mb-2">
            This visualization is an application-side graph projection assembled from VPD-scoped relational rows. It does not execute <span className="font-mono">GRAPH_TABLE</span> and is not presented as an Oracle Property Graph workload; native SQL/PGQ is demonstrated in Creator Influence Network.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <FeatureBadge label="Relational graph projection" color="blue" />
            <FeatureBadge label="Oracle VPD" color="red" />
            <FeatureBadge label="No SQL/PGQ in this card" color="yellow" />
          </div>
          <SqlBlock code={`SELECT rr.return_id, rr.order_id, rr.product_id,
       rr.risk_rating, rr.recommendation, rr.status,
       rr.return_value, p.product_name, p.category,
       o.order_status, o.order_total
FROM return_requests rr
LEFT JOIN products p ON p.product_id = rr.product_id
LEFT JOIN orders o ON o.order_id = rr.order_id
WHERE rr.customer_id = :customer_id
ORDER BY rr.created_at DESC;`} />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">Governed Admin decision lifecycle</p>
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed mb-2">
            A draft proposal preserves the original AI recommendation and can be edited without changing the return. Finalization requires Jessica Chen's explicit Admin confirmation, an idempotency key, and matching proposal/case versions. One transaction inserts the human decision, immutable provenance and customer response, advances the case, appends its event/outbox records, refreshes this return's current-generation vector evidence, and only then commits. The AI recommendation is never overwritten.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="ACID transaction" color="blue" />
            <FeatureBadge label="Admin-only DML" color="red" />
            <FeatureBadge label="Idempotent + versioned" color="green" />
            <FeatureBadge label="Unified Audit (core DML)" color="purple" />
          </div>
          <div className="mt-2">
            <SqlBlock code={`-- Editable proposal: runtime metadata only; no case decision yet
INSERT INTO return_decision_proposals (
  proposal_id, return_id, owner_username, dataset_generation_id,
  decision_type, customer_response, evidence_snapshot,
  ai_recommendation, policy_clause, case_version, status, version
) VALUES (
  :proposal_id, :return_id, :reviewer, :generation_id,
  :decision, :customer_response, :server_evidence_json,
  :ai_recommendation, :policy_clause, :case_version, 'DRAFT', 0
);

-- Explicitly confirmed final transaction (abridged)
INSERT INTO return_decisions (
  return_id, decision_type, decision_summary,
  confidence_score, created_by
) VALUES (:return_id, :decision, :reviewer_notes, NULL, :reviewer)
RETURNING decision_id INTO :decision_id;

INSERT INTO return_decision_provenance (
  decision_id, return_id, proposal_id, reviewer_username,
  dataset_generation_id, ai_recommendation, policy_clause,
  evidence_snapshot, decision_payload
) VALUES (
  :decision_id, :return_id, :proposal_id, :reviewer,
  :generation_id, :ai_recommendation, :policy_clause,
  :server_evidence_json, :decision_json
);

INSERT INTO return_customer_messages (
  return_id, decision_id, proposal_id, message_text,
  delivery_status, created_by
) VALUES (
  :return_id, :decision_id, :proposal_id, :customer_response,
  'RECORDED', :reviewer
);

UPDATE return_requests
SET status = :status,
    decision_version = decision_version + 1
WHERE return_id = :return_id
  AND decision_version = :case_version
  AND recommendation = :ai_recommendation;

INSERT INTO return_events (return_id, event_type, event_note, actor)
VALUES (:return_id, 'Reviewer Decision Finalized', :event_note, :reviewer);

BEGIN
  retail_return_evidence_pkg.refresh_return(:return_id, :generation_id);
END;

COMMIT;`} />
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
              <span className="font-mono">RETAIL_OPERATION_AUDIT</span> covers the core <span className="font-mono">RETURN_DECISIONS INSERT</span> and <span className="font-mono">RETURN_REQUESTS UPDATE</span>. The proposal, provenance, message, event, command, and outbox rows are application transaction records; they are not mislabeled as Unified Audit records.
            </p>
          </div>
        </div>
      </div>
    </RegisterOraclePanel>
  );
}

export default function ReturnsIntelligence() {
  const { currentUser } = useUser();
  const [risk, setRisk] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [askOracle, setAskOracle] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [graph, setGraph] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const manualRequestGeneration = useRef(0);
  const generationKey = `${currentUser?.USERNAME || 'anonymous'}:${datasetRevision}`;
  const handleInvestigationChange = useCallback((investigation) => {
    const latestTurn = investigation?.turns?.at(-1);
    setAskOracle(latestTurn?.answerPayload?.oracle || null);
  }, []);

  useEffect(() => {
    const reset = () => {
      manualRequestGeneration.current += 1;
      setSelectedId(null);
      setAnalysis(null);
      setAskOracle(null);
      setAnalysisError(null);
      setGraph(null);
      setGraphLoading(false);
      setGraphError(null);
      setAnalyzing(false);
      setDatasetRevision((value) => value + 1);
    };
    window.addEventListener('retail-dataset-revision', reset);
    return () => window.removeEventListener('retail-dataset-revision', reset);
  }, []);

  useEffect(() => {
    manualRequestGeneration.current += 1;
    setSelectedId(null);
    setAnalysis(null);
    setAskOracle(null);
    setAnalysisError(null);
    setGraph(null);
    setGraphLoading(false);
    setGraphError(null);
    setAnalyzing(false);
  }, [currentUser?.USERNAME]);

  const requestParams = useMemo(() => ({ ...(risk && { risk }), ...(status && { status }), limit: 25 }), [risk, status]);
  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useData(() => api.returns.summary(), [currentUser?.USERNAME, datasetRevision], { initialData: { summary: {}, byStatus: [], byRisk: [] } });
  const { data: requestsData, loading: queueLoading, refetch: refetchRequests } = useData(() => api.returns.list(requestParams), [risk, status, currentUser?.USERNAME, datasetRevision], { initialData: [] });
  const { data: detail, loading: detailLoading, refetch: refetchDetail } = useData(
    () => selectedId ? api.returns.detail(selectedId) : Promise.resolve(null),
    [selectedId, currentUser?.USERNAME, datasetRevision],
    { autoFetch: Boolean(selectedId) }
  );
  const handleDecisionLifecycleChange = useCallback(() => {
    refetchDetail();
    refetchRequests();
    refetchSummary();
  }, [refetchDetail, refetchRequests, refetchSummary]);
  const requests = Array.isArray(requestsData) ? requestsData : [];

  useEffect(() => {
    if (!selectedId && requests.length) setSelectedId(requests[0].RETURN_ID);
  }, [requests, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function loadGraph() {
      const customerId = detail?.request?.CUSTOMER_ID;
      if (!customerId) {
        setGraph(null);
        setGraphLoading(false);
        setGraphError(null);
        return;
      }
      setGraph(null);
      setGraphLoading(true);
      setGraphError(null);
      try {
        const data = await api.returns.customerGraph(customerId);
        if (!cancelled) setGraph(data);
      } catch (error) {
        if (!cancelled) setGraphError(error?.message || 'The scoped customer graph request failed.');
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    }
    loadGraph();
    return () => { cancelled = true; };
  }, [detail?.request?.CUSTOMER_ID]);

  const runAnalysis = useCallback(async () => {
    if (!selectedId) return;
    setAnalysisError(null);
    setAnalyzing(true);
    const requestId = ++manualRequestGeneration.current;
    try {
      const result = await api.returns.analyze(selectedId);
      if (requestId === manualRequestGeneration.current) {
        setAnalysis(result);
        setAnalysisError(null);
      }
    } catch (error) {
      if (requestId === manualRequestGeneration.current) {
        setAnalysis(null);
        setAnalysisError(error?.message || 'The return analysis request failed.');
      }
    } finally {
      if (requestId === manualRequestGeneration.current) setAnalyzing(false);
    }
  }, [selectedId]);

  const summary = summaryData?.summary || {};
  const docs = Array.isArray(detail?.documents) ? detail.documents : [];
  const events = Array.isArray(detail?.events) ? detail.events : [];

  return (
    <div className="space-y-5 fade-in">
      <OracleInternalsPanel selectedId={selectedId} analysis={analysis} askOracle={askOracle} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><RotateCcw size={22} className="tone-teal" /> Sporting Goods Returns Support</h2>
          <p className="text-sm text-[var(--color-text-dim)] max-w-3xl">
            Triage high-value returns with policy evidence, scoped customer history, transactional decisions, and database auditability.
          </p>
        </div>
        <JetButton
          label="Refresh"
          iconClass="oj-fwk-icon oj-fwk-icon-refresh"
          chroming="outlined"
          onAction={() => { refetchSummary(); refetchRequests(); if (selectedId) refetchDetail(); }}
        />
      </div>

      <RetailSceneStory scene="returns" />

      {summaryError && (
        <div
          className="glass-card p-4 border border-[var(--color-danger)]/40"
          data-testid="returns-summary-unavailable"
          role="alert"
        >
          <p className="font-semibold tone-red">
            Oracle Returns Intelligence is unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            The scoped return summary endpoint failed, so zero-value return
            evidence is not presented as a healthy result.
          </p>
        </div>
      )}

      {!summaryError && (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <StatCard label="Open returns" value={summaryLoading ? '...' : formatNumber(summary.TOTAL_RETURNS || 0)} sub="active queue" icon={ClipboardList} tone="#437C94" />
        <StatCard label="High-risk returns" value={summaryLoading ? '...' : formatNumber(summary.HIGH_RISK || 0)} sub="policy or exception review" icon={ShieldAlert} tone="#C74634" />
        <StatCard label="Auto-approve candidates" value={summaryLoading ? '...' : formatNumber(summary.AUTO_APPROVE || 0)} sub="low-friction saves" icon={CheckCircle2} tone="#4C825C" />
        <StatCard label="Return exposure" value={summaryLoading ? '...' : formatCurrency(summary.EXPOSURE_VALUE || 0)} sub="return value" icon={RefreshCw} tone="#AA643B" />
        <StatCard label="Avg decision confidence" value={summaryLoading ? '...' : `${Math.round((summary.AVG_CONFIDENCE || 0) * 100)}%`} sub="average score" icon={BrainCircuit} tone="#796087" />
      </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-5">
        <aside className="returns-workbench-queue space-y-3">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Return queue</h3>
              <span className="text-xs text-[var(--color-text-dim)]">{requests.length} cases</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 mb-4">
              <JetSelectSingle value={risk} options={RISK_OPTIONS} placeholder="Risk" ariaLabel="Risk filter" onValueChange={setRisk} />
              <JetSelectSingle value={status} options={STATUS_OPTIONS} placeholder="Status" ariaLabel="Status filter" onValueChange={setStatus} />
            </div>
            <ReturnQueue requests={requests} selectedId={selectedId} loading={queueLoading} onSelect={(id) => { setSelectedId(id); setAnalysis(null); setAnalysisError(null); setAskOracle(null); }} />
          </div>
        </aside>

        <section className="space-y-5">
          {detailLoading || !detail?.request ? (
            <div className="glass-card p-8 flex items-center gap-3 text-sm text-[var(--color-text-dim)]">
              <JetProgressCircle value={-1} size="sm" /> Select a return to inspect policy, evidence, and customer context.
            </div>
          ) : (
            <>
              <div className="glass-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[11px] font-mono text-[var(--color-text-dim)]">RET-{String(detail.request.RETURN_ID).padStart(4, '0')}</span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full" style={{ color: riskColor(detail.request.RISK_RATING), background: `${riskColor(detail.request.RISK_RATING)}1f`, border: `1px solid ${riskColor(detail.request.RISK_RATING)}55` }}>{detail.request.RISK_RATING} risk</span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{detail.request.STATUS}</span>
                    </div>
                    <h3 className="text-lg font-semibold">{detail.request.PRODUCT_NAME}</h3>
                    <p className="text-sm text-[var(--color-text-dim)]">{detail.request.CUSTOMER_NAME} · {detail.request.CUSTOMER_TIER} · {detail.request.CITY}, {detail.request.STATE_PROVINCE}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold font-mono">{formatCurrency(detail.request.RETURN_VALUE)}</p>
                    <p className="text-xs text-[var(--color-text-dim)]">Requested {formatDate(detail.request.REQUESTED_AT || detail.request.CREATED_AT)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
                  <div className="p-3 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg)]/40">
                    <p className="text-xs text-[var(--color-text-dim)]">Reason</p>
                    <p className="text-sm font-medium">{detail.request.RETURN_REASON}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg)]/40">
                    <p className="text-xs text-[var(--color-text-dim)]">Policy</p>
                    <p className="text-sm font-medium">{detail.request.POLICY_CLAUSE}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg)]/40">
                    <p className="text-xs text-[var(--color-text-dim)]">Recommendation</p>
                    <p className="text-sm font-medium">{detail.request.RECOMMENDATION} · {Math.round((detail.request.CONFIDENCE_SCORE || 0) * 100)}%</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-dim)]">{detail.request.DAMAGE_DESCRIPTION}</p>
              </div>

              <EvidenceList documents={analysis?.matches || docs} analysis={analysis} analysisError={analysisError} onAnalyze={runAnalysis} analyzing={analyzing} />

              <ReturnDecisionLifecycle
                returnId={selectedId}
                generationKey={generationKey}
                caseContext={detail.request}
                personaKey={currentUser?.USERNAME}
                personaRole={currentUser?.ROLE}
                datasetRevision={datasetRevision}
                onLifecycleChange={handleDecisionLifecycleChange}
              />

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
                <CustomerGraph graph={graph} loading={graphLoading} error={graphError} />
                <ReturnInvestigationWorkspace
                  returnId={selectedId}
                  generationKey={generationKey}
                  caseContext={detail.request}
                  personaKey={currentUser?.USERNAME}
                  datasetRevision={datasetRevision}
                  onInvestigationChange={handleInvestigationChange}
                />
              </div>

              <div className="glass-card p-5">
                <h3 className="text-base font-semibold mb-3">Operational event history</h3>
                <div className="space-y-2">
                  {events.map((event) => (
                    <div key={event.EVENT_ID} className="flex items-start gap-3 text-sm">
                      <div className="mt-1 w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                      <div>
                        <p className="font-medium">{event.EVENT_TYPE} <span className="text-xs text-[var(--color-text-dim)]">· {event.ACTOR} · {formatDate(event.CREATED_AT)}</span></p>
                        <p className="text-xs text-[var(--color-text-dim)]">{event.EVENT_NOTE}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
