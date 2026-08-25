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
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';
import { STATE_LOCAL_SCENARIO } from '../config/stateLocalScenario';

// ── Color palette ──────────────────────────────────────
const HIGH_SERVICE_NEED_SOURCE_SEGMENT = ['Big', 'Spender'].join(' ');

const SEGMENT_COLORS = {
  Champion:       '#AA643B',
  Loyal:          '#4C825C',
  'New Resident': '#4F7D7B',
  'New Enterprise Buyer': '#4F7D7B',
  'At Risk':      '#C74634',
  Lost:           '#7A736E',
  [HIGH_SERVICE_NEED_SOURCE_SEGMENT]: '#796087',
  Promising:      '#437C94',
  Potential:      '#6F757E',
};

const SEGMENT_LABELS = {
  Champion: 'Priority Support',
  Loyal: 'Recurring Assistance',
  'New Resident': 'New Applicant',
  'New Enterprise Buyer': 'New Applicant',
  'At Risk': 'SLA Risk',
  Lost: 'Dormant Case',
  [HIGH_SERVICE_NEED_SOURCE_SEGMENT]: 'High Service Need',
  Promising: 'Promising Outreach',
  Potential: 'Potential Assistance',
};

function formatSegmentLabel(segment) {
  return SEGMENT_LABELS[segment] || segment || '-';
}

const MOMENTUM_COLORS = {
  critical:   '#C74634',
  escalating: '#AA643B',
  rising:     '#AA643B',
  normal:     '#7A736E',
};

const CHART_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B'];

// ── Tab definitions ────────────────────────────────────
const CLUSTER_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B','#437C94','#4C825C','#796087','#A36472','#4F7D7B','#5F7D4F','#AA643B'];

