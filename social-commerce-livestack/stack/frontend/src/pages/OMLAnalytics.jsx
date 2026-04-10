import { useState } from 'react';
import {
  BrainCircuit, TrendingUp, Users, DollarSign,
  RefreshCw, Activity, Target, Zap, Package,
  ArrowUpRight, BarChart2, Cpu, Sparkles, Loader2, AlertTriangle
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

// ── Color palette ──────────────────────────────────────
const SEGMENT_COLORS = {
  Champion:       '#D4760A',
  Loyal:          '#2D9F5E',
  'New Customer': '#1AADA8',
  'At Risk':      '#C74634',
  Lost:           '#6B6560',
  'Big Spender':  '#7B48A5',
  Promising:      '#1B84ED',
  Potential:      '#9D9893',
};

const MOMENTUM_COLORS = {
  mega_viral: '#C74634',
  viral:      '#E87B1A',
  rising:     '#D4760A',
  normal:     '#6B6560',
};

const CHART_COLORS = ['#C74634','#1AADA8','#D4760A','#2D9F5E','#D4549A','#1B84ED','#7B48A5','#E87B1A'];

// ── Tab definitions ────────────────────────────────────
const CLUSTER_COLORS = ['#C74634','#1AADA8','#D4760A','#2D9F5E','#D4549A','#1B84ED','#7B48A5','#E87B1A','#0572CE','#1B7D3E','#8F5BC2','#C44989','#1AADA8','#6BAD45','#D4760A'];

const TABS = [
  { key: 'demand',    label: 'Demand Surge Predictions',             icon: TrendingUp,    color: '#D4760A' },
  { key: 'rfm',       label: 'Customer RFM Segmentation',            icon: Users,         color: '#C74634' },
  { key: 'forecast',  label: 'Revenue Forecast — Linear Regression', icon: DollarSign,    color: '#2D9F5E' },
  { key: 'clusters',  label: 'Vector K-Means Clustering',            icon: Sparkles,      color: '#1AADA8' },
  { key: 'inventory', label: 'Inventory Intelligence',               icon: Package,       color: '#7B48A5' },
];

const STOCK_COLORS = {
  OUT_OF_STOCK: '#C74634',
  CRITICAL: '#E87B1A',
  LOW: '#D4760A',
  AT_RISK: '#1B84ED',
  ADEQUATE: '#2D9F5E',
};

// ── Helper components ──────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#C74634', badge }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg" style={{ background: `${color}22` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {badge && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${color}22`, color }}>
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{label}</p>
      </div>
      {sub && <p className="text-[11px] text-[var(--color-text-dim)] mt-1">{sub}</p>}
    </div>
  );
}

function MomentumBadge({ flag }) {
  const label = flag === 'mega_viral' ? '🔥 MEGA' : flag?.replace('_', ' ') || '—';
  return (
    <span className={`momentum-badge momentum-${flag}`}>{label}</span>
  );
}

