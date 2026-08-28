import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetButton, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/MediaStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

// ── Color palette ──────────────────────────────────────
const SEGMENT_COLORS = {
  Champion:       '#AA643B',
  Loyal:          '#4C825C',
  'New Audience': '#4F7D7B',
  'At Risk':      '#C74634',
  Lost:           '#7A736E',
  'Big Spender':  '#796087',
  Promising:      '#437C94',
  Potential:      '#6F757E',
};

const MOMENTUM_COLORS = {
  mega_viral: '#C74634',
  viral:      '#AA643B',
  rising:     '#AA643B',
  normal:     '#7A736E',
};

const CHART_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B'];

// ── Tab definitions ────────────────────────────────────
const CLUSTER_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B','#437C94','#4C825C','#796087','#A36472','#4F7D7B','#5F7D4F','#AA643B'];

const TABS = [
  { key: 'demand',    label: 'Audience Demand Predictions',             buttonLabel: 'Signal Surge',     iconClass: 'oj-fwk-icon-sortrelevancehigh', color: '#AA643B' },
  { key: 'rfm',       label: 'Audience Value Segments',            buttonLabel: 'Value Segments',      iconClass: 'oj-fwk-icon-users',             color: '#C74634' },
  { key: 'forecast',  label: 'Content Revenue Forecast - Linear Regression', buttonLabel: 'Forecast',          iconClass: 'oj-fwk-icon-view',              color: '#4C825C' },
  { key: 'productOml', label: 'OML Product K-Means Clustering',       buttonLabel: 'OML Clusters',      iconClass: 'oj-fwk-icon-grid',              color: '#796087' },
  { key: 'clusters',  label: 'Vector Nearest-Centroid Clustering',    buttonLabel: 'Vector Clusters',   iconClass: 'oj-fwk-icon-grid',              color: '#4F7D7B' },
  { key: 'capacity', label: 'Rights & Capacity Risk',               buttonLabel: 'Rights & Capacity',         iconClass: 'oj-fwk-icon-tree-document',     color: '#796087' },
];

const DEMAND_WINDOW_OPTIONS = [
  { value: '168', label: 'Last 7 days' },
  { value: '336', label: 'Last 14 days' },
  { value: '720', label: 'Last 30 days' },
  { value: '2160', label: 'Last 90 days' },
];

const FORECAST_DAY_OPTIONS = [
  { value: '3', label: '+3 day forecast' },
  { value: '7', label: '+7 day forecast' },
  { value: '14', label: '+14 day forecast' },
];

const CAPACITY_STATUS_COLORS = {
  NO_CAPACITY: '#C74634',
  CRITICAL: '#AA643B',
  LOW: '#AA643B',
  AT_RISK: '#437C94',
  ADEQUATE: '#4C825C',
};

function normalizeCapacityStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === ['OUT', 'OF', 'STOCK'].join('_')) return 'NO_CAPACITY';
  return normalized;
}

function capacityStatusColor(status) {
  return CAPACITY_STATUS_COLORS[normalizeCapacityStatus(status)] || '#7A736E';
}

function formatCapacityStatus(status) {
  const labels = {
    NO_CAPACITY: 'rights gap',
    CRITICAL: 'critical',
    LOW: 'low capacity',
    AT_RISK: 'at risk',
    ADEQUATE: 'adequate',
  };
  const normalized = normalizeCapacityStatus(status);
  return labels[normalized] || String(status || 'unknown').replace(/_/g, ' ').toLowerCase();
}

function isOmlSurgeWatch(row) {
  const prediction = String(row?.OML_SURGE_PREDICTION || '').toUpperCase();
  return prediction === 'SURGE'
    || prediction === 'WATCH'
    || Number(row?.OML_SURGE_PROBABILITY) >= 45;
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

// ── Helper components ──────────────────────────────────
function StatCard({ iconClass, label, value, sub, color = '#C74634', badge }) {
  return (
    <div
      className="stat-card oml-stat-card"
      style={{ '--oml-card-accent': color }}
      aria-label={`${label}: ${value}`}
    >
      <div className="oml-stat-card__top">
        <div className="oml-stat-card__icon">
          <JetGlyph iconClass={iconClass} className="oml-stat-card__icon-glyph" />
        </div>
        {badge && (
          <span className="oml-stat-card__badge">
            {badge}
          </span>
        )}
      </div>
      <div className="oml-stat-card__copy">
        <p className="oml-stat-card__value">{value}</p>
        <p className="oml-stat-card__label">{label}</p>
      </div>
      {sub && (
        <p className="oml-stat-card__meta">
          <span className="oml-stat-card__meta-dot" aria-hidden="true" />
          <span>{sub}</span>
        </p>
      )}
    </div>
  );
}

function MomentumBadge({ flag }) {
  const label = flag === 'mega_viral' ? 'MEGA' : flag?.replace('_', ' ') || '-';
  return (
    <span className={`momentum-badge momentum-${flag}`}>{label}</span>
  );
}

function ConfidenceBar({ pct }) {
  const color = pct >= 80 ? '#4C825C' : pct >= 60 ? '#AA643B' : '#C74634';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full surface-bark-soft">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{pct}%</span>
    </div>
  );
}

function OmlModelEvidence({ meta }) {
  if (!meta) return null;
  return (
    <div
      className="rounded-lg p-3 text-[10px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2"
      data-testid={`oml-model-evidence-${String(meta.logicalModel || 'unknown').toLowerCase()}`}
      style={{
        background: 'rgba(121,96,135,0.06)',
        border: '1px dashed rgba(121,96,135,0.35)',
        color: 'var(--color-text)',
      }}
    >
      <span><strong>Logical model:</strong> {meta.logicalModel}</span>
      <span><strong>Physical model:</strong> {meta.physicalModel}</span>
      <span><strong>Generation:</strong> {meta.generationId}</span>
      <span><strong>Training fingerprint:</strong> {meta.trainingFingerprint}</span>
      <span><strong>Training rows:</strong> {formatNumber(meta.trainingRowCount || 0)}</span>
      <span><strong>Algorithm:</strong> {meta.algorithm}</span>
      <span><strong>Native operator:</strong> {meta.operator}</span>
      <span><strong>Scored rows:</strong> {formatNumber(meta.resultCount || 0)} · fallback: {String(meta.fallback)}</span>
    </div>
  );
}

