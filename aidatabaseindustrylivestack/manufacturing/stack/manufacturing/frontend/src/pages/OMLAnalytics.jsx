import { useMemo, useState } from 'react';
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
import { SceneStoryPanel } from '../components/ManufacturingStory';
import { DefinitionRow } from '../components/MetricDefinition';

// ── Color palette ──────────────────────────────────────
const SEGMENT_COLORS = {
  Champion:       '#AA643B',
  Loyal:          '#4C825C',
  'New Customer': '#4F7D7B',
  'At Risk':      '#C74634',
  Lost:           '#7A736E',
  'Big Spender':  '#796087',
  Promising:      '#437C94',
  Potential:      '#6F757E',
};

const MOMENTUM_COLORS = {
  critical: '#C74634',
  escalating:      '#AA643B',
  elevated:     '#AA643B',
  stable:     '#7A736E',
};

const MOMENTUM_LABELS = {
  critical: 'Critical surge',
  escalating: 'Escalating',
  elevated: 'Elevated',
  stable: 'Stable',
};

const CHART_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B'];

// ── Tab definitions ────────────────────────────────────
const CLUSTER_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B','#437C94','#4C825C','#796087','#A36472','#4F7D7B','#5F7D4F','#AA643B'];

const TABS = [
  { key: 'demand',    label: 'Production Demand Predictions',             buttonLabel: 'Demand Surge',     iconClass: 'oj-fwk-icon-sortrelevancehigh', color: '#AA643B' },
  { key: 'rfm',       label: 'Customer / OEM Segmentation',            buttonLabel: 'Customer Segments',      iconClass: 'oj-fwk-icon-users',             color: '#C74634' },
  { key: 'forecast',  label: 'Order Value Forecast - Linear Regression', buttonLabel: 'Order Value Forecast',          iconClass: 'oj-fwk-icon-view',              color: '#4C825C' },
  { key: 'clusters',  label: 'Manufactured Part Clustering',            buttonLabel: 'Part Clusters',    iconClass: 'oj-fwk-icon-grid',              color: '#4F7D7B' },
  { key: 'capacity', label: 'Capacity Risk Intelligence',               buttonLabel: 'Capacity Risk',         iconClass: 'oj-fwk-icon-tree-document',     color: '#796087' },
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

const DEMAND_METRIC_DEFINITIONS = [
  { label: 'Urgency', description: 'average production-signal urgency for the part', scale: '0-100' },
  { label: 'Uplift', description: 'DEMAND_SURGE_MODEL probability of surge class', scale: '%' },
  { label: 'Predicted', description: 'probability-weighted work-order demand for the forecast horizon', scale: '7-day units' },
];

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
  const label = MOMENTUM_LABELS[flag] || flag?.replace('_', ' ') || '-';
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
          DEMAND_SURGE_MODEL - Random Forest Classification
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-sienna font-mono">Random Forest</span> model (50 trees) trained via{' '}
          <code className="text-xs tone-sienna">DBMS_DATA_MINING.CREATE_MODEL</code> on 12 production-signal engagement
          and work-order value features. Oracle scores every manufactured part <em>inline</em> at query time using{' '}
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
    target_column_name  => 'TARGET_SURGE',
    settings_table_name => 'DEMAND_SURGE_SETTINGS'
    -- ALGO_RANDOM_FOREST, 50 trees, PREP_AUTO_ON
  );
END;

-- Step 2: Score manufactured parts in real-time SQL
SELECT p.product_name, p.category,

  -- Random Forest prediction: SURGE or NORMAL
  PREDICTION(DEMAND_SURGE_MODEL USING
    p.category, p.unit_price,
    eng.production_signal_count, eng.avg_sentiment,
    eng.total_acknowledgements, eng.total_propagations,
    eng.total_observations, eng.average_urgency_score,
    eng.escalating_signal_count, eng.elevated_signal_count,
    sales.units_sold, sales.revenue
  ) AS predicted_surge,

  -- Probability of SURGE class (0.0 – 1.0)
  ROUND(PREDICTION_PROBABILITY(
    DEMAND_SURGE_MODEL, 'SURGE' USING ...
  ) * 100, 1) AS surge_probability