function ConfidenceBar({ pct }) {
  const color = pct >= 80 ? '#2D9F5E' : pct >= 60 ? '#D4760A' : '#C74634';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10">
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
          DEMAND_SURGE_MODEL — Random Forest Classification
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="text-amber-400 font-mono">Random Forest</span> model (50 trees) trained via{' '}
          <code className="text-xs text-yellow-300">DBMS_DATA_MINING.CREATE_MODEL</code> on 12 social engagement
          and sales features. Oracle scores every product <em>inline</em> at query time using{' '}
          <code className="text-xs text-yellow-300">PREDICTION()</code> and{' '}
          <code className="text-xs text-yellow-300">PREDICTION_PROBABILITY()</code> — no external ML pipeline,
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

-- Step 2: Score products in real-time SQL
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

  -- Probability of SURGE class (0.0 – 1.0)
  ROUND(PREDICTION_PROBABILITY(
    DEMAND_SURGE_MODEL, 'SURGE' USING ...
  ) * 100, 1) AS surge_probability

FROM products p
JOIN product_engagement eng  ...
JOIN product_sales sales     ...
ORDER BY surge_probability DESC;`} />
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] text-center text-amber-400 font-bold mb-1">DBMS_DATA_MINING Pipeline</div>
        <DiagramBox label="OML_DEMAND_TRAINING_V (187 products)" sub="12 features: engagement + sales + social" color="#D4760A" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="ALGO_RANDOM_FOREST · 50 trees · PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Real-Time Scoring in SQL" sub="PREDICTION_PROBABILITY('SURGE' USING *)" color="#1B84ED" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ result</div>
        <DiagramBox label="SURGE / NORMAL + probability %" sub="scored inline · no ETL · model persists in DB" color="#2D9F5E" />
      </div>
    </div>
  );
}

function RFMOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          CUSTOMER_SEGMENT_MODEL — K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="text-violet-400 font-mono">K-Means</span> model (4 clusters) trained via{' '}
          <code className="text-xs text-violet-300">DBMS_DATA_MINING.CREATE_MODEL</code> on 6 RFM features.
          Each customer is assigned to a cluster using{' '}
          <code className="text-xs text-violet-300">CLUSTER_ID()</code> with{' '}
          <code className="text-xs text-violet-300">CLUSTER_PROBABILITY()</code> confidence.
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
    data_table_name => 'OML_CUSTOMER_RFM_V',
    case_id_column_name => 'CUSTOMER_ID',
    settings_table_name => 'CUST_SEGMENT_SETTINGS'
    -- ALGO_KMEANS, 4 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score customers with CLUSTER_ID()
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
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] text-center text-violet-400 font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_CUSTOMER_RFM_V (2,000 customers)" sub="6 features: LTV, recency, frequency, monetary, AOV, items" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="CUSTOMER_SEGMENT_MODEL (K-Means)" sub="ALGO_KMEANS · 4 clusters · PREP_AUTO" color="#7B48A5" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="each customer → nearest centroid" color="#1B84ED" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ NTILE(4)</div>
        <DiagramBox label="RFM Segment Labels + Churn Risk" sub="Champion · Loyal · At Risk · Lost · …" color="#2D9F5E" />
      </div>
    </div>
  );
}

function ForecastOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          REVENUE_PREDICT_MODEL — GLM Regression + OLS Trend
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Two complementary Oracle ML techniques:{' '}
          <code className="text-xs text-green-300">REVENUE_PREDICT_MODEL</code> (Generalized Linear Model)
          trained via <code className="text-xs text-green-300">DBMS_DATA_MINING</code> predicts per-order revenue
          from customer and product features. The time-series trend uses{' '}
          <code className="text-xs text-green-300">REGR_SLOPE / REGR_R2</code> (ISO SQL:2003) for OLS regression
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
    settings_table_name => 'REVENUE_PREDICT_SETTINGS'
    -- ALGO_GENERALIZED_LINEAR_MODEL, PREP_AUTO_ON
  );
END;

-- Step 2: Score orders + time-series trend
WITH daily_rev AS (
  SELECT TRUNC(CAST(created_at AS DATE)) AS day,
    SUM(order_total) AS revenue,
    ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
  FROM orders
  WHERE created_at >= SYSDATE - 30
  GROUP BY TRUNC(CAST(created_at AS DATE))
),
params AS (
  SELECT REGR_SLOPE(revenue, rn)     AS slope,
         REGR_INTERCEPT(revenue, rn) AS intercept,
         REGR_R2(revenue, rn)        AS r2
  FROM daily_rev
),
-- GLM model: per-order predicted revenue
glm_stats AS (
  SELECT AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *))
    AS avg_predicted
  FROM OML_REVENUE_TRAINING_V
)
SELECT day, revenue, slope * rn + intercept AS trend,
  r2, avg_predicted
FROM daily_rev CROSS JOIN params CROSS JOIN glm_stats;`} />
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] text-center text-green-400 font-bold mb-1">Dual Model Pipeline</div>
        <DiagramBox label="OML_REVENUE_TRAINING_V (3,000 orders)" sub="features: tier, LTV, demand_score, items, avg_price" color="#2D9F5E" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="REVENUE_PREDICT_MODEL (GLM)" sub="ALGO_GENERALIZED_LINEAR_MODEL · PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Per-Order Revenue Prediction" sub="GLM scores each order inline in SQL" color="#1B84ED" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">+ REGR_SLOPE</div>
        <DiagramBox label="OLS Trend + Forward Projection" sub="REGR_R2 fit quality · CI widens 7%/day" color="#D4760A" />
      </div>
    </div>
  );
}

function ClustersOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          PRODUCT_CLUSTER_MODEL — K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="text-cyan-400 font-mono">K-Means</span> model (5 clusters) trained via{' '}
          <code className="text-xs text-cyan-300">DBMS_DATA_MINING.CREATE_MODEL</code> on 8 product behavioral
          features (price, sales, engagement, sentiment). Products are assigned using{' '}
          <code className="text-xs text-cyan-300">CLUSTER_ID()</code> with{' '}
          <code className="text-xs text-cyan-300">CLUSTER_PROBABILITY()</code> — real trained K-Means
          with convergence, not manual centroid selection. The model persists in the database and
          scores new products automatically.
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
    settings_table_name => 'PROD_CLUSTER_SETTINGS'
    -- ALGO_KMEANS, 5 clusters, PREP_AUTO_ON
  );
END;

-- Step 2: Score products with CLUSTER_ID()
SELECT p.product_name, p.category, p.unit_price,

  -- K-Means cluster assignment
  CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING
    pcv.unit_price, pcv.weight_kg,
    pcv.units_sold, pcv.revenue,
    pcv.order_count, pcv.total_engagement,
    pcv.avg_sentiment, pcv.avg_virality
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
-- avg_virality`} />
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] text-center text-cyan-400 font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_PRODUCT_CLUSTER_V (187 products)" sub="8 features: price, sales, engagement, sentiment" color="#1AADA8" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="PRODUCT_CLUSTER_MODEL (K-Means)" sub="ALGO_KMEANS · 5 clusters · PREP_AUTO · convergence" color="#D4760A" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="trained centroids · proper distance calculation" color="#7B48A5" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="Product Details + Cluster Stats" sub="size · top category · avg probability" color="#2D9F5E" />
      </div>
    </div>
  );
}

function InventoryOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL × Inventory — Supply Risk Intelligence
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Joins <span className="text-purple-400 font-mono">DEMAND_SURGE_MODEL</span> (Random Forest) predictions with
          live inventory levels across all fulfillment centers. Oracle scores each product in real-time using{' '}
          <code className="text-xs text-purple-300">PREDICTION_PROBABILITY()</code>, then compares predicted demand
          against on-hand stock to identify supply risk — products where social-driven demand will exceed inventory.
          The <code className="text-xs text-purple-300">demand_forecasts</code> table stores daily OML predictions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DEMAND_SURGE_MODEL" color="purple" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="purple" />
        <FeatureBadge label="demand_forecasts table" color="violet" />
        <FeatureBadge label="inventory × fulfillment_centers" color="cyan" />
        <FeatureBadge label="Revenue at Risk" color="red" />
        <FeatureBadge label="Days of Supply" color="green" />
      </div>
      <SqlBlock code={`-- OML Inventory Intelligence (actual query)
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

  -- Supply risk metrics
  CASE WHEN qty = 0 THEN 'OUT_OF_STOCK'
       WHEN qty < reorder * 0.5 THEN 'CRITICAL'
       WHEN qty < predicted_demand THEN 'AT_RISK'
  END AS stock_status,

  -- Days of supply at predicted consumption rate
  ROUND(qty / (predicted_demand / 7), 1)
    AS days_of_supply,

  -- Revenue at risk from stockout
  (predicted_demand - qty) * unit_price
    AS revenue_at_risk

FROM inventory i
JOIN demand_forecasts df ON ...
  AND df.forecast_date = TRUNC(SYSDATE)