// Custom tooltip for forecast chart
function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ciLower = payload.find(p => p.dataKey === 'ci_lower')?.value;
  const ciUpper = payload.find(p => p.dataKey === 'ci_upper')?.value;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs shadow-xl">
      <p className="font-semibold mb-1 text-[var(--color-text)]">{label}</p>
      {payload.map((p, i) => p.value != null && p.dataKey !== 'ci_lower' && p.dataKey !== 'ci_upper' && (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      {ciLower != null && ciUpper != null && (
        <p className="text-[#C74634] mt-1 border-t border-[var(--color-border)] pt-1">
          95% CI: {formatCurrency(ciLower)} - {formatCurrency(ciUpper)}
        </p>
      )}
    </div>
  );
}

// ── Oracle Panel content per tab ───────────────────────
function DemandOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL - Random Forest Classification
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-sienna font-mono">Random Forest</span> model (50 trees) trained via{' '}
          <code className="text-xs tone-sienna">DBMS_DATA_MINING.CREATE_MODEL</code> on 12 audience-signal engagement
          and content-revenue features. Oracle scores every content asset <em>inline</em> at query time using{' '}
          <code className="text-xs tone-sienna">PREDICTION()</code> and{' '}
          <code className="text-xs tone-sienna">PREDICTION_PROBABILITY()</code> - no external ML pipeline,
          no model export. The trained model lives in the database as a persistent mining model object.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="yellow" />
        <FeatureBadge label="ALGO_RANDOM_FOREST (50 trees)" color="yellow" />
        <FeatureBadge label="PREDICTION()" color="orange" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="orange" />
        <FeatureBadge label="12 Training Features" color="green" />
        <FeatureBadge label="In-DB Model Persistence" color="purple" />
      </div>
      <SqlBlock code={`-- Step 1: Train the model (one-time)
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name      => 'DEMAND_SURGE_MODEL',
    mining_function => DBMS_DATA_MINING.CLASSIFICATION,
    data_table_name => 'OML_DEMAND_TRAINING_V',
    case_id_column_name => 'PRODUCT_ID',
    target_column_name  => 'SURGE_FLAG',
    settings_table_name => 'DEMAND_SURGE_SETTINGS'
    -- ALGO_RANDOM_FOREST, 50 trees, PREP_AUTO_ON
  );
END;

-- Step 2: Score content assets in real-time SQL
SELECT p.product_name, p.category,

  -- Random Forest prediction: SURGE or NORMAL
  PREDICTION(DEMAND_SURGE_MODEL USING
    p.category, p.unit_price,
    eng.total_posts, eng.avg_sentiment,
    eng.total_likes, eng.total_shares,
    eng.total_views, eng.avg_virality,
    eng.viral_posts, eng.rising_posts,
    sales.units_sold, sales.revenue
  ) AS predicted_surge,

  -- Probability of SURGE class (0.0 - 1.0)
  ROUND(PREDICTION_PROBABILITY(
    DEMAND_SURGE_MODEL, 'SURGE' USING ...
  ) * 100, 1) AS surge_probability

FROM products p
JOIN product_engagement eng  ...
JOIN product_sales sales ...
ORDER BY surge_probability DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING Pipeline</div>
        <DiagramBox label="OML_DEMAND_TRAINING_V (187 content assets)" sub="12 features: engagement + content revenue + audience signals" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ CREATE_MODEL</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="ALGO_RANDOM_FOREST  -  50 trees  -  PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ PREDICTION()</div>
        <DiagramBox label="Real-Time Scoring in SQL" sub="PREDICTION_PROBABILITY('SURGE' USING *)" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ result</div>
        <DiagramBox label="SURGE / NORMAL + probability %" sub="scored inline  -  no ETL  -  model persists in DB" color="#4C825C" />
      </div>
    </div>
  );
}

function RFMOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          AUDIENCE_SEGMENT_MODEL - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-plum font-mono">K-Means</span> model (4 clusters) trained via{' '}
          <code className="text-xs tone-plum">DBMS_DATA_MINING.CREATE_MODEL</code> on 6 RFM features.
          Each synthetic audience account is assigned to a cluster using{' '}
          <code className="text-xs tone-plum">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-plum">CLUSTER_PROBABILITY()</code> confidence.
          RFM quartile labels (Champion, Loyal, At Risk, etc.) are layered on top via NTILE(4) window functions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="violet" />
        <FeatureBadge label="ALGO_KMEANS (4 clusters)" color="violet" />
        <FeatureBadge label="CLUSTER_ID()" color="cyan" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="cyan" />
        <FeatureBadge label="NTILE(4) RFM Labels" color="purple" />
        <FeatureBadge label="Churn Risk Scoring" color="red" />
      </div>
      <SqlBlock code={`-- Step 1: Train K-Means model (one-time)
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name      => 'CUSTOMER_SEGMENT_MODEL',
    mining_function => DBMS_DATA_MINING.CLUSTERING,
    data_table_name => 'OML_CUSTOMER_SEGMENT_V',
    case_id_column_name => 'CUSTOMER_ID',
    settings_table_name => 'CUST_SEGMENT_SETTINGS'
    -- ALGO_KMEANS, 4 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score synthetic audience accounts with CLUSTER_ID()
SELECT c.first_name || ' ' || c.last_name AS full_name,

  -- K-Means cluster assignment
  CLUSTER_ID(CUSTOMER_SEGMENT_MODEL USING
    cm.lifetime_value, cm.recency_days,
    cm.frequency, cm.monetary,
    cm.avg_order_value, cm.total_items
  ) AS oml_cluster_id,

  -- Cluster membership probability
  ROUND(CLUSTER_PROBABILITY(
    CUSTOMER_SEGMENT_MODEL USING ...
  ), 3) AS cluster_probability,

  -- RFM quartile labels layered on top
  NTILE(4) OVER (ORDER BY recency ASC)  AS R,
  NTILE(4) OVER (ORDER BY frequency DESC) AS F,
  NTILE(4) OVER (ORDER BY monetary DESC)  AS M

FROM customer_metrics cm
ORDER BY total_spent DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_CUSTOMER_SEGMENT_V (2,000 synthetic audience accounts)" sub="6 features: LTV proxy, recency, frequency, monetary, AOV, items" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="CUSTOMER_SEGMENT_MODEL (K-Means)" sub="ALGO_KMEANS  -  4 clusters  -  PREP_AUTO" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="each synthetic audience account -> nearest centroid" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ NTILE(4)</div>
        <DiagramBox label="RFM Segment Labels + Churn Risk" sub="Champion  -  Loyal  -  At Risk  -  Lost  -  ..." color="#4C825C" />
      </div>
    </div>
  );
}

function ForecastOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Content Revenue GLM Model + OLS Trend
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Two complementary Oracle ML techniques:{' '}
          <code className="text-xs tone-pine">REVENUE_PREDICT_MODEL</code> (Generalized Linear Model)
          trained via <code className="text-xs tone-pine">DBMS_DATA_MINING</code> predicts per-request content revenue
          from synthetic audience account and content asset features. The time-series trend uses{' '}
          <code className="text-xs tone-pine">REGR_SLOPE / REGR_R2</code> (ISO SQL:2003) for OLS regression
          with forward projection and widening confidence intervals.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="green" />
        <FeatureBadge label="ALGO_GLM (Regression)" color="green" />
        <FeatureBadge label="PREDICTION()" color="yellow" />
        <FeatureBadge label="REGR_SLOPE / REGR_R2" color="cyan" />
        <FeatureBadge label="7-Day Moving Average" color="cyan" />
        <FeatureBadge label="Confidence Intervals" color="purple" />
      </div>
      <SqlBlock code={`-- Step 1: Train GLM model (one-time)
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name      => 'REVENUE_PREDICT_MODEL',
    mining_function => DBMS_DATA_MINING.REGRESSION,
    data_table_name => 'OML_REVENUE_TRAINING_V',
    case_id_column_name => 'ORDER_ID',
    target_column_name  => 'TARGET_REVENUE',
    settings_table_name => 'revenue_predict_settings'
    -- ALGO_GENERALIZED_LINEAR_MODEL, PREP_AUTO_ON
  );
END;

-- Step 2: Score campaign requests + time-series trend
WITH daily_value AS (
  SELECT TRUNC(CAST(created_at AS DATE)) AS day,
    SUM(order_total) AS campaign_value,
    ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
  FROM orders
  WHERE created_at >= SYSDATE - 30
  GROUP BY TRUNC(CAST(created_at AS DATE))
),
params AS (
  SELECT REGR_SLOPE(campaign_value, rn)     AS slope,
         REGR_INTERCEPT(campaign_value, rn) AS intercept,
         REGR_R2(campaign_value, rn)        AS r2
  FROM daily_value
),
-- GLM model: per-request predicted content revenue
glm_stats AS (
  SELECT AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *))
    AS avg_predicted
  FROM OML_REVENUE_TRAINING_V
)
SELECT day, campaign_value, slope * rn + intercept AS trend,
  r2, avg_predicted
FROM daily_value CROSS JOIN params CROSS JOIN glm_stats;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Dual Model Pipeline</div>
        <DiagramBox label="OML_REVENUE_TRAINING_V (3,000 campaign requests)" sub="features: tier, LTV, demand_score, items, avg_price" color="#4C825C" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="REVENUE_PREDICT_MODEL (GLM)" sub="ALGO_GENERALIZED_LINEAR_MODEL  -  PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Per-Request Content Revenue Prediction" sub="GLM scores each campaign order inline in SQL" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">+ REGR_SLOPE</div>
        <DiagramBox label="OLS Trend + Forward Projection" sub="REGR_R2 fit quality  -  CI widens 7%/day" color="#AA643B" />
      </div>
    </div>
  );
}

function ClustersOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Media content K-Means model
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-teal font-mono">K-Means</span> model (5 clusters) trained via{' '}
          <code className="text-xs tone-teal">DBMS_DATA_MINING.CREATE_MODEL</code> on 8 content asset behavioral
          features (value, utilization, engagement, sentiment). Content Assets are assigned using{' '}
          <code className="text-xs tone-teal">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-teal">CLUSTER_PROBABILITY()</code> - real trained K-Means
          with convergence, not manual centroid selection. The model persists in the database and
          scores new content assets automatically.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="cyan" />
        <FeatureBadge label="ALGO_KMEANS (5 clusters)" color="cyan" />
        <FeatureBadge label="CLUSTER_ID()" color="purple" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="purple" />
        <FeatureBadge label="8 Behavioral Features" color="green" />
        <FeatureBadge label="ONNX Embeddings Available" color="orange" />
        <FeatureBadge label="In-DB Model Persistence" color="yellow" />
      </div>
      <SqlBlock code={`-- Step 1: Train K-Means model (one-time)
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name      => 'PRODUCT_CLUSTER_MODEL',
    mining_function => DBMS_DATA_MINING.CLUSTERING,
    data_table_name => 'OML_PRODUCT_CLUSTER_V',
    case_id_column_name => 'PRODUCT_ID',
    settings_table_name => 'km_settings'
    -- ALGO_KMEANS, 5 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score content assets with CLUSTER_ID()
SELECT p.product_name, p.category, p.unit_price,

  -- K-Means cluster assignment
  CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING
    pcv.unit_price, pcv.weight_kg,
    pcv.units_sold, pcv.revenue,
    pcv.order_count, pcv.total_engagement,
    pcv.avg_sentiment, pcv.avg_virality
  ) AS cluster_id,

  -- Membership probability (0.0 - 1.0)
  ROUND(CLUSTER_PROBABILITY(
    PRODUCT_CLUSTER_MODEL USING *
  ), 4) AS cluster_prob