FROM products p
JOIN product_engagement eng ...
JOIN work_order_value sales ...
ORDER BY surge_probability DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING Pipeline</div>
        <DiagramBox label="OML_DEMAND_TRAINING_V" sub="Live manufactured-part training rows · 12 operational features" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ CREATE_MODEL</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="ALGO_RANDOM_FOREST · 50 trees · PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ PREDICTION()</div>
        <DiagramBox label="Real-Time Scoring in SQL" sub="PREDICTION_PROBABILITY('SURGE' USING *)" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ result</div>
        <DiagramBox label="SURGE / NORMAL + probability %" sub="scored inline · no ETL · model persists in DB" color="#4C825C" />
      </div>
    </div>
  );
}

function RFMOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          CUSTOMER_SEGMENT_MODEL - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-plum font-mono">K-Means</span> model (4 clusters) trained via{' '}
          <code className="text-xs tone-plum">DBMS_DATA_MINING.CREATE_MODEL</code> on 6 RFM features.
          Each customer account is assigned to a cluster using{' '}
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
        <FeatureBadge label="Repeat Order Risk Scoring" color="red" />
      </div>
      <SqlBlock code={`-- Step 1: Train K-Means model (one-time)
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name      => 'CUSTOMER_SEGMENT_MODEL',
    mining_function => DBMS_DATA_MINING.CLUSTERING,
    data_table_name => 'OML_CUSTOMER_RFM_V',
    case_id_column_name => 'CUSTOMER_ID',
    settings_table_name => 'CUST_SEGMENT_SETTINGS'
    -- ALGO_KMEANS, 4 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score customer accounts with CLUSTER_ID()
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
        <DiagramBox label="OML_CUSTOMER_RFM_V" sub="Live customer-account training rows · 6 RFM features" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="CUSTOMER_SEGMENT_MODEL (K-Means)" sub="ALGO_KMEANS · 4 clusters · PREP_AUTO" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="each customer account -> nearest centroid" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ NTILE(4)</div>
        <DiagramBox label="Segment Labels + Repeat Order Risk" sub="Champion · Loyal · At Risk · Lost" color="#4C825C" />
      </div>
    </div>
  );
}

function ForecastOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          REVENUE_PREDICT_MODEL - GLM Regression + OLS Trend
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Two complementary Oracle ML techniques:{' '}
          <code className="text-xs tone-pine">REVENUE_PREDICT_MODEL</code> (Generalized Linear Model)
          trained via <code className="text-xs tone-pine">DBMS_DATA_MINING</code> predicts per-work-order value
          from customer account and manufactured part features. The time-series trend uses{' '}
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
    case_id_column_name => 'WORK_ORDER_ID',
    target_column_name  => 'TARGET_REVENUE',
    settings_table_name => 'REVENUE_PREDICT_SETTINGS'
    -- ALGO_GENERALIZED_LINEAR_MODEL, PREP_AUTO_ON
  );
END;

-- Step 2: Score work orders + time-series trend
WITH daily_value AS (
  SELECT TRUNC(CAST(created_at AS DATE)) AS day,
    SUM(work_order_value) AS part_value,
    ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
  FROM manufacturing_work_orders
  WHERE created_at >= SYSDATE - 30
  GROUP BY TRUNC(CAST(created_at AS DATE))
),
params AS (
  SELECT REGR_SLOPE(part_value, rn)     AS slope,
         REGR_INTERCEPT(part_value, rn) AS intercept,
         REGR_R2(part_value, rn)        AS r2
  FROM daily_value
),
-- GLM model: per-request predicted order value
glm_stats AS (
  SELECT AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *))
    AS avg_predicted
  FROM OML_REVENUE_TRAINING_V
)
SELECT day, part_value, slope * rn + intercept AS trend,
  r2, avg_predicted
FROM daily_value CROSS JOIN params CROSS JOIN glm_stats;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Dual Model Pipeline</div>
        <DiagramBox label="OML_REVENUE_TRAINING_V" sub="Live work-order training rows · tier, value, demand, items, avg price" color="#4C825C" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="REVENUE_PREDICT_MODEL (GLM)" sub="ALGO_GENERALIZED_LINEAR_MODEL · PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Per-Work Order Value Prediction" sub="GLM scores each work order inline in SQL" color="#437C94" />
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
          PRODUCT_CLUSTER_MODEL - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-teal font-mono">K-Means</span> model (5 clusters) trained via{' '}
          <code className="text-xs tone-teal">DBMS_DATA_MINING.CREATE_MODEL</code> on 8 manufactured part operational
          features (value, utilization, engagement, sentiment). Manufactured Parts are assigned using{' '}
          <code className="text-xs tone-teal">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-teal">CLUSTER_PROBABILITY()</code> - real trained K-Means
          with convergence, not manual centroid selection. The model persists in the database and
          scores new manufactured parts automatically.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="cyan" />
        <FeatureBadge label="ALGO_KMEANS (5 clusters)" color="cyan" />
        <FeatureBadge label="CLUSTER_ID()" color="purple" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="purple" />
        <FeatureBadge label="8 Operational Features" color="green" />
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
    settings_table_name => 'PRODUCT_CLUSTER_SETTINGS'
    -- ALGO_KMEANS, 5 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score manufactured parts with CLUSTER_ID()
SELECT p.product_name, p.category, p.unit_price,

  -- K-Means cluster assignment
  CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING
    pcv.unit_price, pcv.weight_kg,
    pcv.units_sold, pcv.revenue,
    pcv.order_count, pcv.total_engagement,
    pcv.avg_sentiment, pcv.average_urgency_score
  ) AS cluster_id,

  -- Membership probability (0.0 – 1.0)
  ROUND(CLUSTER_PROBABILITY(
    PRODUCT_CLUSTER_MODEL USING *
  ), 4) AS cluster_prob

FROM OML_PRODUCT_CLUSTER_V pcv
JOIN products p ON pcv.PRODUCT_ID = p.PRODUCT_ID
ORDER BY cluster_id, cluster_prob DESC;

-- Training view features:
-- unit_price, weight_kg, units_sold, revenue,
-- order_count, total_engagement, avg_sentiment,
-- average_urgency_score`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_PRODUCT_CLUSTER_V" sub="Live manufactured-part training rows · 8 operational features" color="#4F7D7B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="PRODUCT_CLUSTER_MODEL (K-Means)" sub="ALGO_KMEANS · 5 clusters · PREP_AUTO · convergence" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="trained centroids · proper distance calculation" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="Manufactured Part Details + Cluster Stats" sub="size · top category · avg probability" color="#4C825C" />
      </div>
    </div>
  );
}

function CapacityOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL × Capacity - Plant Capacity Risk Intelligence
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Joins <span className="tone-plum font-mono">DEMAND_SURGE_MODEL</span> (Random Forest) predictions with
          live capacity levels across all plant capacity centers. Oracle scores each manufactured part in real-time using{' '}
          <code className="text-xs tone-plum">PREDICTION_PROBABILITY()</code>, then compares predicted demand
          against available capacity to identify access risk - manufactured parts where production-signal-driven demand will exceed capacity.
          The <code className="text-xs tone-plum">manufacturing_demand_forecasts</code> table stores daily OML predictions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DEMAND_SURGE_MODEL" color="purple" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="purple" />
        <FeatureBadge label="manufacturing_demand_forecasts table" color="violet" />
        <FeatureBadge label="capacity × plant capacity centers" color="cyan" />
        <FeatureBadge label="Margin at Risk" color="red" />
        <FeatureBadge label="Days of Capacity" color="green" />
      </div>
      <SqlBlock code={`-- OML Capacity Intelligence (actual query)
SELECT p.product_name, fc.center_name,
  i.quantity_on_hand, i.reorder_point,
  df.predicted_unit_demand,
  df.production_signal_factor AS production_signal_factor,

  -- Real-time OML scoring
  PREDICTION(DEMAND_SURGE_MODEL USING
    p.category, p.unit_price,
    eng.production_signal_count, eng.avg_sentiment, ...
  ) AS oml_surge_prediction,

  ROUND(PREDICTION_PROBABILITY(
    DEMAND_SURGE_MODEL, 'SURGE' USING ...
  ) * 100, 1) AS oml_surge_probability,

  -- Plant capacity risk metrics
  CASE WHEN qty = 0 THEN 'NO_CAPACITY'
       WHEN qty < reorder * 0.5 THEN 'CRITICAL'
       WHEN qty < predicted_unit_demand THEN 'AT_RISK'
  END AS capacity_status,

  -- Days of capacity at predicted consumption rate
  ROUND(qty / (predicted_unit_demand / 7), 1)
    AS days_of_capacity,

  -- Margin at risk from capacity shortage
  (predicted_unit_demand - qty) * unit_price
    AS margin_at_risk

FROM inventory i
JOIN manufacturing_demand_forecasts df ON ...
  AND df.forecast_date = TRUNC(SYSDATE)
ORDER BY oml_surge_probability DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Capacity Intelligence Pipeline</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="PREDICTION_PROBABILITY('SURGE') per manufactured part" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ scores stored in</div>
        <DiagramBox label="manufacturing_demand_forecasts (daily OML predictions)" sub="predicted_unit_demand · production signal factor · confidence band" color="#A36472" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="capacity × plant capacity centers" sub="quantity_on_hand · reorder_point · plants" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ COMPARE</div>
        <DiagramBox label="Plant Capacity Risk: capacity_status + days_of_capacity + margin_at_risk" sub="NO_CAPACITY · CRITICAL · AT_RISK · ADEQUATE" color="#C74634" />
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

  const products   = demandData?.products  || [];
  const customers  = segData?.customers    || [];
  const segSummary = segData?.segmentSummary || [];
  const churnDist  = segData?.churnDistribution || [];
  const historical = forecastData?.historical || [];
  const forecast   = forecastData?.forecast   || [];
  const model      = forecastData?.model;
  const modelsActive = Number(summary?.MODELS_ACTIVE ?? summary?.models_active ?? 0);
  const topSurgeProbabilityProducts = useMemo(() => {
    const bestByProduct = new Map();
    for (const alert of invData?.alerts || []) {
      const probability = Number(alert.OML_SURGE_PROBABILITY);
      if (!Number.isFinite(probability)) continue;
      const productKey = alert.PRODUCT_ID ?? alert.PRODUCT_NAME;
      const current = bestByProduct.get(productKey);
      if (!current || probability > Number(current.OML_SURGE_PROBABILITY)) {
        bestByProduct.set(productKey, alert);
      }
    }
    return [...bestByProduct.values()]
      .sort((left, right) => Number(right.OML_SURGE_PROBABILITY) - Number(left.OML_SURGE_PROBABILITY))
      .slice(0, 8);
  }, [invData?.alerts]);

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
    ...forecast.map((r) => {
      const forecastValue = r.PREDICTED_REVENUE ?? r.TREND_LINE;
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

  const filteredCustomers = selectedSegment
    ? customers.filter(c => c.SEGMENT === selectedSegment)
    : customers;

  return (
    <div className="space-y-6 fade-in">

      {/* ── Header ──────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-view" className="oml-header-glyph tone-plum" /> Oracle Machine Learning for Demand and Capacity
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Predict where the AX-400 recovery plan is most exposed with DBMS_DATA_MINING trained models - <span className="tone-plum">
            Random Forest · K-Means · GLM Regression · PREDICTION() · CLUSTER_ID() · Oracle AI Database 26ai
          </span>
        </p>
      </div>

      <SceneStoryPanel scene="oml" />

      {/* ── Oracle Panel - switches content based on active tab ── */}
      <RegisterOraclePanel title="OML Demand and Capacity Analytics">
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
          label="Manufactured Parts with Demand Surge"
          value={summaryLoading ? '…' : formatNumber(summary?.PRODUCTS_WITH_SURGE || summary?.products_with_surge || 0)}
          sub="Random Forest PREDICTION()"
          color="#AA643B"
          badge="RF"
        />
        <StatCard
          iconClass="oj-fwk-icon-users"
          label="Customers / OEMs Segmented"
          value={summaryLoading ? '…' : formatNumber(summary?.TOTAL_CUSTOMERS || summary?.total_customers || 0)}
          sub="K-Means CLUSTER_ID() + RFM"
          color="#C74634"
          badge="KM"
        />
        <StatCard
          iconClass="oj-fwk-icon-view"
          label="Order Value Model R2"
          value={summaryLoading ? '…' : (summary?.REVENUE_R2 || summary?.revenue_r2
            ? `${((summary?.REVENUE_R2 || summary?.revenue_r2) * 100).toFixed(1)}%`
            : '-')}
          sub="GLM + REGR_R2 - 30-day fit"
          color="#4C825C"
          badge="GLM"
        />
        <StatCard
          iconClass="oj-fwk-icon-grid"
          label="Active In-DB ML Models"
          value={summaryLoading ? '…' : modelsActive}
          sub={modelsActive > 0 ? 'Demand · RFM · Forecast · K-Means' : 'Oracle SQL scoring fallback active'}
          color="#4F7D7B"
          badge={modelsActive > 0 ? 'In-DB' : 'SQL'}
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
          Tab 1 - Production Demand Predictions
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
                Production Demand Predictions
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Manufactured parts scored by DEMAND_SURGE_MODEL - Oracle DBMS_DATA_MINING Random Forest (50 trees)
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
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring via PREDICTION(DEMAND_SURGE_MODEL)…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No manufactured parts with sufficient production-signal activity in this window.</p>
          ) : (
            <div className="space-y-4">
              <DefinitionRow items={DEMAND_METRIC_DEFINITIONS} />
              {/* Bar chart - predicted demand */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Top 10 - Predicted Work Orders (7-day horizon)
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#697778' }} />
                    <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 10, fill: '#697778' }} width={170}
                      tickFormatter={v => v?.length > 24 ? v.slice(0, 24) + '...' : v} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                      formatter={(v, n) => [formatNumber(v), n === 'PREDICTED_UNIT_DEMAND' ? 'Predicted Work Orders' : n]}
                    />
                    <Bar dataKey="PREDICTED_UNIT_DEMAND" radius={[0, 4, 4, 0]}>
                      {products.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                      <th className="text-left py-2 px-2">Manufactured Part</th>
                      <th className="text-right py-2 px-2">Urgency</th>
                      <th className="text-right py-2 px-2">Uplift</th>
                      <th className="text-right py-2 px-2">Predicted (7d)</th>
                      <th className="text-right py-2 px-2">Order Value Opp.</th>
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
                          <strong>{p.AVERAGE_URGENCY_SCORE} / 100</strong>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="tone-pine font-semibold">
                            +{p.UPLIFT_PCT}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatNumber(p.PREDICTED_UNIT_DEMAND)} units</td>
                        <td className="py-2 px-2 text-right tone-sienna font-semibold">{formatCurrency(p.REVENUE_OPPORTUNITY)}</td>
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

          {/* Model explanation */}
          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
            <span><strong>Scoring:</strong> PREDICTION() / PREDICTION_PROBABILITY()</span>
            <span><strong>Features:</strong> 12 - category, value, production signal count, sentiment, acknowledgements, propagations, observations, average urgency, escalating signals, elevated signals, requested units, work-order value</span>
            <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - trained model persists in database</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 2 - Customer and Account Segmentation
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
                Customer / OEM Segmentation
              </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters) via DBMS_DATA_MINING +{' '}
              <code className="tone-plum">NTILE(4)</code> RFM labeling - CLUSTER_ID() scoring
            </p>
          </div>

          {segLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring customer accounts via CLUSTER_ID(CUSTOMER_SEGMENT_MODEL)...</p>
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
                      formatter={(v, n, p) => [`${v} customer accounts`, p.payload.segment]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {segSummary.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`oml-segment-legend-button ${selectedSegment === s.segment ? 'is-selected' : ''}`}
                      style={{ '--segment-color': SEGMENT_COLORS[s.segment] || CHART_COLORS[i % CHART_COLORS.length] }}
                      aria-pressed={selectedSegment === s.segment}
                      onClick={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
                    >
                      <span className="oml-segment-legend-button__swatch" aria-hidden="true" />
                      <span>{s.segment}</span>
                      <strong>({s.count})</strong>
                    </button>
                  ))}
                </div>
              </div>

              {/* Repeat order risk bar + segment table */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Repeat Order Risk Distribution</p>
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
                        formatter={v => [`${v} customer accounts`, 'Count']}
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
                          <span>{s.count} customer accounts</span>
                          <span className="tone-sienna">{formatCurrency(s.total_revenue)}</span>
                          <span className="tone-plum">RFM {s.avg_rfm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer and account table - filtered by selected segment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    {selectedSegment ? `${selectedSegment} customer accounts` : 'Top customer accounts by RFM score'}
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
                  {filteredCustomers.slice(0, 40).map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded px-2 py-1.5 text-[10px] hover:surface-bark-soft transition-colors">
                      <div>
                        <span className="font-medium">{c.FULL_NAME}</span>
                        <span className="text-[var(--color-text-dim)] ml-1">{c.CITY}, {c.STATE}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: SEGMENT_COLORS[c.SEGMENT] || '#697778' }}
                          className="text-[9px] font-semibold">{c.SEGMENT}</span>
                        <span className="tone-sienna">{formatCurrency(c.TOTAL_SPENT)}</span>
                        <span className={`text-[9px] ${c.CHURN_RISK === 'High' ? 'tone-red' : c.CHURN_RISK === 'Medium' ? 'tone-sienna' : 'tone-pine'}`}>
                          {c.CHURN_RISK}
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
            <span><strong>Segments:</strong> Champion · Loyal · New · At Risk · Lost · Big Spender · Promising · Potential</span>
            <span><strong>Engine:</strong> Oracle AI Database 26ai - no sklearn, no Python, no external cluster</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 3 - Order Value Forecast
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
                Order Value Forecast - Oracle Linear Regression
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
                ariaLabel="Order value forecast horizon"
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
                    { label: 'Mean Daily Order Value', value: formatCurrency(model.mean_daily_revenue), color: '#C74634' },
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
                    strokeWidth={2} dot={false} name="Actual Order Value" connectNulls={false} />
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
                Manufactured Parts clustered by semantic similarity using <code className="tone-teal">VECTOR_DISTANCE(COSINE)</code> on
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
                  { label: 'Manufactured Parts Clustered', value: clusterData.total_products, color: '#C74634' },
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
                        width: `${Math.max((cl.size / clusterData.total_products) * 100, 3)}%`,
                        background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                      }}
                    >
                      {cl.size}
                      <div className="absolute -top-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Cluster {cl.cluster_id}: {cl.size} manufactured parts · {cl.top_category}
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
                              {cl.size} manufactured parts · Avg similarity: <span className="font-mono" style={{ color }}>{(cl.avg_similarity * 100).toFixed(1)}%</span>
                              {' · '}Centroid: <span className="text-[var(--color-text)]">{cl.centroid_product}</span>
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
                      {/* Manufactured Parts grid */}
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
                                {p.brand_name} · {p.category} · {formatCurrency(p.unit_price)}
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
                            +{cl.products.length - 12} more manufactured parts
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
                <span><strong>K:</strong> {clusterData.k} clusters · {clusterData.total_products} manufactured parts</span>
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
                Capacity Intelligence
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                DEMAND_SURGE_MODEL predictions × live capacity - identifies plant capacity risk from production-signal-driven demand surges
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
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring capacity via PREDICTION(DEMAND_SURGE_MODEL)…</p>
          ) : !invData?.alerts?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No capacity intelligence data available.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: '#C7463411', border: '1px solid #C7463433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Critical / Out of Stock</p>
                  <p className="text-xl font-bold text-[#C74634]">{invData.summary.critical_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#437C9411', border: '1px solid #437C9433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">At Risk (demand {'>'} capacity)</p>
                  <p className="text-xl font-bold text-[#437C94]">{invData.summary.at_risk_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#AA643B11', border: '1px solid #AA643B33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">OML Surge Predicted</p>
                  <p className="text-xl font-bold text-[#AA643B]">{invData.summary.surge_products}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#79608711', border: '1px solid #79608733' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Margin at Risk</p>
                  <p className="text-lg font-bold text-[#796087]">{formatCurrency(invData.summary.total_revenue_at_risk)}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#4C825C11', border: '1px solid #4C825C33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Total Monitored</p>
                  <p className="text-xl font-bold text-[#4C825C]">{invData.summary.total_alerts}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Stock status distribution */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                    Stock Status Distribution
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
                        formatter={(v, n, p) => [`${v} items`, p.payload.status.replace('_', ' ')]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {invData.statusDistribution.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: `${STOCK_COLORS[d.status] || '#7A736E'}22`, color: STOCK_COLORS[d.status] || '#7A736E' }}>
                        {d.status.replace('_', ' ')} ({d.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center summary */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Alerts by Fulfillment Center
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
                <div data-testid="oml-capacity-surge-chart">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Highest Surge Probability
                  </p>
                  {Number(invData.summary.surge_products || 0) === 0 && topSurgeProbabilityProducts.length > 0 ? (
                    <p className="text-[10px] text-[var(--color-text-dim)] mb-2">
                      Current winning class is STABLE; bars rank Oracle's probability for the SURGE class.
                    </p>
                  ) : null}
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={topSurgeProbabilityProducts}
                      layout="vertical" margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#697778' }} domain={[0, 100]} />
                      <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 8, fill: '#697778' }} width={90}
                        tickFormatter={v => v?.length > 12 ? v.slice(0, 12) + '…' : v} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v}%`, 'Surge Probability']}
                      />
                      <Bar dataKey="OML_SURGE_PROBABILITY" radius={[0, 4, 4, 0]}>
                        {topSurgeProbabilityProducts.map((_, i) => (
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
                        <th className="text-left py-2 px-2">Manufactured Part</th>
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-right py-2 px-2">On Hand</th>
                        <th className="text-right py-2 px-2">Predicted</th>
                        <th className="text-right py-2 px-2">Surge %</th>
                        <th className="text-center py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Days Supply</th>
                        <th className="text-right py-2 px-2">Order Value at Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invData.alerts.slice(0, 30).map((a, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-medium truncate max-w-[120px]">{a.PRODUCT_NAME}</div>
                            <div className="text-[9px] text-[var(--color-text-dim)]">{a.CATEGORY} · {a.BRAND_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-[10px]">
                            <div className="truncate max-w-[100px]">{a.CENTER_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">{a.QUANTITY_ON_HAND}</td>
                          <td className="py-2 px-2 text-right font-mono tone-sienna">{a.PREDICTED_UNIT_DEMAND}</td>
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
                                background: `${STOCK_COLORS[a.STOCK_STATUS] || '#7A736E'}22`,
                                color: STOCK_COLORS[a.STOCK_STATUS] || '#7A736E'
                              }}>
                              {a.STOCK_STATUS?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono" style={{
                            color: a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 3 ? '#C74634' :
                                   a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 7 ? '#AA643B' : '#4C825C'
                          }}>
                            {a.DAYS_OF_SUPPLY != null ? `${a.DAYS_OF_SUPPLY}d` : '-'}
                          </td>
                          <td className="py-2 px-2 text-right tone-red">
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
                <span><strong>Scoring:</strong> PREDICTION_PROBABILITY() × capacity levels</span>
                <span><strong>Data:</strong> manufacturing_demand_forecasts (daily OML predictions) × capacity × plant capacity centers</span>
                <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - production-signal demand surge to plant capacity risk assessment</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