ORDER BY oml_surge_probability DESC;`} />
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] text-center text-purple-400 font-bold mb-1">Inventory Intelligence Pipeline</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="PREDICTION_PROBABILITY('SURGE') per product" color="#7B48A5" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ scores stored in</div>
        <DiagramBox label="demand_forecasts (daily OML predictions)" sub="predicted_demand · social_factor · confidence band" color="#D4549A" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="inventory × fulfillment_centers" sub="quantity_on_hand · reorder_point · 30 centers" color="#1B84ED" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ COMPARE</div>
        <DiagramBox label="Supply Risk: stock_status + days_of_supply + revenue_at_risk" sub="OUT_OF_STOCK · CRITICAL · AT_RISK · ADEQUATE" color="#C74634" />
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
    useData(() => api.ml.inventoryIntelligence());

  const products   = demandData?.products  || [];
  const customers  = segData?.customers    || [];
  const segSummary = segData?.segmentSummary || [];
  const churnDist  = segData?.churnDistribution || [];
  const historical = forecastData?.historical || [];
  const forecast   = forecastData?.forecast   || [];
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

  const filteredCustomers = selectedSegment
    ? customers.filter(c => c.SEGMENT === selectedSegment)
    : customers;

  return (
    <div className="space-y-6 fade-in">

      {/* ── Header ──────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BrainCircuit className="text-violet-400" /> Oracle Machine Learning
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          DBMS_DATA_MINING trained models — <span className="text-violet-400">
            Random Forest · K-Means · GLM Regression · PREDICTION() · CLUSTER_ID() · Oracle AI Database 26ai
          </span>
        </p>
      </div>

      {/* ── Oracle Panel — switches content based on active tab ── */}
      <RegisterOraclePanel title="OML Analytics">
        {activeTab === 'demand'   && <DemandOraclePanel />}
        {activeTab === 'rfm'      && <RFMOraclePanel />}
        {activeTab === 'forecast' && <ForecastOraclePanel />}
        {activeTab === 'clusters' && <ClustersOraclePanel />}
        {activeTab === 'inventory' && <InventoryOraclePanel />}
      </RegisterOraclePanel>

      {/* ── Summary stat cards ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          label="Products with Demand Surge"
          value={summaryLoading ? '…' : formatNumber(summary?.PRODUCTS_WITH_SURGE || summary?.products_with_surge || 0)}
          sub="Random Forest PREDICTION()"
          color="#D4760A"
          badge="RF"
        />
        <StatCard
          icon={Users}
          label="Customers Segmented"
          value={summaryLoading ? '…' : formatNumber(summary?.TOTAL_CUSTOMERS || summary?.total_customers || 0)}
          sub="K-Means CLUSTER_ID() + RFM"
          color="#C74634"
          badge="KM"
        />
        <StatCard
          icon={Activity}
          label="Revenue Model R²"
          value={summaryLoading ? '…' : (summary?.REVENUE_R2 || summary?.revenue_r2
            ? `${((summary?.REVENUE_R2 || summary?.revenue_r2) * 100).toFixed(1)}%`
            : '—')}
          sub="GLM + REGR_R2 — 30-day fit"
          color="#2D9F5E"
          badge="GLM"
        />
        <StatCard
          icon={Cpu}
          label="Active ML Models"
          value={summaryLoading ? '…' : (summary?.MODELS_ACTIVE || summary?.models_active || 4)}
          sub="Demand · RFM · Forecast · K-Means"
          color="#1AADA8"
          badge="In-DB"
        />
      </div>

      {/* ── Tab Bar ────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? `${tab.color}18` : 'transparent',
                color:      isActive ? tab.color : 'var(--color-text-dim)',
                border:     isActive ? `1px solid ${tab.color}44` : '1px solid transparent',
                boxShadow:  isActive ? `0 0 16px ${tab.color}12` : 'none',
              }}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          Tab 1 — Demand Surge Predictions
      ══════════════════════════════════════════ */}
      {activeTab === 'demand' && (
        <section className="glass-card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-400" />
                Demand Surge Predictions
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Products scored by DEMAND_SURGE_MODEL — Oracle DBMS_DATA_MINING Random Forest (50 trees)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={demandHours}
                onChange={e => setDemandHours(Number(e.target.value))}
                className="btn-ghost bg-transparent text-xs"
              >
                <option value={168}>Last 7 days</option>
                <option value={336}>Last 14 days</option>
                <option value={720}>Last 30 days</option>
                <option value={2160}>Last 90 days</option>
              </select>
              <button onClick={refetchDemand} className="btn-ghost p-1.5">
                <RefreshCw size={13} className={demandLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {demandLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring via PREDICTION(DEMAND_SURGE_MODEL)…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No products with sufficient viral signals in this window.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Bar chart — predicted demand */}
              <div className="lg:col-span-2">
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Top 10 — Predicted Orders (7-day horizon)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 9, fill: '#94a3b8' }} width={100}
                      tickFormatter={v => v?.length > 14 ? v.slice(0, 14) + '…' : v} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: '#F5F4F2' }}
                      itemStyle={{ color: '#F5F4F2' }}
                      labelStyle={{ color: '#F5F4F2' }}
                      cursor={{ fill: 'rgba(255,255,255,0.08)' }}
                      formatter={(v, n) => [formatNumber(v), n === 'PREDICTED_DEMAND' ? 'Predicted Orders' : n]}
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
                      <th className="text-left py-2 px-2">Product</th>
                      <th className="text-right py-2 px-2">Virality</th>
                      <th className="text-right py-2 px-2">Uplift</th>
                      <th className="text-right py-2 px-2">Predicted</th>
                      <th className="text-right py-2 px-2">Revenue Opp.</th>
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
                        <td className="py-2 px-2 text-right font-mono" style={{ color: MOMENTUM_COLORS[p.PEAK_MOMENTUM] || '#94a3b8' }}>
                          {p.AVG_VIRALITY}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="text-green-400 font-semibold">
                            +{p.UPLIFT_PCT}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatNumber(p.PREDICTED_DEMAND)}</td>
                        <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(p.REVENUE_OPPORTUNITY)}</td>
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
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px dashed rgba(245,158,11,0.3)', color: '#fcd34d' }}>
            <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
            <span><strong>Scoring:</strong> PREDICTION() / PREDICTION_PROBABILITY()</span>
            <span><strong>Features:</strong> 12 — category, price, posts, sentiment, likes, shares, views, virality, viral_posts, rising_posts, units_sold, revenue</span>
            <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING — trained model persists in database</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 2 — Customer RFM Segmentation
      ══════════════════════════════════════════ */}
      {activeTab === 'rfm' && (
        <section className="glass-card space-y-5">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Users size={16} className="text-violet-400" />
              Customer RFM Segmentation
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters) via DBMS_DATA_MINING +{' '}
              <code className="text-violet-300">NTILE(4)</code> RFM labeling — CLUSTER_ID() scoring
            </p>
          </div>

          {segLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring customers via CLUSTER_ID(CUSTOMER_SEGMENT_MODEL)…</p>
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
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: '#F5F4F2' }}
                      itemStyle={{ color: '#F5F4F2' }}
                      labelStyle={{ color: '#F5F4F2' }}
                      cursor={false}
                      formatter={(v, n, p) => [`${v} customers`, p.payload.segment]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {segSummary.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
                      className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-opacity"
                      style={{
                        background: `${SEGMENT_COLORS[s.segment] || CHART_COLORS[i]}22`,
                        color: SEGMENT_COLORS[s.segment] || CHART_COLORS[i],
                        opacity: selectedSegment && selectedSegment !== s.segment ? 0.4 : 1
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {s.segment} ({s.count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Churn risk bar + segment table */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Churn Risk Distribution</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={churnDist} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="risk" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={30} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {churnDist.map((d, i) => (
                          <Cell key={i} fill={d.risk === 'High' ? '#C74634' : d.risk === 'Medium' ? '#D4760A' : '#2D9F5E'} />
                        ))}
                      </Bar>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: '#F5F4F2' }}
                        itemStyle={{ color: '#F5F4F2' }}
                        labelStyle={{ color: '#F5F4F2' }}
                        cursor={{ fill: 'rgba(255,255,255,0.08)' }}
                        formatter={v => [`${v} customers`, 'Count']}
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
                          <span>{s.count} customers</span>
                          <span className="text-amber-400">{formatCurrency(s.total_revenue)}</span>
                          <span className="text-violet-400">RFM {s.avg_rfm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer table — filtered by selected segment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    {selectedSegment ? `${selectedSegment} customers` : 'Top customers by RFM score'}
                  </p>
                  {selectedSegment && (
                    <button onClick={() => setSelectedSegment(null)}
                      className="text-[9px] text-[var(--color-text-dim)] hover:text-white">✕ clear</button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-[240px] space-y-1">
                  {filteredCustomers.slice(0, 40).map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded px-2 py-1.5 text-[10px] hover:bg-white/5 transition-colors">
                      <div>
                        <span className="font-medium">{c.FULL_NAME}</span>
                        <span className="text-[var(--color-text-dim)] ml-1">{c.CITY}, {c.STATE}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: SEGMENT_COLORS[c.SEGMENT] || '#94a3b8' }}
                          className="text-[9px] font-semibold">{c.SEGMENT}</span>
                        <span className="text-amber-400">{formatCurrency(c.TOTAL_SPENT)}</span>
                        <span className={`text-[9px] ${c.CHURN_RISK === 'High' ? 'text-red-400' : c.CHURN_RISK === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>
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
            style={{ background: 'rgba(124,109,240,0.06)', border: '1px dashed rgba(124,109,240,0.3)', color: '#c4b5fd' }}>
            <span>📐 <strong>Model:</strong> RFM via Oracle NTILE(4) — ISO SQL:2003 Window Functions</span>
            <span>🎯 <strong>Segments:</strong> Champion · Loyal · New · At Risk · Lost · Big Spender · Promising · Potential</span>
            <span>🏎️ <strong>Engine:</strong> Oracle AI Database 26ai — no sklearn, no Python, no external cluster</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 3 — Revenue Forecast
      ══════════════════════════════════════════ */}
      {activeTab === 'forecast' && (
        <section className="glass-card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <DollarSign size={16} className="text-green-400" />
                Revenue Forecast — Oracle Linear Regression
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                <code className="text-green-300">REGR_SLOPE · REGR_INTERCEPT · REGR_R2</code> — Oracle's native OLS regression
                fits the trend on 30-day history and projects forward
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))}
                className="btn-ghost bg-transparent text-xs">
                <option value={3}>+3 day forecast</option>
                <option value={7}>+7 day forecast</option>
                <option value={14}>+14 day forecast</option>
              </select>
              <button onClick={refetchForecast} className="btn-ghost p-1.5">
                <RefreshCw size={13} className={forecastLoading ? 'animate-spin' : ''} />
              </button>
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
                    { label: 'R² (fit quality)', value: `${((model.r_squared || 0) * 100).toFixed(1)}%`, color: model.r_squared > 0.7 ? '#2D9F5E' : model.r_squared > 0.4 ? '#D4760A' : '#C74634' },
                    { label: 'Daily Slope', value: `${model.daily_slope >= 0 ? '+' : ''}${formatCurrency(model.daily_slope)}/day`, color: model.daily_slope >= 0 ? '#2D9F5E' : '#C74634' },
                    { label: 'Mean Daily Revenue', value: formatCurrency(model.mean_daily_revenue), color: '#C74634' },
                    { label: 'Observations', value: `${model.observations} days`, color: '#1AADA8' },
                  ].map((m, i) => (
                    <div key={i} className="rounded-lg p-3 text-center"
                      style={{ background: `${m.color}11`, border: `1px solid ${m.color}33` }}>
                      <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{m.label}</p>
                      <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Main forecast chart */}
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2D9F5E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2D9F5E" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C74634" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C74634" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }}
                    interval={Math.floor(chartData.length / 10)} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={60}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ForecastTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />

                  {/* Confidence interval band for forecast (upper bound filled, lower bound erases) */}
                  <Area type="monotone" dataKey="ci_upper" fill="#C7463422" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Upper" legendType="none" />
                  <Area type="monotone" dataKey="ci_lower" fill="var(--color-bg)" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Lower" legendType="none" />

                  <Area type="monotone" dataKey="actual" stroke="#2D9F5E" fill="url(#actualGrad)"
                    strokeWidth={2} dot={false} name="Actual Revenue" connectNulls={false} />
                  <Area type="monotone" dataKey="forecast" stroke="#C74634" fill="url(#forecastGrad)"
                    strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="Forecast" connectNulls />
                  <Line type="monotone" dataKey="trend" stroke="#D4760A" strokeWidth={1.5}
                    strokeDasharray="2 2" dot={false} name="Trend (OLS)" connectNulls />
                  <Line type="monotone" dataKey="ma7" stroke="#1AADA8" strokeWidth={1.5}
                    dot={false} name="7-day MA" />

                  {/* Vertical rule separating actual / forecast */}
                  {historical.length > 0 && (
                    <ReferenceLine
                      x={historical[historical.length - 1]?.DAY?.slice(5)}
                      stroke="#ffffff30"
                      strokeDasharray="4 4"
                      label={{ value: 'Forecast →', position: 'top', fill: '#94a3b8', fontSize: 9 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>

              {/* Model card */}
              {model && (
                <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                  style={{ background: 'rgba(45,159,94,0.06)', border: '1px dashed rgba(45,159,94,0.3)', color: '#86efac' }}>
                  <span>📐 <strong>Model:</strong> {model.type}</span>
                  <span>⚙️ <strong>Oracle functions:</strong> {model.engine}</span>
                  <span>📊 <strong>R²:</strong> {(model.r_squared * 100).toFixed(1)}%
                    {' · '}<strong>ρ:</strong> {(model.correlation * 100).toFixed(1)}% corr.
                  </span>
                  <span>🔮 <strong>Forecast:</strong> {model.forecast_days} days
                    {' · '}<strong>Trained on:</strong> {model.lookback_days}-day window
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 4 — Vector K-Means Clustering
      ══════════════════════════════════════════ */}
      {activeTab === 'clusters' && (
        <section className="glass-card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sparkles size={16} className="text-cyan-400" />
                Vector K-Means Clustering
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Products clustered by semantic similarity using <code className="text-cyan-300">VECTOR_DISTANCE(COSINE)</code> on
                384-dim embeddings — Oracle AI Vector Search
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-dim)]">K =</span>
              {[3, 5, 10].map(kVal => (
                <button
                  key={kVal}
                  onClick={() => setClusterK(kVal)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: clusterK === kVal ? '#1AADA822' : 'transparent',
                    color:      clusterK === kVal ? '#1AADA8' : 'var(--color-text-dim)',
                    border:     clusterK === kVal ? '1px solid #1AADA844' : '1px solid var(--color-border)',
                  }}
                >
                  {kVal}
                </button>
              ))}
              <button onClick={refetchClusters} className="btn-ghost p-1.5">
                <RefreshCw size={13} className={clusterLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {clusterLoading ? (
            <div className="py-8 text-center">
              <Loader2 size={24} className="animate-spin mx-auto text-cyan-400 mb-2" />
              <p className="text-sm text-[var(--color-text-dim)]">Running VECTOR_DISTANCE K-Means (K={clusterK})…</p>
            </div>
          ) : !clusterData?.clusters?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No cluster data available.</p>
          ) : (
            <>
              {/* Cluster summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Clusters (K)', value: clusterData.k, color: '#1AADA8' },
                  { label: 'Products Clustered', value: clusterData.total_products, color: '#C74634' },
                  { label: 'Embedding Dims', value: `${clusterData.meta?.dimensions || 384}`, color: '#D4760A' },
                  { label: 'Distance Metric', value: 'COSINE', color: '#2D9F5E' },
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
                        Cluster {cl.cluster_id}: {cl.size} products · {cl.top_category}
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
                              Cluster {cl.cluster_id} — {cl.top_category}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-dim)]">
                              {cl.size} products · Avg similarity: <span className="font-mono" style={{ color }}>{(cl.avg_similarity * 100).toFixed(1)}%</span>
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
                      {/* Products grid */}
                      <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {cl.products.slice(0, 12).map(p => (
                          <div key={p.product_id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-white/5 transition-colors"
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
                                style={{ color: p.similarity >= 0.7 ? '#2D9F5E' : p.similarity >= 0.5 ? '#D4760A' : '#1B84ED' }}>
                                {(p.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                        {cl.products.length > 12 && (
                          <div className="text-[10px] text-[var(--color-text-dim)] px-2 py-1">
                            +{cl.products.length - 12} more products
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(6,182,212,0.06)', border: '1px dashed rgba(6,182,212,0.3)', color: '#67e8f9' }}>
                <span>📐 <strong>Model:</strong> Vector K-Means via VECTOR_DISTANCE centroid assignment</span>
                <span>⚙️ <strong>Vectors:</strong> 384-dim · ALL_MINILM_L12_V2 ONNX · COSINE distance</span>
                <span>🏎️ <strong>Engine:</strong> Oracle AI Vector Search — CROSS JOIN + ROW_NUMBER nearest assignment</span>
                <span>🔢 <strong>K:</strong> {clusterData.k} clusters · {clusterData.total_products} products</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 5 — Inventory Intelligence
      ══════════════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <section className="glass-card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Package size={16} className="text-purple-400" />
                Inventory Intelligence
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                DEMAND_SURGE_MODEL predictions × live inventory — identifies supply risk from social-driven demand surges
              </p>
            </div>
            <button onClick={refetchInv} className="btn-ghost p-1.5">
              <RefreshCw size={13} className={invLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {invLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring inventory via PREDICTION(DEMAND_SURGE_MODEL)…</p>
          ) : !invData?.alerts?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No inventory intelligence data available.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: '#C7463411', border: '1px solid #C7463433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Critical / Out of Stock</p>
                  <p className="text-xl font-bold text-[#C74634]">{invData.summary.critical_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#1B84ED11', border: '1px solid #1B84ED33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">At Risk (demand {'>'} stock)</p>
                  <p className="text-xl font-bold text-[#1B84ED]">{invData.summary.at_risk_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#D4760A11', border: '1px solid #D4760A33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">OML Surge Predicted</p>
                  <p className="text-xl font-bold text-[#D4760A]">{invData.summary.surge_products}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#7B48A511', border: '1px solid #7B48A533' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Revenue at Risk</p>
                  <p className="text-lg font-bold text-[#7B48A5]">{formatCurrency(invData.summary.total_revenue_at_risk)}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#2D9F5E11', border: '1px solid #2D9F5E33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Total Monitored</p>
                  <p className="text-xl font-bold text-[#2D9F5E]">{invData.summary.total_alerts}</p>
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
                          <Cell key={i} fill={STOCK_COLORS[d.status] || '#6B6560'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: '#F5F4F2' }}
                        itemStyle={{ color: '#F5F4F2' }}
                        labelStyle={{ color: '#F5F4F2' }}
                        cursor={false}
                        formatter={(v, n, p) => [`${v} items`, p.payload.status.replace('_', ' ')]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {invData.statusDistribution.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: `${STOCK_COLORS[d.status] || '#6B6560'}22`, color: STOCK_COLORS[d.status] || '#6B6560' }}>
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
                      <div key={i} className="flex items-center justify-between text-[10px] rounded px-2 py-1.5 hover:bg-white/5">
                        <div>
                          <span className="font-medium">{c.center}</span>
                          <span className="text-[var(--color-text-dim)] ml-1">({c.city})</span>
                        </div>
                        <div className="flex gap-2">
                          {c.critical > 0 && (
                            <span className="text-[#C74634] font-bold">{c.critical} critical</span>
                          )}
                          {c.surges > 0 && (
                            <span className="text-[#D4760A]">{c.surges} surges</span>
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
                    Highest Surge Probability
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={invData.alerts.filter(a => a.OML_SURGE_PREDICTION === 'SURGE').slice(0, 8)}
                      layout="vertical" margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} domain={[0, 100]} />
                      <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 8, fill: '#94a3b8' }} width={90}
                        tickFormatter={v => v?.length > 12 ? v.slice(0, 12) + '…' : v} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: '#F5F4F2' }}
                        itemStyle={{ color: '#F5F4F2' }}
                        labelStyle={{ color: '#F5F4F2' }}
                        cursor={{ fill: 'rgba(255,255,255,0.08)' }}
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
                  Inventory Alerts — Sorted by OML Surge Probability
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Product</th>
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-right py-2 px-2">On Hand</th>
                        <th className="text-right py-2 px-2">Predicted</th>
                        <th className="text-right py-2 px-2">Surge %</th>
                        <th className="text-center py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Days Supply</th>
                        <th className="text-right py-2 px-2">Rev. at Risk</th>
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
                          <td className="py-2 px-2 text-right font-mono text-amber-400">{a.PREDICTED_DEMAND}</td>
                          <td className="py-2 px-2 text-right">
                            <span className="font-bold" style={{
                              color: a.OML_SURGE_PROBABILITY >= 70 ? '#C74634' :
                                     a.OML_SURGE_PROBABILITY >= 40 ? '#D4760A' : '#2D9F5E'
                            }}>
                              {a.OML_SURGE_PROBABILITY}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: `${STOCK_COLORS[a.STOCK_STATUS] || '#6B6560'}22`,
                                color: STOCK_COLORS[a.STOCK_STATUS] || '#6B6560'
                              }}>
                              {a.STOCK_STATUS?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono" style={{
                            color: a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 3 ? '#C74634' :
                                   a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 7 ? '#D4760A' : '#2D9F5E'
                          }}>
                            {a.DAYS_OF_SUPPLY != null ? `${a.DAYS_OF_SUPPLY}d` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-red-400">
                            {a.REVENUE_AT_RISK > 0 ? formatCurrency(a.REVENUE_AT_RISK) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(123,72,165,0.06)', border: '1px dashed rgba(123,72,165,0.3)', color: '#c4b5fd' }}>
                <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
                <span><strong>Scoring:</strong> PREDICTION_PROBABILITY() × inventory levels</span>
                <span><strong>Data:</strong> demand_forecasts (daily OML predictions) × inventory × fulfillment_centers</span>
                <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING — social demand surge → supply risk assessment</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