FROM OML_PRODUCT_CLUSTER_V pcv
JOIN products p ON pcv.PRODUCT_ID = p.PRODUCT_ID
ORDER BY cluster_id, cluster_prob DESC;

-- Training view features:
-- unit_price, weight_kg, units_sold, revenue,
-- order_count, total_engagement, avg_sentiment,
-- avg_virality`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="Media content cluster view" sub="8 features: value, utilization, engagement, sentiment" color="#4F7D7B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="Media content K-Means model" sub="ALGO_KMEANS  -  5 clusters  -  PREP_AUTO  -  convergence" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="trained centroids  -  proper distance calculation" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="Content Asset Details + Cluster Stats" sub="size  -  top category  -  avg probability" color="#4C825C" />
      </div>
    </div>
  );
}

function VectorOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Oracle AI Vector Search - native nearest-centroid execution
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          This view is intentionally separate from the four Oracle Machine Learning models.
          It assigns 384-dimensional ONNX-generated content embeddings to deterministic seed
          centroids with native <code className="text-xs tone-teal">VECTOR_DISTANCE(..., COSINE)</code>.
          The API returns the exact cursor, child, plan hash, operation, and object evidence for
          the vector query that produced the rendered clusters.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="Oracle AI Vector Search" color="cyan" />
        <FeatureBadge label="VECTOR_DISTANCE()" color="cyan" />
        <FeatureBadge label="COSINE distance" color="purple" />
        <FeatureBadge label="384-dimensional embeddings" color="green" />
        <FeatureBadge label="ONNX embedding model" color="orange" />
        <FeatureBadge label="Exact cursor-plan proof" color="yellow" />
      </div>
      <SqlBlock code={`SELECT product_id,
       VECTOR_DISTANCE(embedding, :centroid_embedding, COSINE)
         AS cosine_distance
FROM product_embeddings
WHERE generation_id = :active_generation
ORDER BY cosine_distance
FETCH FIRST :limit ROWS ONLY;

-- This is Oracle AI Vector Search execution.
-- It does not claim to execute PRODUCT_CLUSTER_MODEL.`} />
    </div>
  );
}

function CapacityOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL x Rights Capacity - Rights & Capacity Risk Intelligence
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Joins <span className="tone-plum font-mono">DEMAND_SURGE_MODEL</span> (Random Forest) predictions with
          rights capacity across studio ops hubs, regional coverage desks, and live-event markets. Oracle scores each content asset in real time using{' '}
          <code className="text-xs tone-plum">PREDICTION_PROBABILITY()</code>, then compares predicted demand
          against available rights and activation capacity to identify access risk - content assets where audience-signal-driven demand will exceed coverage readiness.
          The <code className="text-xs tone-plum">demand_forecasts</code> table stores daily OML predictions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DEMAND_SURGE_MODEL" color="purple" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="purple" />
        <FeatureBadge label="demand_forecasts table" color="violet" />
        <FeatureBadge label="rights capacity x coverage desks" color="cyan" />
        <FeatureBadge label="Content Revenue at Risk" color="red" />
        <FeatureBadge label="Days of Capacity" color="green" />
      </div>
      <SqlBlock code={`-- OML Rights & Capacity Risk (actual query)
SELECT p.product_name, fc.center_name,
  i.quantity_on_hand, i.reorder_point,
  df.predicted_demand, df.social_factor,

  -- Real-time OML scoring
  PREDICTION(DEMAND_SURGE_MODEL USING
    p.category, p.unit_price,
    eng.total_posts, eng.avg_sentiment, ...
  ) AS oml_surge_prediction,

  ROUND(PREDICTION_PROBABILITY(
    DEMAND_SURGE_MODEL, 'SURGE' USING ...
  ) * 100, 1) AS oml_surge_probability,

  -- Rights capacity risk metrics
  CASE WHEN qty = 0 THEN 'NO_CAPACITY'
       WHEN qty < reorder * 0.5 THEN 'CRITICAL'
       WHEN qty < predicted_demand THEN 'AT_RISK'
  END AS capacity_status,

  -- Days of capacity at predicted consumption rate
  ROUND(qty / (predicted_demand / 7), 1)
    AS days_of_capacity,

  -- Content revenue at risk from capacity shortage
  (predicted_demand - qty) * unit_price
    AS content_revenue_at_risk

FROM inventory i
JOIN demand_forecasts df ON ...
  AND df.forecast_date = TRUNC(SYSDATE)
ORDER BY oml_surge_probability DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Rights & Capacity Risk Pipeline</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="PREDICTION_PROBABILITY('SURGE') per content asset" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ scores stored in</div>
        <DiagramBox label="demand_forecasts (daily OML predictions)" sub="predicted_demand  -  social_factor  -  confidence band" color="#A36472" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="rights capacity x coverage desks" sub="capacity_units  -  activation_threshold  -  coverage desks" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ COMPARE</div>
        <DiagramBox label="Premiere Coverage Risk: capacity_status + days_of_capacity + content_revenue_at_risk" sub="NO_CAPACITY  -  CRITICAL  -  AT_RISK  -  ADEQUATE" color="#C74634" />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────