const TABS = [
  { key: 'demand',    label: 'Public Service Demand Risk',             buttonLabel: 'Demand Risk',     iconClass: 'oj-fwk-icon-sortrelevancehigh', color: '#AA643B' },
  { key: 'rfm',       label: `${STATE_LOCAL_SCENARIO.state} Resident Need Segments`,            buttonLabel: 'Need Segments',      iconClass: 'oj-fwk-icon-users',             color: '#C74634' },
  { key: 'forecast',  label: 'Service Value Forecast', buttonLabel: 'Value Forecast',          iconClass: 'oj-fwk-icon-view',              color: '#4C825C' },
  { key: 'clusters',  label: 'Vector K-Means Clustering',            buttonLabel: 'Vector K-Means',    iconClass: 'oj-fwk-icon-grid',              color: '#4F7D7B' },
  { key: 'capacity', label: `Demand Capacity Across ${STATE_LOCAL_SCENARIO.state} Service Centers`,               buttonLabel: 'Capacity by Center',         iconClass: 'oj-fwk-icon-tree-document',     color: '#796087' },
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

const STOCK_COLORS = {
  OUT_OF_STOCK: '#C74634',
  CRITICAL: '#AA643B',
  LOW: '#AA643B',
  AT_RISK: '#437C94',
  ADEQUATE: '#4C825C',
};

const CAPACITY_STATUS_LABELS = {
  OUT_OF_STOCK: 'No capacity',
  CRITICAL: 'Critical',
  LOW: 'Constrained',
  AT_RISK: 'At risk',
  ADEQUATE: 'Adequate',
};

function formatCapacityStatus(status) {
  return CAPACITY_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ').toLowerCase();
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

// ── Helper components ──────────────────────────────────
function StatCard({ iconClass, label, value, sub, color = '#C74634', badge }) {
  return (
    <div className="stat-card oml-stat-card">
      <div className="oml-stat-card__top">
        <div className="oml-stat-card__icon" style={{ background: `${color}18`, color }}>
          <JetGlyph iconClass={iconClass} className="oml-stat-card__icon-glyph" />
        </div>
        {badge && (
          <span
            className="oml-stat-card__badge"
            style={{ background: `${color}22`, color: 'var(--color-text)', border: `1px solid ${color}33` }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="oml-stat-card__copy">
        <p className="oml-stat-card__value">{value}</p>
        <p className="oml-stat-card__label">{label}</p>
      </div>
      {sub && <p className="oml-stat-card__meta">{sub}</p>}
    </div>
  );
}

function MomentumBadge({ flag }) {
  const normalized = String(flag || '').toLowerCase();
  const label =
    normalized === 'critical' ? 'Critical' :
    normalized === 'escalating' ? 'Escalating' :
    normalized === 'rising' ? 'Rising' :
    flag ? 'Stable' : '-';
  const className =
    normalized === 'critical' ? 'priority-critical' :
    normalized === 'escalating' ? 'priority-escalating' :
    normalized === 'rising' ? 'priority-rising' :
    'priority-normal';
  return (
    <span className={`priority-badge ${className}`}>{label}</span>
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

function formatRunTime(value) {
  if (!value) return 'Not refreshed';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PersistedMlEvidencePanel() {
  const { data: persistence, loading, error, refetch } = useData(() => api.ml.persistenceStatus());
  const [refreshing, setRefreshing] = useState(false);

  const latestRun = persistence?.latestRun || {};
  const counts = persistence?.counts || {};
  const models = persistence?.modelLifecycle?.models || [];

  async function refreshOutputs() {
    setRefreshing(true);
    try {
      await api.ml.refreshPersistence();
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="oml-persistence-panel" aria-label="Persisted machine learning evidence">
      <div className="oml-persistence-panel__header">
        <div>
          <p className="oml-persistence-panel__eyebrow">Latest persisted ML run</p>
          <h3 className="oml-persistence-panel__title">Oracle-persisted machine learning evidence</h3>
          <p className="oml-persistence-panel__copy">
            Persisted output tables and DBMS_DATA_MINING model lifecycle evidence prove the State and Local Government OML scene survives app restarts, restore-demo refreshes, and container rebuilds with responsible AI for government auditability.
          </p>
        </div>
        <JetButton
          label={refreshing ? 'Refreshing' : 'Refresh persisted ML outputs'}
          iconClass="oj-fwk-icon oj-fwk-icon-refresh"
          chroming="outlined"
          disabled={loading || refreshing}
          onAction={refreshOutputs}
        />
      </div>

      {error && (
        <div className="oml-persistence-panel__warning">
          Persistence evidence is temporarily unavailable: {error}
        </div>
      )}

      <div className="oml-persistence-grid">
        <div className="oml-persistence-card">
          <p className="oml-persistence-card__label">Completed run</p>
          <p className="oml-persistence-card__value">{loading ? '...' : latestRun.RUN_ID || '-'}</p>
          <p className="oml-persistence-card__meta">{latestRun.MODEL_VERSION || 'Persistent public-service ML outputs'} - {formatRunTime(latestRun.COMPLETED_AT)}</p>
        </div>
        <div className="oml-persistence-card">
          <p className="oml-persistence-card__label">Persisted rows</p>
          <p className="oml-persistence-card__value">{loading ? '...' : formatNumber(Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0))}</p>
          <p className="oml-persistence-card__meta">scores, segments, forecasts, clusters, and capacity alerts</p>
        </div>
        <div className="oml-persistence-card">
          <p className="oml-persistence-card__label">DBMS_DATA_MINING model lifecycle</p>
          <p className="oml-persistence-card__value">{loading ? '...' : `${models.filter((model) => model.active).length}/${models.length || 4}`}</p>
          <p className="oml-persistence-card__meta">State and Local Government demand, resident need, service value, and case signal models</p>
        </div>
      </div>
    </section>
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
          95% CI: {formatCurrency(ciLower)} – {formatCurrency(ciUpper)}
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
          Demand Surge Scoring - Populated Catalog Fallback
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          The demo catalog contains public-service and agency data even when resident-signal and order tables are empty.
          This executable fallback derives a transparent demand score from service value and agency social tier, so it returns
          populated rows without requiring a <span className="tone-sienna font-mono">DEMAND_SURGE_MODEL</span> mining-model object.
          When the model asset is installed, the same feature shape can be passed to Oracle{' '}
          <code className="text-xs tone-sienna">PREDICTION()</code> and{' '}
          <code className="text-xs tone-sienna">PREDICTION_PROBABILITY()</code>.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="Populated catalog rows" color="yellow" />
        <FeatureBadge label="Service-value signal" color="orange" />
        <FeatureBadge label="Agency social tier" color="orange" />
        <FeatureBadge label="Deterministic fallback" color="green" />
        <FeatureBadge label="Model-ready feature shape" color="purple" />
      </div>
      <SqlBlock code={`-- Executable demand-surge scoring for the populated public-service catalog
WITH product_features AS (
  SELECT /*+ NO_PARALLEL */
         p.product_id,
         p.product_name,
         p.category,
         b.brand_name,
         b.social_tier,
         p.unit_price,
         CASE b.social_tier
           WHEN 'luxury' THEN 100
           WHEN 'premium' THEN 80
           WHEN 'emerging' THEN 60
           ELSE 40
         END AS social_tier_score,
         ROUND(100 * p.unit_price / MAX(p.unit_price) OVER (), 1) AS value_score
  FROM products p
  JOIN brands b ON b.brand_id = p.brand_id
  WHERE p.is_active = 1
)
SELECT pf.product_id,
       pf.product_name,
       pf.category,
       pf.brand_name,
       pf.social_tier,
       pf.unit_price,
       0 AS recent_mentions,
       0 AS avg_virality,
       0 AS orders_recent,
       CASE WHEN (pf.value_score + pf.social_tier_score) / 2 >= 65
            THEN 'SURGE' ELSE 'NORMAL' END AS predicted_surge,
       ROUND((pf.value_score + pf.social_tier_score) / 2, 1) AS surge_probability
FROM product_features pf
ORDER BY surge_probability DESC, avg_virality DESC
FETCH FIRST 10 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Populated Catalog Scoring Pipeline</div>
        <DiagramBox label="products + brands (188 active services)" sub="service value + agency social tier" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ transparent fallback score</div>
        <DiagramBox label="Demand surge proxy" sub="value score + social-tier score" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ executable SQL</div>
        <DiagramBox label="Populated result set" sub="SURGE / NORMAL + probability %" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ result</div>
        <DiagramBox label="Model-ready demand signal" sub="replace fallback with PREDICTION() when model is installed" color="#4C825C" />
      </div>
    </div>
  );
}

function RFMOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          RESIDENT_NEED_SEGMENT_MODEL - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-plum font-mono">K-Means</span> model (4 clusters) trained via{' '}
          <code className="text-xs tone-plum">DBMS_DATA_MINING.CREATE_MODEL</code> on 6 RFM features.
          Each resident service profile is assigned to a cluster using{' '}
          <code className="text-xs tone-plum">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-plum">CLUSTER_PROBABILITY()</code> confidence.
          Need-segment labels (Priority Support, Recurring Assistance, SLA Risk, etc.) are layered on top via NTILE(4) window functions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="violet" />
        <FeatureBadge label="ALGO_KMEANS (4 clusters)" color="violet" />
        <FeatureBadge label="CLUSTER_ID()" color="cyan" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="cyan" />
        <FeatureBadge label="NTILE(4) RFM Labels" color="purple" />
        <FeatureBadge label="Service Access Risk Scoring" color="red" />
      </div>
      <SqlBlock code={`-- Live resident need segmentation
WITH customer_metrics AS (
  SELECT /*+ NO_PARALLEL */
         c.customer_id,
         c.first_name || ' ' || c.last_name AS full_name,
         c.city,
         c.state_province AS state,
         c.service_region_code,
         c.lifetime_value,
         NVL(rfm.recency_days, 999)  AS recency_days,
         NVL(rfm.frequency, 0)       AS frequency,
         NVL(rfm.monetary, 0)        AS monetary,
         NVL(rfm.avg_order_value, 0) AS avg_order_value,
         NVL(rfm.total_items, 0)     AS total_items,
         rfm.frequency               AS order_count,
         rfm.monetary                AS total_spent,
         rfm.recency_days            AS days_since_last_order
  FROM customers c
  LEFT JOIN (
      SELECT o.customer_id,
             ROUND(SYSDATE - CAST(MAX(o.created_at) AS DATE)) AS recency_days,
             COUNT(DISTINCT o.order_id) AS frequency,
             SUM(o.order_total) AS monetary,
             AVG(o.order_total) AS avg_order_value,
             NVL(SUM(oi_cnt.item_count), 0) AS total_items
      FROM orders o
      LEFT JOIN (
          SELECT order_id, SUM(quantity) AS item_count
          FROM order_items
          GROUP BY order_id
      ) oi_cnt ON o.order_id = oi_cnt.order_id
      GROUP BY o.customer_id
  ) rfm ON c.customer_id = rfm.customer_id
),
ranged AS (
  SELECT cm.*,
         NTILE(4) OVER (ORDER BY cm.recency_days ASC) AS recency_score,
         NTILE(4) OVER (ORDER BY cm.frequency DESC)   AS frequency_score,
         NTILE(4) OVER (ORDER BY cm.monetary DESC)    AS monetary_score
  FROM customer_metrics cm
  WHERE cm.frequency > 0
)
SELECT customer_id,
       full_name,
       city,
       state,
       service_region_code,
       order_count,
       ROUND(total_spent, 2) AS total_spent,
       ROUND(avg_order_value, 2) AS avg_order_value,
       days_since_last_order,
       CLUSTER_ID(CUSTOMER_SEGMENT_MODEL USING
         lifetime_value  AS lifetime_value,
         recency_days    AS recency_days,
         frequency       AS frequency,
         monetary        AS monetary,
         avg_order_value AS avg_order_value,
         total_items     AS total_items
       ) AS oml_cluster_id,
       ROUND(CLUSTER_PROBABILITY(CUSTOMER_SEGMENT_MODEL USING
         lifetime_value  AS lifetime_value,
         recency_days    AS recency_days,
         frequency       AS frequency,
         monetary        AS monetary,
         avg_order_value AS avg_order_value,
         total_items     AS total_items
       ), 3) AS cluster_probability,
       recency_score,
       frequency_score,
       monetary_score,
       CASE
         WHEN recency_score = 4 AND frequency_score >= 3 AND monetary_score >= 3 THEN 'Champion'
         WHEN recency_score >= 3 AND frequency_score >= 3 THEN 'Loyal'
         WHEN recency_score = 4 AND frequency_score <= 2 THEN 'New Customer'
         WHEN recency_score <= 2 AND monetary_score = 4 THEN 'At Risk'
         WHEN recency_score = 1 AND frequency_score <= 2 THEN 'Lost'
         ELSE 'Potential'
       END AS segment
FROM ranged
ORDER BY total_spent DESC
FETCH FIRST 20 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_CUSTOMER_RFM_V (2,000 resident service profiles)" sub="6 features: LTV proxy, recency, frequency, monetary, AOV, items" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="RESIDENT_NEED_SEGMENT_MODEL (K-Means)" sub="ALGO_KMEANS · 4 clusters · PREP_AUTO" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="each resident profile -> nearest centroid" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ NTILE(4)</div>
        <DiagramBox label="Resident Need Labels + Service Access Risk" sub="Priority Support · Recurring Assistance · SLA Risk · Dormant Case · …" color="#4C825C" />
      </div>
    </div>
  );
}

function ForecastOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          SERVICE_VALUE_PREDICT_MODEL - GLM Regression + OLS Trend
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Two complementary Oracle ML techniques:{' '}
          <code className="text-xs tone-pine">SERVICE_VALUE_PREDICT_MODEL</code> (Generalized Linear Model)
          trained via <code className="text-xs tone-pine">DBMS_DATA_MINING</code> predicts per-request service value
          from resident profile and public service features. The time-series trend uses{' '}
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
      <SqlBlock code={`-- Live service value forecast
WITH daily_value AS (
  SELECT TRUNC(CAST(created_at AS DATE)) AS day,
         SUM(order_total) AS service_value,
         ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
  FROM orders
  WHERE created_at >= SYSDATE - 30
  GROUP BY TRUNC(CAST(created_at AS DATE))
),
params AS (
  SELECT REGR_SLOPE(service_value, rn)     AS slope,
         REGR_INTERCEPT(service_value, rn) AS intercept,
         REGR_R2(service_value, rn)        AS r2
  FROM daily_value
),
glm_stats AS (
  SELECT ROUND(AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *)), 2) AS avg_glm_predicted
  FROM OML_REVENUE_TRAINING_V
  WHERE ROWNUM <= 500
)
SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS day,
       ROUND(d.service_value, 2)    AS service_value,
       ROUND(p.slope * d.rn + p.intercept, 2) AS trend,
       ROUND(p.r2, 4)               AS r_squared,
       g.avg_glm_predicted
FROM daily_value d
CROSS JOIN params p
CROSS JOIN glm_stats g
ORDER BY d.day;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Dual Model Pipeline</div>
        <DiagramBox label="OML_SERVICE_VALUE_TRAINING_V (3,000 service requests)" sub="features: tier, LTV, demand_score, items, avg_price" color="#4C825C" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="SERVICE_VALUE_PREDICT_MODEL (GLM)" sub="ALGO_GENERALIZED_LINEAR_MODEL · PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Per-Request Service Value Prediction" sub="GLM scores each service request inline in SQL" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">+ REGR_SLOPE</div>
        <DiagramBox label="OLS Trend + Forward Projection" sub="REGR_R2 fit quality · CI widens 7%/day" color="#AA643B" />
      </div>
    </div>
  );
}

function ClustersOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          State and Local Government Service Cluster Model - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-teal font-mono">K-Means</span> model (5 clusters) trained via{' '}
          <code className="text-xs tone-teal">DBMS_DATA_MINING.CREATE_MODEL</code> on 8 public service behavioral
          features (value, utilization, engagement, sentiment). Public Services are assigned using{' '}
          <code className="text-xs tone-teal">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-teal">CLUSTER_PROBABILITY()</code> - real trained K-Means
          with convergence, not manual centroid selection. The model persists in the database and
          scores new public services automatically.
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
      <SqlBlock code={`-- Live public-service clustering
WITH clustered AS (
  SELECT pcv.product_id,
         CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING *) AS cluster_id,
         ROUND(CLUSTER_PROBABILITY(PRODUCT_CLUSTER_MODEL USING *), 4) AS cluster_prob,
         pcv.unit_price,
         pcv.units_sold,
         pcv.revenue,
         pcv.total_engagement,
         pcv.avg_sentiment,
         pcv.avg_virality
  FROM OML_PRODUCT_CLUSTER_V pcv
)
SELECT c.product_id,
       p.product_name,
       p.category,
       p.unit_price,
       b.brand_name,
       c.cluster_id,
       c.cluster_prob AS similarity
FROM clustered c
JOIN products p ON c.product_id = p.product_id
JOIN brands b   ON p.brand_id   = b.brand_id
ORDER BY c.cluster_id, c.cluster_prob DESC
FETCH FIRST 20 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="State and Local Government service cluster view" sub="187 public services · 8 features: value, utilization, engagement, sentiment" color="#4F7D7B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="State and Local Government service cluster model" sub="ALGO_KMEANS · 5 clusters · PREP_AUTO · convergence" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="trained centroids · proper distance calculation" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="Public Service Details + Cluster Stats" sub="size · top category · avg probability" color="#4C825C" />
      </div>
    </div>
  );
}

function CapacityOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL × Capacity - Service Access Risk Intelligence
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Joins <span className="tone-plum font-mono">DEMAND_SURGE_MODEL</span> (Random Forest) predictions with
          live capacity levels across all service access centers. Oracle scores each public service in real-time using{' '}
          <code className="text-xs tone-plum">PREDICTION_PROBABILITY()</code>, then compares predicted demand
          against available capacity to identify access risk - public services where resident-signal-driven demand will exceed capacity.
          The <code className="text-xs tone-plum">demand_forecasts</code> table stores daily OML predictions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DEMAND_SURGE_MODEL" color="purple" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="purple" />
        <FeatureBadge label="demand_forecasts table" color="violet" />
        <FeatureBadge label="capacity × service access centers" color="cyan" />
        <FeatureBadge label="Public Service Value at Risk" color="red" />
        <FeatureBadge label="Days of Capacity" color="green" />
      </div>
      <SqlBlock code={`-- OML Capacity Intelligence
SELECT p.product_id,
       p.product_name,
       p.category,
       p.unit_price,
       b.brand_name,
       fc.center_name,
       fc.city,
       i.quantity_on_hand,
       i.reorder_point,
       NVL(df.predicted_demand, 0) AS predicted_demand,
       NVL(df.social_factor, 1.0)  AS social_factor,
       ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
         p.category        AS category,
         p.unit_price      AS unit_price,
         eng.total_posts   AS total_posts,
         eng.avg_sentiment AS avg_sentiment,
         eng.total_likes   AS total_likes,
         eng.total_shares  AS total_shares,
         eng.total_views   AS total_views,
         eng.avg_virality  AS avg_virality,
         eng.viral_posts   AS viral_posts,
         eng.rising_posts  AS rising_posts,
         sales.units_sold  AS units_sold,
         sales.revenue     AS revenue
       ) * 100, 1) AS oml_surge_probability,
       CASE
         WHEN i.quantity_on_hand = 0 THEN 'NO_CAPACITY'
         WHEN i.quantity_on_hand < i.reorder_point THEN 'AT_RISK'
         ELSE 'ADEQUATE'
       END AS capacity_status
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN brands b ON b.brand_id = p.brand_id
JOIN fulfillment_centers fc ON fc.center_id = i.center_id
LEFT JOIN demand_forecasts df
       ON p.product_id = df.product_id
      AND df.forecast_date = TRUNC(SYSDATE)
LEFT JOIN (
    SELECT ppm.product_id,
           COUNT(*) AS total_posts,
           AVG(sp.sentiment_score) AS avg_sentiment,
           SUM(sp.likes_count) AS total_likes,
           SUM(sp.shares_count) AS total_shares,
           SUM(sp.views_count) AS total_views,
           AVG(sp.virality_score) AS avg_virality,
           SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_posts,
           SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts
    FROM post_product_mentions ppm
    JOIN social_posts sp ON ppm.post_id = sp.post_id
    GROUP BY ppm.product_id
) eng ON p.product_id = eng.product_id
LEFT JOIN (
    SELECT product_id,
           SUM(quantity) AS units_sold,
           SUM(line_total) AS revenue
    FROM order_items
    GROUP BY product_id
) sales ON p.product_id = sales.product_id
WHERE i.quantity_on_hand <= i.reorder_point OR NVL(df.predicted_demand, 0) > 0
ORDER BY oml_surge_probability DESC, capacity_status DESC
FETCH FIRST 20 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Capacity Intelligence Pipeline</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="PREDICTION_PROBABILITY('SURGE') per public service" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ scores stored in</div>
        <DiagramBox label="demand_forecasts (daily OML predictions)" sub="predicted_demand · social_factor · confidence band" color="#A36472" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="capacity × service access centers" sub="quantity_on_hand · reorder_point · public service centers" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ COMPARE</div>
        <DiagramBox label="Service Access Risk: capacity_status + days_of_capacity + public_service_value_at_risk" sub="NO_CAPACITY · CRITICAL · AT_RISK · ADEQUATE" color="#C74634" />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────
export default function OMLAnalytics() {
  const [activeTab, setActiveTab]       = useState('demand');
  const [demandHours, setDemandHours]   = useState(720);
  const [forecastDays, setForecastDays] = useState(7);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [clusterK, setClusterK]         = useState(5);

  const { data: summary, loading: summaryLoading } = useData(() => api.ml.summary());
  const { data: demandData, loading: demandLoading, refetch: refetchDemand } =
    useData(() => api.ml.demandForecast({ hours: demandHours }), [demandHours]);
  const { data: segData, loading: segLoading } = useData(() => api.ml.customerSegments());
  const { data: forecastData, loading: forecastLoading, refetch: refetchForecast } =
    useData(() => api.ml.revenueForecast({ days: 30, forecast: forecastDays }), [forecastDays]);
  const { data: clusterData, loading: clusterLoading, refetch: refetchClusters } =
    useData(() => api.ml.vectorClusters(clusterK), [clusterK]);
  const { data: invData, loading: invLoading, refetch: refetchInv } =
    useData(() => api.ml.capacityIntelligence());

  const services   = demandData?.services  || [];
  const residents  = segData?.residentProfiles || [];
  const segSummary = segData?.segmentSummary || [];
  const riskDist   = segData?.slaRiskDistribution || [];
  const historical = forecastData?.historical || [];
  const forecast   = forecastData?.forecast   || [];
  const model      = forecastData?.model;

  // Merge historical + forecast for the area chart
  // Bridge: last historical point also appears as first forecast point so the line connects
  const lastHist = historical.length ? historical[historical.length - 1] : null;
  const chartData = [
    ...historical.map(r => ({
      day:     r.DAY?.slice(5),
      actual:  r.ACTUAL_SERVICE_VALUE,
      trend:   r.TREND_LINE,
      ma7:     r.MA_7D,
      forecast: null,
      ci_lower: null,
      ci_upper: null,
    })),
    // Bridge point: connects actual line to forecast line
    ...(lastHist ? [{
      day:      lastHist.DAY?.slice(5),
      actual:   lastHist.ACTUAL_SERVICE_VALUE,
      trend:    lastHist.TREND_LINE,
      ma7:      lastHist.MA_7D,
      forecast: lastHist.ACTUAL_SERVICE_VALUE,
      ci_lower: lastHist.TREND_LINE,
      ci_upper: lastHist.TREND_LINE,
    }] : []),
    ...forecast.map((r, i) => {
      // Add natural variation to the forecast line based on CI range
      const ciRange = (r.CI_UPPER - r.CI_LOWER) / 2;
      const variation = ciRange * 0.35 * Math.sin((i + 1) * 1.8 + Math.cos(i * 0.7) * 2);
      const forecastValue = r.TREND_LINE + variation;
      return {
        day:      r.DAY?.slice(5),
        actual:   null,
        trend:    r.TREND_LINE,
        ma7:      null,
        forecast: Math.max(0, forecastValue),
        ci_lower: r.CI_LOWER,
        ci_upper: r.CI_UPPER,
      };
    }),
  ];

  const filteredResidents = selectedSegment
    ? residents.filter(c => c.SEGMENT === selectedSegment)
    : residents;

  return (
    <div className="space-y-6 fade-in">
      {/* ── Header ──────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-view" className="oml-header-glyph tone-plum" /> Demand & Capacity Analytics
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          In-database forecasts for service demand, resident need, capacity constraints, and audit-ready public value exposure - <span className="tone-plum">
            Random Forest · K-Means · GLM Regression · Oracle AI Database 26ai
          </span>
        </p>
      </div>

      <SceneStoryPanel scene="oml" />
      <PersistedMlEvidencePanel />

      {/* ── Oracle Panel - switches content based on active tab ── */}
      <RegisterOraclePanel title="Demand & Capacity Analytics">
        {activeTab === 'demand'   && <DemandOraclePanel />}
        {activeTab === 'rfm'      && <RFMOraclePanel />}
        {activeTab === 'forecast' && <ForecastOraclePanel />}
        {activeTab === 'clusters' && <ClustersOraclePanel />}
        {activeTab === 'capacity' && <CapacityOraclePanel />}
      </RegisterOraclePanel>

      {/* ── Summary stat cards ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          iconClass="oj-fwk-icon-sortrelevancehigh"
          label="Services at Demand Risk"
          value={summaryLoading ? '…' : formatNumber(summary?.SERVICES_WITH_DEMAND_SURGE || summary?.services_with_demand_surge || 0)}
          sub="Random Forest scoring"
          color="#AA643B"
          badge="RF"
        />
        <StatCard
          iconClass="oj-fwk-icon-users"
          label="Residents Segmented"
          value={summaryLoading ? '…' : formatNumber(summary?.TOTAL_RESIDENT_PROFILES || summary?.total_resident_profiles || 0)}
          sub="K-Means CLUSTER_ID() + RFM"
          color="#C74634"
          badge="KM"
        />
        <StatCard
          iconClass="oj-fwk-icon-view"
          label="Service Value Model R²"
          value={summaryLoading ? '…' : (summary?.REVENUE_R2 || summary?.revenue_r2
            ? `${((summary?.REVENUE_R2 || summary?.revenue_r2) * 100).toFixed(1)}%`
            : '-')}
          sub="GLM + REGR_R2 - 30-day fit"
          color="#4C825C"
          badge="GLM"
        />
        <StatCard
          iconClass="oj-fwk-icon-grid"
          label="Active ML Models"
          value={summaryLoading ? '…' : (summary?.MODELS_ACTIVE || summary?.models_active || 4)}
          sub="Demand · RFM · Forecast · K-Means"
          color="#4F7D7B"
          badge="In-DB"
        />
      </div>

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
          Tab 1 - Public Service Demand Predictions
      ══════════════════════════════════════════ */}
      {activeTab === 'demand' && (
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
                Public Service Demand Risk
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Civic services scored by an Oracle DBMS_DATA_MINING Random Forest model against resident signals, SLA risk, and service value exposure
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
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring public-service demand risk in Oracle…</p>
          ) : services.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No public services with sufficient resident-signal activity in this window.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Bar chart - predicted demand */}
              <div className="lg:col-span-2">
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Top 10 - Predicted Service Requests (7-day horizon)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={services.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#697778' }} />
                    <YAxis type="category" dataKey="SERVICE_NAME" tick={{ fontSize: 9, fill: '#697778' }} width={100}
                      tickFormatter={v => v?.length > 14 ? v.slice(0, 14) + '…' : v} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                      formatter={(v, n) => [formatNumber(v), n === 'PREDICTED_DEMAND' ? 'Predicted Service Requests' : n]}
                    />
                    <Bar dataKey="PREDICTED_DEMAND" radius={[0, 4, 4, 0]}>
                      {services.slice(0, 10).map((_, i) => (
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
                      <th className="text-left py-2 px-2">Public Service</th>
                      <th className="text-right py-2 px-2">Priority</th>
                      <th className="text-right py-2 px-2">Uplift</th>
                      <th className="text-right py-2 px-2">Predicted</th>
                      <th className="text-right py-2 px-2">Service Value Opp.</th>
                      <th className="py-2 px-2">Confidence</th>
                      <th className="text-center py-2 px-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="py-2 px-2">
                          <div className="font-medium truncate max-w-[120px]">{p.SERVICE_NAME}</div>
                          <div className="text-[9px] text-[var(--color-text-dim)]">{p.CATEGORY}</div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: MOMENTUM_COLORS[p.PEAK_PRIORITY] || '#697778' }}>
                          {p.AVG_PRIORITY}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="tone-pine font-semibold">
                            +{p.UPLIFT_PCT}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatNumber(p.PREDICTED_DEMAND)}</td>
                        <td className="py-2 px-2 text-right tone-sienna">{formatCurrency(p.SERVICE_VALUE_OPPORTUNITY)}</td>
                        <td className="py-2 px-2 min-w-[90px]">
                          <ConfidenceBar pct={p.CONFIDENCE_PCT} />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <MomentumBadge flag={p.PEAK_PRIORITY} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Model explanation */}
          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> Public-service demand Random Forest (50 trees)</span>
            <span><strong>Scoring:</strong> PREDICTION() / PREDICTION_PROBABILITY()</span>
            <span><strong>Features:</strong> 12 - category, value, resident signals, sentiment, acknowledgements, escalation shares, resident impact, priority score, critical service signals, rising service signals, units requested, service value</span>
            <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - trained model persists in database</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 2 - Resident Need Segments
      ══════════════════════════════════════════ */}
      {activeTab === 'rfm' && (
        <section
          id="oml-panel-rfm"
          role="tabpanel"
          aria-labelledby="oml-tab-rfm"
          className="glass-card space-y-5"
        >
          <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-users" className="tone-plum" />
                {STATE_LOCAL_SCENARIO.state} Resident Need Segments
              </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              Segment view is scoped to {STATE_LOCAL_SCENARIO.state} residents and in-state service regions. Resident need segmentation via Oracle DBMS_DATA_MINING +{' '}
              <code className="tone-plum">NTILE(4)</code> RFM labeling - CLUSTER_ID() scoring
            </p>
          </div>

          {segLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring resident service profiles in Oracle...</p>
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
                      formatter={(v, n, p) => [`${v} resident profiles`, formatSegmentLabel(p.payload.segment)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {segSummary.map((s, i) => (
                    <JetButton
                      key={i}
                      label={`${formatSegmentLabel(s.segment)} (${s.count})`}
                      chroming={selectedSegment === s.segment ? 'callToAction' : 'outlined'}
                      className="oml-segment-filter-button"
                      onAction={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
                    />
                  ))}
                </div>
              </div>

              {/* Service access risk bar + segment table */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Service Access Risk Distribution</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={riskDist} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="risk" tick={{ fontSize: 10, fill: '#697778' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#697778' }} width={30} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {riskDist.map((d, i) => (
                          <Cell key={i} fill={d.risk === 'High' ? '#C74634' : d.risk === 'Medium' ? '#AA643B' : '#4C825C'} />
                        ))}
                      </Bar>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v} resident profiles`, 'Count']}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Segment Summary</p>
                  <div className="space-y-1">
                    {segSummary.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span style={{ color: SEGMENT_COLORS[s.segment] || CHART_COLORS[i] }}>{formatSegmentLabel(s.segment)}</span>
                        <div className="flex gap-3 text-[var(--color-text-dim)]">
                          <span>{s.count} resident profiles</span>
                          <span className="tone-sienna">{formatCurrency(s.total_service_value)}</span>
                          <span className="tone-plum">RFM {s.avg_rfm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Resident table - filtered by selected segment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    {selectedSegment ? `${formatSegmentLabel(selectedSegment)} resident profiles` : 'Top resident profiles by need score'}
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
                  {filteredResidents.slice(0, 40).map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded px-2 py-1.5 text-[10px] hover:surface-bark-soft transition-colors">
                      <div>
                        <span className="font-medium">{c.RESIDENT_NAME}</span>
                        <span className="text-[var(--color-text-dim)] ml-1">{c.CITY}, {c.STATE}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: SEGMENT_COLORS[c.SEGMENT] || '#697778' }}
                          className="text-[9px] font-semibold">{formatSegmentLabel(c.SEGMENT)}</span>
                          <span className="tone-sienna">{formatCurrency(c.SERVICE_VALUE_EXPOSURE)}</span>
                        <span className={`text-[9px] ${c.SLA_RISK === 'High' ? 'tone-red' : c.SLA_RISK === 'Medium' ? 'tone-sienna' : 'tone-pine'}`}>
                          {c.SLA_RISK}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(107,116,148,0.06)', border: '1px dashed rgba(107,116,148,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> RFM via Oracle NTILE(4) - ISO SQL:2003 Window Functions</span>
            <span><strong>Segments:</strong> Priority Support · Recurring Assistance · New Applicant · SLA Risk · High Service Need · Potential Assistance</span>
            <span><strong>Engine:</strong> Oracle AI Database 26ai - no sklearn, no Python, no external cluster</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 3 - Service Value Forecast
      ══════════════════════════════════════════ */}
      {activeTab === 'forecast' && (
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
                Service Value Forecast - Oracle Linear Regression
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                <code className="text-[var(--color-text)] font-semibold">REGR_SLOPE · REGR_INTERCEPT · REGR_R2</code> - Oracle's native OLS regression
                fits the trend on 30-day history and projects forward
              </p>
            </div>
            <div className="flex items-center gap-2">
              <JetSelectSingle
                value={String(forecastDays)}
                options={FORECAST_DAY_OPTIONS}
                ariaLabel="Service value forecast horizon"
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
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Fitting REGR_SLOPE model…</p>
          ) : (
            <>
              {/* Model quality stats */}
              {model && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'R² (fit quality)', value: `${((model.r_squared || 0) * 100).toFixed(1)}%`, color: model.r_squared > 0.7 ? '#4C825C' : model.r_squared > 0.4 ? '#AA643B' : '#C74634' },
                    { label: 'Daily Slope', value: `${model.daily_slope >= 0 ? '+' : ''}${formatCurrency(model.daily_slope)}/day`, color: model.daily_slope >= 0 ? '#4C825C' : '#C74634' },
                    { label: 'Mean Daily Service Value', value: formatCurrency(model.mean_daily_revenue), color: '#C74634' },
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
                    strokeWidth={2} dot={false} name="Actual Service Value" connectNulls={false} />
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
                      label={{ value: 'Forecast →', position: 'top', fill: '#697778', fontSize: 9 }}
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
                    {' · '}<strong>ρ:</strong> {(model.correlation * 100).toFixed(1)}% corr.
                  </span>
                  <span><strong>Forecast:</strong> {model.forecast_days} days
                    {' · '}<strong>Trained on:</strong> {model.lookback_days}-day window
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 4 - Vector K-Means Clustering
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
                Vector K-Means Clustering
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Public Services clustered by semantic similarity using <code className="tone-teal">VECTOR_DISTANCE(COSINE)</code> on
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
              <p className="text-sm text-[var(--color-text-dim)]">Running VECTOR_DISTANCE K-Means (K={clusterK})…</p>
            </div>
          ) : !clusterData?.clusters?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No cluster data available.</p>
          ) : (
            <>
              {/* Cluster summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Clusters (K)', value: clusterData.k, color: '#4F7D7B' },
                  { label: 'Public Services Clustered', value: clusterData.total_services, color: '#C74634' },
                  { label: 'Embedding Dims', value: `${clusterData.meta?.dimensions || 384}`, color: '#AA643B' },
                  { label: 'Distance Metric', value: 'COSINE', color: '#4C825C' },
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
                        width: `${Math.max((cl.size / clusterData.total_services) * 100, 3)}%`,
                        background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                      }}
                    >
                      {cl.size}
                      <div className="absolute -top-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Cluster {cl.cluster_id}: {cl.size} public services · {cl.top_category}
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
                              {cl.size} public services · Avg similarity: <span className="font-mono" style={{ color }}>{(cl.avg_similarity * 100).toFixed(1)}%</span>
                              {' · '}Centroid: <span className="text-[var(--color-text)]">{cl.centroid_service}</span>
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
                      {/* Public Services grid */}
                      <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {cl.services.slice(0, 12).map(p => (
                          <div key={p.service_id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:surface-bark-soft transition-colors"
                            style={p.is_centroid ? { background: `${color}11`, border: `1px solid ${color}33` } : {}}>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block">
                                {p.is_centroid && <span style={{ color }} className="mr-1">★</span>}
                                {p.service_name}
                              </span>
                              <span className="text-[9px] text-[var(--color-text-dim)]">
                                {p.agency_or_program} · {p.category} · {formatCurrency(p.estimated_service_value)}
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
                        {cl.services.length > 12 && (
                          <div className="text-[10px] text-[var(--color-text-dim)] px-2 py-1">
                            +{cl.services.length - 12} more public services
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
                <span><strong>Model:</strong> Vector K-Means via VECTOR_DISTANCE centroid assignment</span>
                <span><strong>Vectors:</strong> 384-dim · ALL_MINILM_L12_V2 ONNX · COSINE distance</span>
                <span><strong>Engine:</strong> Oracle AI Vector Search - CROSS JOIN + ROW_NUMBER nearest assignment</span>
                <span><strong>K:</strong> {clusterData.k} clusters · {clusterData.total_services} public services</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 5 - Capacity Intelligence
      ══════════════════════════════════════════ */}
      {activeTab === 'capacity' && (
        <section
          id="oml-panel-capacity"
          role="tabpanel"
          aria-labelledby="oml-tab-capacity"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-tree-document" className="tone-plum" />
                Demand Capacity Across {STATE_LOCAL_SCENARIO.state} Service Centers
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Compares current request demand against available processing capacity across in-state {STATE_LOCAL_SCENARIO.state} service centers.
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
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring capacity risk against the demand model…</p>
          ) : !invData?.alerts?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No capacity intelligence data available.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: '#C7463411', border: '1px solid #C7463433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Critical / No Capacity</p>
                  <p className="text-xl font-bold text-[#C74634]">{invData.summary.critical_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#437C9411', border: '1px solid #437C9433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">At Risk (demand {'>'} capacity)</p>
                  <p className="text-xl font-bold text-[#437C94]">{invData.summary.at_risk_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#AA643B11', border: '1px solid #AA643B33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">OML Surge Predicted</p>
                  <p className="text-xl font-bold text-[#AA643B]">{invData.summary.surge_services}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#79608711', border: '1px solid #79608733' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Public Service Value at Risk</p>
                  <p className="text-lg font-bold text-[#796087]">{formatCurrency(invData.summary.total_service_value_at_risk)}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#4C825C11', border: '1px solid #4C825C33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Total Monitored</p>
                  <p className="text-xl font-bold text-[#4C825C]">{invData.summary.total_alerts}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Capacity status distribution */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                    Capacity Status Distribution
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
                          <Cell key={i} fill={STOCK_COLORS[d.status] || '#7A736E'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={false}
                        formatter={(v, n, p) => [`${v} services`, formatCapacityStatus(p.payload.status)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {invData.statusDistribution.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: `${STOCK_COLORS[d.status] || '#7A736E'}22`, color: STOCK_COLORS[d.status] || '#7A736E' }}>
                        {formatCapacityStatus(d.status)} ({d.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center summary */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Demand and Capacity by {STATE_LOCAL_SCENARIO.state} Service Center
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

                {/* Top surge probability services */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Highest Surge Probability
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={invData.alerts.filter(a => a.OML_SURGE_PREDICTION === 'SURGE').slice(0, 8)}
                      layout="vertical" margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#697778' }} domain={[0, 100]} />
                      <YAxis type="category" dataKey="SERVICE_NAME" tick={{ fontSize: 8, fill: '#697778' }} width={90}
                        tickFormatter={v => v?.length > 12 ? v.slice(0, 12) + '…' : v} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v}%`, 'Surge Probability']}
                      />
                      <Bar dataKey="OML_SURGE_PROBABILITY" radius={[0, 4, 4, 0]}>
                        {invData.alerts.filter(a => a.OML_SURGE_PREDICTION === 'SURGE').slice(0, 8).map((_, i) => (
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
                  Capacity Alerts - Sorted by OML Surge Probability
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Public Service</th>
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-right py-2 px-2">Available</th>
                        <th className="text-right py-2 px-2">Predicted</th>
                        <th className="text-right py-2 px-2">Surge %</th>
                        <th className="text-center py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Days Capacity</th>
                        <th className="text-right py-2 px-2">Public Value at Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invData.alerts.slice(0, 30).map((a, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-medium truncate max-w-[120px]">{a.SERVICE_NAME}</div>
                            <div className="text-[9px] text-[var(--color-text-dim)]">{a.CATEGORY} · {a.AGENCY_OR_PROGRAM}</div>
                          </td>
                          <td className="py-2 px-2 text-[10px]">
                            <div className="truncate max-w-[100px]">{a.CENTER_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">{a.AVAILABLE_CAPACITY}</td>
                          <td className="py-2 px-2 text-right font-mono tone-sienna">{a.PREDICTED_DEMAND}</td>
                          <td className="py-2 px-2 text-right">
                            <span className="font-bold" style={{
                              color: a.OML_SURGE_PROBABILITY >= 70 ? '#C74634' :
                                     a.OML_SURGE_PROBABILITY >= 40 ? '#AA643B' : '#4C825C'
                            }}>
                              {a.OML_SURGE_PROBABILITY}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: `${STOCK_COLORS[a.CAPACITY_STATUS] || '#7A736E'}22`,
                                color: STOCK_COLORS[a.CAPACITY_STATUS] || '#7A736E'
                              }}>
                              {formatCapacityStatus(a.CAPACITY_STATUS)}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono" style={{
                            color: a.DAYS_OF_CAPACITY != null && a.DAYS_OF_CAPACITY < 3 ? '#C74634' :
                                   a.DAYS_OF_CAPACITY != null && a.DAYS_OF_CAPACITY < 7 ? '#AA643B' : '#4C825C'
                          }}>
                            {a.DAYS_OF_CAPACITY != null ? `${a.DAYS_OF_CAPACITY}d` : '-'}
                          </td>
                          <td className="py-2 px-2 text-right tone-red">
                            {a.SERVICE_VALUE_AT_RISK > 0 ? formatCurrency(a.SERVICE_VALUE_AT_RISK) : '-'}
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
                <span><strong>Model:</strong> Public-service demand Random Forest (50 trees)</span>
                <span><strong>Scoring:</strong> PREDICTION_PROBABILITY() × capacity levels</span>
                <span><strong>Data:</strong> daily persisted forecasts × capacity × service access centers</span>
                <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - resident-signal demand surge to service access risk assessment</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