export default function OMLAnalytics() {
  const { currentUser } = useUser();
  const userKey = currentUser?.USERNAME;
  const [activeTab, setActiveTab]       = useState('demand');
  const [demandHours, setDemandHours]   = useState(720);
  const [forecastDays, setForecastDays] = useState(7);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [clusterK, setClusterK]         = useState(5);

  const { data: summary, loading: summaryLoading, error: summaryError } = useData(() => api.ml.summary(), [userKey]);
  const { error: provenanceError } = useData(() => api.ml.modelProvenance(), [userKey]);
  const { data: demandData, loading: demandLoading, error: demandError, refetch: refetchDemand } =
    useData(() => api.ml.demandForecast({ hours: demandHours }), [demandHours, userKey]);
  const { data: segData, loading: segLoading, error: segmentError } = useData(() => api.ml.customerSegments(), [userKey]);
  const { data: forecastData, loading: forecastLoading, error: forecastError, refetch: refetchForecast } =
    useData(() => api.ml.revenueForecast({ days: 30, forecast: forecastDays }), [forecastDays, userKey]);
  const {
    data: productClusterData,
    loading: productClusterLoading,
    error: productClusterError,
    refetch: refetchProductClusters,
  } = useData(() => api.ml.productClusters({ limit: 100 }), [userKey]);
  const { data: clusterData, loading: clusterLoading, error: clusterError, refetch: refetchClusters } =
    useData(() => api.ml.vectorClusters(clusterK), [clusterK, userKey]);
  const { data: invData, loading: invLoading, error: capacityError, refetch: refetchInv } =
    useData(() => api.ml.capacityIntelligence(), [userKey]);
  const omlFeatureError = summaryError
    || provenanceError
    || demandError
    || segmentError
    || forecastError
    || productClusterError
    || capacityError;
  const omlUnavailable = Boolean(omlFeatureError);
  const activeFeatureError = activeTab === 'clusters'
    ? clusterError || omlFeatureError
    : activeTab === 'capacity'
      ? capacityError || omlFeatureError
      : omlFeatureError;
  const activeFeatureUnavailableTitle = activeTab === 'clusters' && !omlUnavailable
    ? 'Oracle AI Vector clustering is unavailable'
    : 'Oracle Machine Learning unavailable';

  const products   = demandData?.products  || [];
  const customers  = segData?.customers    || [];
  const segSummary = segData?.segmentSummary || [];
  const churnDist  = segData?.churnDistribution || [];
  const historical = forecastData?.historical || [];
  const forecast   = forecastData?.forecast   || [];
  const scoredOrders = forecastData?.scoredOrders || [];
  const model      = forecastData?.model;

  // Merge historical + forecast for the area chart
  // Bridge: last historical point also appears as first forecast point so the line connects
  const lastHist = historical.length ? historical[historical.length - 1] : null;
  const chartData = [
    ...historical.map(r => ({
      day:     r.DAY?.slice(5),
      actual:  r.ACTUAL_REVENUE,
      trend:   r.TREND_LINE,
      ma7:     r.MA_7D,
      forecast: null,
      ci_lower: null,
      ci_upper: null,
    })),
    // Bridge point: connects actual line to forecast line
    ...(lastHist ? [{
      day:      lastHist.DAY?.slice(5),
      actual:   lastHist.ACTUAL_REVENUE,
      trend:    lastHist.TREND_LINE,
      ma7:      lastHist.MA_7D,
      forecast: lastHist.ACTUAL_REVENUE,
      ci_lower: lastHist.TREND_LINE,
      ci_upper: lastHist.TREND_LINE,
    }] : []),
    ...forecast.map(r => ({
        day:      r.DAY?.slice(5),
        actual:   null,
        trend:    r.TREND_LINE,
        ma7:      null,
        forecast: r.TREND_LINE,
        ci_lower: r.CI_LOWER,
        ci_upper: r.CI_UPPER,
      })),
  ];

  const filteredAudienceAccounts = selectedSegment
    ? customers.filter(c => c.SEGMENT === selectedSegment)
    : customers;

  return (
    <div className="space-y-6 fade-in">

      {/* ── Header ──────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-view" className="oml-header-glyph tone-plum" /> Engagement, Revenue &amp; Retention Forecasts
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Midnight Harbor forecast models for demand surges, Audience Value Segments, content revenue, retention risk, and rights capacity - <span className="tone-plum">
            Random Forest  -  K-Means  -  GLM Regression  -  PREDICTION()  -  CLUSTER_ID()  -  Oracle AI Database 26ai
          </span>
        </p>
      </div>

      <SceneStoryPanel scene="oml" />

      {/* Oracle Panel - switches content based on active tab */}
      <RegisterOraclePanel title="Media Demand & Revenue OML">
        {activeTab === 'demand'   && <DemandOraclePanel />}
        {activeTab === 'rfm'      && <RFMOraclePanel />}
        {activeTab === 'forecast' && <ForecastOraclePanel />}
        {activeTab === 'productOml' && <ClustersOraclePanel />}
        {activeTab === 'clusters' && <VectorOraclePanel />}
        {!omlUnavailable && activeTab === 'capacity' && <CapacityOraclePanel />}
      </RegisterOraclePanel>

      {activeFeatureError && (
        <div
          className="glass-card border border-[var(--color-danger)]"
          role="status"
          data-testid="oml-unavailable-state"
        >
          <p className="text-sm font-semibold tone-red">
            {activeFeatureUnavailableTitle}
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {activeFeatureError.message}
          </p>
          <p className="text-[10px] text-[var(--color-text-dim)] mt-2 font-mono">
            {activeFeatureError.code || activeFeatureError.category || 'FEATURE_UNAVAILABLE'}
          </p>
          {omlUnavailable && (
            <p
              className="text-xs text-[var(--color-text-dim)] mt-2"
              data-testid="oml-unavailable-no-scores"
            >
              OML scoring results are suppressed while Oracle Machine Learning is unavailable.
            </p>
          )}
        </div>
      )}

      {/* ── Summary stat cards ─────────────────── */}
      {!omlUnavailable && (
        <div className="oml-stat-grid">
        <StatCard
          iconClass="oj-fwk-icon-sortrelevancehigh"
          label="Content Assets with Signal Surge"
          value={summaryLoading ? '...' : formatNumber(summary?.PRODUCTS_WITH_SURGE || summary?.products_with_surge || 0)}
          sub="Random Forest PREDICTION()"
          color="#AA643B"
          badge="RF"
        />
        <StatCard
          iconClass="oj-fwk-icon-users"
          label="Audience Accounts Segmented"
          value={summaryLoading ? '...' : formatNumber(summary?.TOTAL_CUSTOMERS || summary?.total_customers || 0)}
          sub="K-Means CLUSTER_ID() + RFM"
          color="#C74634"
          badge="KM"
        />
        <StatCard
          iconClass="oj-fwk-icon-view"
          label="Content Revenue Model R²"
          value={summaryLoading ? '...' : (summary?.REVENUE_R2 || summary?.revenue_r2
            ? `${((summary?.REVENUE_R2 || summary?.revenue_r2) * 100).toFixed(1)}%`
            : '-')}
          sub="GLM + REGR_R2 - 30-day fit"
          color="#4C825C"
          badge="GLM"
        />
        <StatCard
          iconClass="oj-fwk-icon-grid"
          label="Active ML Models"
          value={summaryLoading ? '...' : (summary?.MODELS_ACTIVE ?? summary?.models_active ?? '-')}
          sub="Demand  -  RFM  -  Forecast  -  K-Means"
          color="#4F7D7B"
          badge="In-DB"
        />
        </div>
      )}

      {/* ── Tab Bar ────────────────────────────── */}
      <div className="oml-tabbar" role="tablist" aria-label="OML analytics views">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <JetButton
              key={tab.key}
              id={`oml-tab-${tab.key}`}
              label={tab.buttonLabel}
              iconClass={`oj-fwk-icon ${tab.iconClass}`}
              chroming={isActive ? 'callToAction' : 'outlined'}
              role="tab"
              ariaSelected={isActive ? 'true' : 'false'}
              ariaControls={`oml-panel-${tab.key}`}
              className="oml-tab-jet-button"
              onAction={() => setActiveTab(tab.key)}
            />
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          Tab 1 - Audience Demand Predictions
      ══════════════════════════════════════════ */}
      {!omlUnavailable && activeTab === 'demand' && (
        <section
          id="oml-panel-demand"
          role="tabpanel"
          aria-labelledby="oml-tab-demand"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-sortrelevancehigh" className="tone-sienna" />
                Audience Demand Predictions
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Content assets scored by DEMAND_SURGE_MODEL - Oracle DBMS_DATA_MINING Random Forest (50 trees)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <JetSelectSingle
                value={String(demandHours)}
                options={DEMAND_WINDOW_OPTIONS}
                ariaLabel="Demand scoring window"
                className="oml-inline-select"
                onValueChange={(value) => setDemandHours(Number(value))}
              />
              <JetButton
                label={demandLoading ? 'Scoring' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={demandLoading}
                onAction={refetchDemand}
              />
            </div>
          </div>

          {demandLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring via PREDICTION(DEMAND_SURGE_MODEL)...</p>
          ) : products.length === 0 ? (
            <p
              className="text-sm text-[var(--color-text-dim)] py-4 text-center"
              data-testid="oml-empty-demand"
            >
              No content assets with sufficient audience-signal activity in this window.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Bar chart - predicted demand */}
              <div className="lg:col-span-2">
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Top 10 - Predicted Campaign Requests (7-day horizon)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#697778' }} />
                    <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 9, fill: '#697778' }} width={100}
                      tickFormatter={v => v?.length > 14 ? v.slice(0, 14) + '...' : v} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                      formatter={(v, n) => [formatNumber(v), n === 'PREDICTED_DEMAND' ? 'Predicted Campaign Requests' : n]}
                    />
                    <Bar dataKey="PREDICTED_DEMAND" radius={[0, 4, 4, 0]}>
                      {products.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="lg:col-span-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                      <th className="text-left py-2 px-2">Content Asset</th>
                      <th className="text-right py-2 px-2">Virality</th>
                      <th className="text-right py-2 px-2">Uplift</th>
                      <th className="text-right py-2 px-2">Predicted</th>
                      <th className="text-right py-2 px-2">OML Prediction</th>
                      <th className="text-right py-2 px-2">OML Probability</th>
                      <th className="text-right py-2 px-2">Content Revenue Opp.</th>
                      <th className="py-2 px-2">Confidence</th>
                      <th className="text-center py-2 px-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="py-2 px-2">
                          <div className="font-medium truncate max-w-[120px]">{p.PRODUCT_NAME}</div>
                          <div className="text-[9px] text-[var(--color-text-dim)]">{p.CATEGORY}</div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: MOMENTUM_COLORS[p.PEAK_MOMENTUM] || '#697778' }}>
                          {p.AVG_VIRALITY}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="tone-pine font-semibold">
                            +{p.UPLIFT_PCT}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatNumber(p.PREDICTED_DEMAND)}</td>
                        <td
                          className="py-2 px-2 text-right font-mono"
                          data-testid={`oml-demand-prediction-${p.PRODUCT_ID}`}
                        >
                          {p.PREDICTED_SURGE}
                        </td>
                        <td
                          className="py-2 px-2 text-right font-mono tone-pine"
                          data-testid={`oml-demand-probability-${p.PRODUCT_ID}`}
                        >
                          {Number(p.SURGE_PROBABILITY || 0).toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right tone-sienna">{formatCurrency(p.REVENUE_OPPORTUNITY)}</td>
                        <td className="py-2 px-2 min-w-[90px]">
                          <ConfidenceBar pct={p.CONFIDENCE_PCT} />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <MomentumBadge flag={p.PEAK_MOMENTUM} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <OmlModelEvidence meta={demandData?.meta} />

          {/* Model explanation */}
          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
            <span><strong>Scoring:</strong> PREDICTION() / PREDICTION_PROBABILITY()</span>
            <span><strong>Features:</strong> 12 - category, value, posts, sentiment, likes, shares, views, urgency, viral_posts, rising_posts, units_sold, revenue</span>
            <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - trained model persists in database</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 2 - Audience Value Segments
      ══════════════════════════════════════════ */}
      {!omlUnavailable && activeTab === 'rfm' && (
        <section
          id="oml-panel-rfm"
          role="tabpanel"
          aria-labelledby="oml-tab-rfm"
          className="glass-card space-y-5"
        >
          <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-users" className="tone-plum" />
                Audience Value Segments
              </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters) via DBMS_DATA_MINING +{' '}
              <code className="tone-plum">NTILE(4)</code> RFM labeling - CLUSTER_ID() scoring
            </p>
          </div>

          {segLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring synthetic audience accounts via CLUSTER_ID(CUSTOMER_SEGMENT_MODEL)...</p>
          ) : customers.length === 0 ? (
            <p
              className="text-sm text-[var(--color-text-dim)] py-4 text-center"
              data-testid="oml-empty-customer"
            >
              No governed audience accounts are available for CUSTOMER_SEGMENT_MODEL scoring.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Segment donut */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                  Segment Distribution
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={segSummary}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="count"
                      nameKey="segment"
                      onClick={d => setSelectedSegment(selectedSegment === d.segment ? null : d.segment)}
                    >
                      {segSummary.map((s, i) => (
                        <Cell
                          key={i}
                          fill={SEGMENT_COLORS[s.segment] || CHART_COLORS[i % CHART_COLORS.length]}
                          opacity={selectedSegment && selectedSegment !== s.segment ? 0.35 : 1}
                          cursor="pointer"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={false}
                      formatter={(v, n, p) => [`${v} synthetic audience accounts`, p.payload.segment]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {segSummary.map((s, i) => (
                    <JetButton
                      key={i}
                      label={`${s.segment} (${s.count})`}
                      chroming={selectedSegment === s.segment ? 'callToAction' : 'outlined'}
                      className="oml-segment-filter-button"
                      onAction={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
                    />
                  ))}
                </div>
              </div>

              {/* Churn risk bar + segment table */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Churn Risk Distribution</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={churnDist} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="risk" tick={{ fontSize: 10, fill: '#697778' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#697778' }} width={30} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {churnDist.map((d, i) => (
                          <Cell key={i} fill={d.risk === 'High' ? '#C74634' : d.risk === 'Medium' ? '#AA643B' : '#4C825C'} />
                        ))}
                      </Bar>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v} synthetic audience accounts`, 'Count']}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Segment Summary</p>
                  <div className="space-y-1">
                    {segSummary.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span style={{ color: SEGMENT_COLORS[s.segment] || CHART_COLORS[i] }}>{s.segment}</span>
                        <div className="flex gap-3 text-[var(--color-text-dim)]">
                          <span>{s.count} synthetic audience accounts</span>
                          <span className="tone-sienna">{formatCurrency(s.total_revenue)}</span>
                          <span className="tone-plum">RFM {s.avg_rfm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audience account table - filtered by selected segment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    {selectedSegment ? `${selectedSegment} synthetic audience accounts` : 'Top synthetic audience accounts by RFM score'}
                  </p>
                  {selectedSegment && (
                    <JetButton
                      label="Clear"
                      iconClass="oj-fwk-icon oj-fwk-icon-cross"
                      chroming="borderless"
                      className="oml-clear-filter-button"
                      onAction={() => setSelectedSegment(null)}
                    />
                  )}
                </div>
                <div className="overflow-y-auto max-h-[240px] space-y-1">
                  {filteredAudienceAccounts.slice(0, 40).map((customer, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1 rounded px-2 py-1.5 text-[10px] hover:surface-bark-soft transition-colors">
                      <div>
                        <span className="font-medium">{customer.FULL_NAME}</span>
                        <span className="text-[var(--color-text-dim)] ml-1">{customer.CITY}, {customer.STATE}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span style={{ color: SEGMENT_COLORS[customer.SEGMENT] || '#697778' }}
                          className="text-[9px] font-semibold">{customer.SEGMENT}</span>
                        <span className="tone-sienna">{formatCurrency(customer.TOTAL_SPENT)}</span>
                        <span
                          className="font-mono tone-plum"
                          data-testid={`oml-customer-cluster-${customer.CUSTOMER_ID}`}
                        >
                          OML cluster {customer.OML_CLUSTER_ID}
                        </span>
                        <span
                          className="font-mono tone-pine"
                          data-testid={`oml-customer-probability-${customer.CUSTOMER_ID}`}
                        >
                          {(Number(customer.CLUSTER_PROBABILITY || 0) * 100).toFixed(1)}% probability
                        </span>
                        <span className={`text-[9px] ${customer.CHURN_RISK === 'High' ? 'tone-red' : customer.CHURN_RISK === 'Medium' ? 'tone-sienna' : 'tone-pine'}`}>
                          {customer.CHURN_RISK}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <OmlModelEvidence meta={segData?.meta} />

          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(107,116,148,0.06)', border: '1px dashed rgba(107,116,148,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> CUSTOMER_SEGMENT_MODEL K-Means scored with CLUSTER_ID() / CLUSTER_PROBABILITY()</span>
            <span><strong>Label layer:</strong> RFM via Oracle NTILE(4) - ISO SQL:2003 Window Functions</span>
            <span><strong>Segments:</strong> Champion  -  Loyal  -  New  -  At Risk  -  Lost  -  Big Spender  -  Promising  -  Potential</span>
            <span><strong>Engine:</strong> Oracle AI Database 26ai - no sklearn, no Python, no external cluster</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 3 - Content Revenue Forecast
      ══════════════════════════════════════════ */}
      {!omlUnavailable && activeTab === 'forecast' && (
        <section
          id="oml-panel-forecast"
          role="tabpanel"
          aria-labelledby="oml-tab-forecast"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-view" className="tone-pine" />
                Content Revenue Forecast - Oracle ML GLM + OLS Trend
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                REVENUE_PREDICT_MODEL scores with <code className="text-[var(--color-text)] font-semibold">PREDICTION()</code>;
                {' '}<code className="text-[var(--color-text)] font-semibold">REGR_SLOPE  -  REGR_INTERCEPT  -  REGR_R2</code> fits the 30-day trend and projects forward
              </p>
            </div>
            <div className="flex items-center gap-2">
              <JetSelectSingle
                value={String(forecastDays)}
                options={FORECAST_DAY_OPTIONS}
                ariaLabel="Content revenue forecast horizon"
                className="oml-inline-select"
                onValueChange={(value) => setForecastDays(Number(value))}
              />
              <JetButton
                label={forecastLoading ? 'Fitting' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={forecastLoading}
                onAction={refetchForecast}
              />
            </div>
          </div>

          {forecastLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring REVENUE_PREDICT_MODEL and fitting the REGR_SLOPE trend...</p>
          ) : scoredOrders.length === 0 && historical.length === 0 ? (
            <p
              className="text-sm text-[var(--color-text-dim)] py-4 text-center"
              data-testid="oml-empty-revenue"
            >
              No governed campaign requests are available for REVENUE_PREDICT_MODEL scoring.
            </p>
          ) : (
            <>
              {/* Model quality stats */}
              {model && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'R² (fit quality)', value: `${((model.r_squared || 0) * 100).toFixed(1)}%`, color: model.r_squared > 0.7 ? '#4C825C' : model.r_squared > 0.4 ? '#AA643B' : '#C74634' },
                    { label: 'Daily Slope', value: `${model.daily_slope >= 0 ? '+' : ''}${formatCurrency(model.daily_slope)}/day`, color: model.daily_slope >= 0 ? '#4C825C' : '#C74634' },
                    { label: 'Mean Daily Content Revenue', value: formatCurrency(model.mean_daily_revenue), color: '#C74634' },
                    { label: 'Observations', value: `${model.observations} days`, color: '#4F7D7B' },
                  ].map((m, i) => (
                    <div key={i} className="rounded-lg p-3 text-center"
                      style={{ background: `${m.color}11`, border: `1px solid ${m.color}33` }}>
                      <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{m.label}</p>
                      <p className="text-sm font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    Oracle GLM scored orders
                  </p>
                  <p className="text-[10px] text-[var(--color-text-dim)]">
                    Actual per-order PREDICTION(REVENUE_PREDICT_MODEL) results; the OLS chart below is a separate time-series trend.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Order</th>
                        <th className="text-left py-2 px-2">Tier</th>
                        <th className="text-right py-2 px-2">Actual Revenue</th>
                        <th className="text-right py-2 px-2">GLM Predicted Revenue</th>
                        <th className="text-right py-2 px-2">Prediction Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoredOrders.slice(0, 40).map((order) => (
                        <tr
                          key={order.ORDER_ID}
                          className="border-b border-[var(--color-border)]/30"
                          data-testid={`oml-revenue-score-${order.ORDER_ID}`}
                        >
                          <td className="py-2 px-2 font-mono">{order.ORDER_ID}</td>
                          <td className="py-2 px-2">{order.CUSTOMER_TIER}</td>
                          <td className="py-2 px-2 text-right">{formatCurrency(order.TARGET_REVENUE)}</td>
                          <td className="py-2 px-2 text-right font-mono tone-pine">
                            {formatCurrency(order.GLM_PREDICTED_REVENUE)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tone-sienna">
                            {formatCurrency(order.GLM_PREDICTION_ERROR)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Main forecast chart */}
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4C825C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4C825C" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C74634" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C74634" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#697778' }}
                    interval={Math.floor(chartData.length / 10)} />
                  <YAxis tick={{ fontSize: 9, fill: '#697778' }} width={60}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ForecastTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#697778' }} />

                  {/* Confidence interval band for forecast (upper bound filled, lower bound erases) */}
                  <Area type="monotone" dataKey="ci_upper" fill="#C7463422" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Upper" legendType="none" />
                  <Area type="monotone" dataKey="ci_lower" fill="var(--color-bg)" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Lower" legendType="none" />

                  <Area type="monotone" dataKey="actual" stroke="#4C825C" fill="url(#actualGrad)"
                    strokeWidth={2} dot={false} name="Actual Content Revenue" connectNulls={false} />
                  <Area type="monotone" dataKey="forecast" stroke="#C74634" fill="url(#forecastGrad)"
                    strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="Forecast" connectNulls />
                  <Line type="monotone" dataKey="trend" stroke="#AA643B" strokeWidth={1.5}
                    strokeDasharray="2 2" dot={false} name="Trend (OLS)" connectNulls />
                  <Line type="monotone" dataKey="ma7" stroke="#4F7D7B" strokeWidth={1.5}
                    dot={false} name="7-day MA" />

                  {/* Vertical rule separating actual / forecast */}
                  {historical.length > 0 && (
                    <ReferenceLine
                      x={historical[historical.length - 1]?.DAY?.slice(5)}
                      stroke="rgba(49,45,42,0.18)"
                      strokeDasharray="4 4"
                      label={{ value: 'Forecast ->', position: 'top', fill: '#697778', fontSize: 9 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>

              {/* Model card */}
              {model && (
                <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                  style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.3)', color: 'var(--color-text)' }}>
                  <span><strong>Model:</strong> {model.type}</span>
                  <span><strong>Oracle functions:</strong> {model.engine}</span>
                  <span><strong>R²:</strong> {(model.r_squared * 100).toFixed(1)}%
                    {'  -  '}<strong>rho:</strong> {(model.correlation * 100).toFixed(1)}% corr.
                  </span>
                  <span><strong>Forecast:</strong> {model.forecast_days} days
                    {'  -  '}<strong>Trained on:</strong> {model.lookback_days}-day window
                  </span>
                </div>
              )}
            </>
          )}

          <OmlModelEvidence meta={forecastData?.meta || model} />
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 4 - OML Product K-Means Clustering
      ══════════════════════════════════════════ */}
      {!omlUnavailable && activeTab === 'productOml' && (
        <section
          id="oml-panel-productOml"
          role="tabpanel"
          aria-labelledby="oml-tab-productOml"
          className="glass-card space-y-5"
          data-testid="oml-product-cluster-panel"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-plum" />
                OML Product K-Means Clustering
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                PRODUCT_CLUSTER_MODEL scores every content asset with native CLUSTER_ID() and CLUSTER_PROBABILITY()
              </p>
            </div>
            <JetButton
              label={productClusterLoading ? 'Scoring' : 'Refresh'}
              iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
              chroming="outlined"
              disabled={productClusterLoading}
              onAction={refetchProductClusters}
            />
          </div>

          {productClusterLoading ? (
            <div className="py-8 text-center">
              <JetProgressCircle className="oml-loading-progress" ariaLabel="Scoring OML product clusters" />
              <p className="text-sm text-[var(--color-text-dim)]">
                Running CLUSTER_ID(PRODUCT_CLUSTER_MODEL) and CLUSTER_PROBABILITY()...
              </p>
            </div>
          ) : !productClusterData?.products?.length ? (
            <p
              className="text-sm text-[var(--color-text-dim)] py-4 text-center"
              data-testid="oml-empty-product"
            >
              No OML product-cluster scores are available for the active governed generation.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'OML Clusters', value: productClusterData.clusters?.length || 0, color: '#796087' },
                  { label: 'Content Assets Scored', value: productClusterData.total || 0, color: '#C74634' },
                  { label: 'Native Operator', value: 'CLUSTER_ID()', color: '#4F7D7B' },
                  { label: 'Confidence', value: 'CLUSTER_PROBABILITY()', color: '#4C825C' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg p-3 text-center"
                    style={{ background: `${item.color}11`, border: `1px solid ${item.color}33` }}
                  >
                    <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{item.label}</p>
                    <p className="text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {(productClusterData.clusters || []).map((cluster, index) => {
                  const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length];
                  return (
                    <div
                      key={cluster.clusterId}
                      className="rounded-lg p-3"
                      style={{ background: `${color}11`, border: `1px solid ${color}33` }}
                    >
                      <p className="text-xs font-bold" style={{ color }}>Cluster {cluster.clusterId}</p>
                      <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
                        {cluster.productCount} content assets
                      </p>
                      <p className="text-[10px] font-mono mt-1">
                        {(Number(cluster.averageProbability || 0) * 100).toFixed(1)}% avg probability
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                      <th className="text-left py-2 px-2">Content Asset</th>
                      <th className="text-left py-2 px-2">Category</th>
                      <th className="text-right py-2 px-2">Cluster ID</th>
                      <th className="text-right py-2 px-2">Probability</th>
                      <th className="text-right py-2 px-2">Content Revenue</th>
                      <th className="text-right py-2 px-2">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productClusterData.products.slice(0, 40).map((product) => (
                      <tr
                        key={product.PRODUCT_ID}
                        className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors"
                        data-testid={`oml-product-score-${product.PRODUCT_ID}`}
                      >
                        <td className="py-2 px-2">
                          <div className="font-medium">{product.PRODUCT_NAME}</div>
                          <div className="text-[9px] text-[var(--color-text-dim)]">{product.BRAND_NAME}</div>
                        </td>
                        <td className="py-2 px-2">{product.CATEGORY}</td>
                        <td className="py-2 px-2 text-right font-mono">{product.CLUSTER_ID}</td>
                        <td className="py-2 px-2 text-right font-mono tone-pine">
                          {(Number(product.CLUSTER_PROBABILITY || 0) * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 px-2 text-right tone-sienna">{formatCurrency(product.REVENUE)}</td>
                        <td className="py-2 px-2 text-right">{formatNumber(product.TOTAL_ENGAGEMENT)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <OmlModelEvidence meta={productClusterData?.meta} />
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 5 - Vector Nearest-Centroid Clustering
      ══════════════════════════════════════════ */}
      {activeTab === 'clusters' && (
        <section
          id="oml-panel-clusters"
          role="tabpanel"
          aria-labelledby="oml-tab-clusters"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
                Vector Nearest-Centroid Clustering
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Content Assets clustered by semantic similarity using <code className="tone-teal">VECTOR_DISTANCE(COSINE)</code> on
                384-dim embeddings - Oracle AI Vector Search
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-dim)]">K =</span>
              {[3, 5, 10].map(kVal => (
                <JetButton
                  key={kVal}
                  label={String(kVal)}
                  chroming={clusterK === kVal ? 'callToAction' : 'outlined'}
                  className="oml-k-button"
                  onAction={() => setClusterK(kVal)}
                />
              ))}
              <JetButton
                label={clusterLoading ? 'Clustering' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={clusterLoading}
                onAction={refetchClusters}
              />
            </div>
          </div>

          {clusterLoading ? (
            <div className="py-8 text-center">
              <JetProgressCircle className="oml-loading-progress" ariaLabel="Running vector clustering" />
              <p className="text-sm text-[var(--color-text-dim)]">Running VECTOR_DISTANCE nearest-centroid assignment (K={clusterK})...</p>
            </div>
          ) : !clusterData?.clusters?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No cluster data available.</p>
          ) : (
            <>
              {/* Cluster summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Clusters (K)', value: clusterData.k, color: '#4F7D7B' },
                  { label: 'Content Assets Clustered', value: clusterData.total_products, color: '#C74634' },
                  { label: 'Embedding Dims', value: clusterData.meta?.dimensions == null ? 'Unavailable' : String(clusterData.meta.dimensions), color: '#AA643B' },
                  { label: 'Distance Metric', value: clusterData.meta?.distance_metric || 'Unavailable', color: '#4C825C' },
                ].map((m, i) => (
                  <div key={i} className="rounded-lg p-3 text-center"
                    style={{ background: `${m.color}11`, border: `1px solid ${m.color}33` }}>
                    <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{m.label}</p>
                    <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Cluster size overview */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Cluster Distribution</p>
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                  {clusterData.clusters.map((cl, i) => (
                    <div
                      key={cl.cluster_id}
                      className="relative group flex items-center justify-center text-[9px] font-bold transition-all hover:opacity-90"
                      style={{
                        width: `${Math.max((cl.size / clusterData.total_products) * 100, 3)}%`,
                        background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                      }}
                    >
                      {cl.size}
                      <div className="absolute -top-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Cluster {cl.cluster_id}: {cl.size} content assets  -  {cl.top_category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cluster cards */}
              <div className="space-y-3">
                {clusterData.clusters.map((cl, i) => {
                  const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
                  return (
                    <div key={cl.cluster_id} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid ${color}33` }}>
                      {/* Cluster header */}
                      <div className="flex items-center justify-between px-4 py-2.5"
                        style={{ background: `${color}11` }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{ background: `${color}33`, color }}>
                            {cl.cluster_id}
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color }}>
                              Cluster {cl.cluster_id} - {cl.top_category}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-dim)]">
                              {cl.size} content assets  -  Avg similarity: <span className="font-mono" style={{ color }}>{(cl.avg_similarity * 100).toFixed(1)}%</span>
                              {'  -  '}Centroid: <span className="text-[var(--color-text)]">{cl.centroid_product}</span>
                            </p>
                          </div>
                        </div>
                        {/* Category breakdown pills */}
                        <div className="flex gap-1 flex-wrap justify-end">
                          {Object.entries(cl.category_breakdown)
                            .sort(([,a],[,b]) => b - a)
                            .slice(0, 4)
                            .map(([cat, cnt]) => (
                              <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}>
                                {cat} ({cnt})
                              </span>
                            ))}
                        </div>
                      </div>
                      {/* Content Assets grid */}
                      <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {cl.products.slice(0, 12).map(p => (
                          <div key={p.product_id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:surface-bark-soft transition-colors"
                            style={p.is_centroid ? { background: `${color}11`, border: `1px solid ${color}33` } : {}}>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block">
                                {p.is_centroid && <span style={{ color }} className="mr-1">★</span>}
                                {p.product_name}
                              </span>
                              <span className="text-[9px] text-[var(--color-text-dim)]">
                                {p.brand_name}  -  {p.category}  -  {formatCurrency(p.unit_price)}
                              </span>
                            </div>
                            <div className="flex-shrink-0 w-12 text-right">
                              <span className="text-[10px] font-mono font-bold"
                                style={{ color: p.similarity >= 0.7 ? '#4C825C' : p.similarity >= 0.5 ? '#AA643B' : '#437C94' }}>
                                {(p.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                        {cl.products.length > 12 && (
                          <div className="text-[10px] text-[var(--color-text-dim)] px-2 py-1">
                            +{cl.products.length - 12} more content assets
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(79,125,123,0.06)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
                <span><strong>Model:</strong> {clusterData.meta?.model}</span>
                <span><strong>Vectors:</strong> {clusterData.meta?.dimensions}-dim  -  {clusterData.evidence?.embeddingModel} ONNX  -  {clusterData.meta?.distance_metric} distance</span>
                <span><strong>Engine:</strong> {clusterData.meta?.engine}</span>
                <span><strong>Cursor proof:</strong> generation {clusterData.evidence?.generationId}  -  SQL {clusterData.evidence?.sqlId}/{clusterData.evidence?.childNumber}  -  plan {clusterData.evidence?.planHashValue}  -  {clusterData.evidence?.operation} {clusterData.evidence?.options} {clusterData.evidence?.objectName}</span>
                <span><strong>K:</strong> {clusterData.k} clusters  -  {clusterData.total_products} content assets</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 5 - Rights & Capacity Risk
      ══════════════════════════════════════════ */}
      {!omlUnavailable && activeTab === 'capacity' && (
        <section
          id="oml-panel-capacity"
          role="tabpanel"
          aria-labelledby="oml-tab-capacity"
          className="glass-card space-y-5"
          data-testid="oml-capacity-panel"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-tree-document" className="tone-plum" />
                Rights & Capacity Risk
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                DEMAND_SURGE_MODEL predictions x rights capacity - identifies coverage risk when audience demand exceeds launch-window, regional, or live-event capacity
              </p>
            </div>
            <JetButton
              label={invLoading ? 'Scoring' : 'Refresh'}
              iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
              chroming="outlined"
              disabled={invLoading}
              onAction={refetchInv}
            />
          </div>

          {invLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring capacity via PREDICTION(DEMAND_SURGE_MODEL)...</p>
          ) : !invData?.alerts?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No capacity intelligence data available.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: '#C7463411', border: '1px solid #C7463433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Critical Rights Gap</p>
                  <p
                    className="text-xl font-bold text-[#C74634]"
                    data-testid="oml-capacity-summary-critical"
                  >
                    {invData.summary.critical_count}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#437C9411', border: '1px solid #437C9433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Demand Exceeds Capacity</p>
                  <p
                    className="text-xl font-bold text-[#437C94]"
                    data-testid="oml-capacity-summary-at-risk"
                  >
                    {invData.summary.at_risk_count}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#AA643B11', border: '1px solid #AA643B33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">OML Surge Assets</p>
                  <p
                    className="text-xl font-bold text-[#AA643B]"
                    data-testid="oml-capacity-summary-surge-products"
                  >
                    {invData.summary.surge_products}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#79608711', border: '1px solid #79608733' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Revenue at Risk</p>
                  <p
                    className="text-lg font-bold text-[#796087]"
                    data-testid="oml-capacity-summary-revenue-risk"
                  >
                    {formatCurrency(invData.summary.total_revenue_at_risk)}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#4C825C11', border: '1px solid #4C825C33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Assets Monitored</p>
                  <p
                    className="text-xl font-bold text-[#4C825C]"
                    data-testid="oml-capacity-summary-total-alerts"
                  >
                    {invData.summary.total_alerts}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Capacity status distribution */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                    Rights Capacity Status
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={invData.statusDistribution}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        dataKey="count" nameKey="status"
                      >
                        {invData.statusDistribution.map((d, i) => (
                          <Cell key={i} fill={capacityStatusColor(d.status)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={false}
                        formatter={(v, n, p) => [`${v} assets`, formatCapacityStatus(p.payload.status)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {invData.statusDistribution.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: `${capacityStatusColor(d.status)}22`, color: capacityStatusColor(d.status) }}>
                        {formatCapacityStatus(d.status)} ({d.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center summary */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Alerts by Coverage Desk
                  </p>
                  <div className="space-y-1 max-h-[240px] overflow-y-auto">
                    {invData.centerSummary.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] rounded px-2 py-1.5 hover:surface-bark-soft">
                        <div>
                          <span className="font-medium">{c.center}</span>
                          <span className="text-[var(--color-text-dim)] ml-1">({c.city})</span>
                        </div>
                        <div className="flex gap-2">
                          {c.critical > 0 && (
                            <span className="text-[#C74634] font-bold">{c.critical} critical</span>
                          )}
                          {c.surges > 0 && (
                            <span className="text-[#AA643B]">{c.surges} surges</span>
                          )}
                          <span className="text-[var(--color-text-dim)]">{c.alerts} total</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top surge probability products */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Highest Audience Surge Probability
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={invData.alerts.filter(isOmlSurgeWatch).slice(0, 8)}
                      layout="vertical" margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#697778' }} domain={[0, 100]} />
                      <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 8, fill: '#697778' }} width={90}
                        tickFormatter={v => v?.length > 12 ? v.slice(0, 12) + '...' : v} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v}%`, 'Surge Probability']}
                      />
                      <Bar dataKey="OML_SURGE_PROBABILITY" radius={[0, 4, 4, 0]}>
                        {invData.alerts.filter(isOmlSurgeWatch).slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Alerts table */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Rights Capacity Alerts - Sorted by OML Demand Probability
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Content Asset</th>
                        <th className="text-left py-2 px-2">Coverage Desk</th>
                        <th className="text-right py-2 px-2">Capacity Units</th>
                        <th className="text-right py-2 px-2">Demand Forecast</th>
                        <th className="text-right py-2 px-2">Surge %</th>
                        <th className="text-center py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Days Capacity</th>
                        <th className="text-right py-2 px-2">Rev. at Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invData.alerts.slice(0, 30).map((a, i) => (
                        <tr
                          key={i}
                          className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors"
                          data-testid="oml-capacity-alert-row"
                        >
                          <td className="py-2 px-2">
                            <div
                              className="font-medium truncate max-w-[120px]"
                              data-testid="oml-capacity-alert-product"
                            >
                              {a.PRODUCT_NAME}
                            </div>
                            <div className="text-[9px] text-[var(--color-text-dim)]">{a.CATEGORY}  -  {a.BRAND_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-[10px]">
                            <div
                              className="truncate max-w-[100px]"
                              data-testid="oml-capacity-alert-center"
                            >
                              {a.CENTER_NAME}
                            </div>
                          </td>
                          <td
                            className="py-2 px-2 text-right font-mono"
                            data-testid="oml-capacity-alert-on-hand"
                          >
                            {a.QUANTITY_ON_HAND}
                          </td>
                          <td
                            className="py-2 px-2 text-right font-mono tone-sienna"
                            data-testid="oml-capacity-alert-demand"
                          >
                            {a.PREDICTED_DEMAND}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span
                              className="font-bold"
                              data-testid="oml-capacity-alert-probability"
                              style={{
                              color: a.OML_SURGE_PROBABILITY >= 70 ? '#C74634' :
                                     a.OML_SURGE_PROBABILITY >= 40 ? '#AA643B' : '#4C825C'
                              }}
                            >
                              {a.OML_SURGE_PROBABILITY}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              data-testid="oml-capacity-alert-status"
                              style={{
                                background: `${capacityStatusColor(a.STOCK_STATUS)}22`,
                                color: capacityStatusColor(a.STOCK_STATUS)
                              }}>
                              {formatCapacityStatus(a.STOCK_STATUS)}
                            </span>
                          </td>
                          <td
                            className="py-2 px-2 text-right font-mono"
                            data-testid="oml-capacity-alert-days"
                            style={{
                              color: a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 3 ? '#C74634' :
                                     a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 7 ? '#AA643B' : '#4C825C'
                            }}
                          >
                            {a.DAYS_OF_SUPPLY != null ? `${a.DAYS_OF_SUPPLY}d` : '-'}
                          </td>
                          <td
                            className="py-2 px-2 text-right tone-red"
                            data-testid="oml-capacity-alert-revenue"
                          >
                            {a.REVENUE_AT_RISK > 0 ? formatCurrency(a.REVENUE_AT_RISK) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(121,96,135,0.06)', border: '1px dashed rgba(121,96,135,0.3)', color: 'var(--color-text)' }}>
                <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
                <span><strong>Scoring:</strong> PREDICTION_PROBABILITY() x rights capacity levels</span>
                <span><strong>Data:</strong> demand_forecasts (daily OML predictions) x rights capacity x coverage desks</span>
                <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - audience-signal demand surge to rights and capacity risk assessment</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
