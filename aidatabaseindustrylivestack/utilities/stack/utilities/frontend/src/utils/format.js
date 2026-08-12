export function formatNumber(n) {
  if (n == null) return '-';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function formatCurrency(n) {
  if (n == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(d) {
  if (!d) return '';
  const seconds = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function getMomentumColor(flag) {
  switch (flag) {
    case 'mega_viral': return '#C74634';
    case 'viral': return '#AA643B';
    case 'rising': return '#AA643B';
    default: return '#7A736E';
  }
}

const PLATFORM_DISPLAY_LABELS = {
  instagram: 'Reliability Signal',
  tiktok: 'Compliance Signal',
  twitter: 'Field Access Bulletin',
  youtube: 'Regulatory Notice',
  threads: 'Capacity Alert',
  'reliability signal': 'Reliability Signal',
  'production signal': 'Production Signal',
  'supply quality notice': 'Supply Quality Notice',
  'compliance signal': 'Compliance Signal',
  'field access bulletin': 'Field Access Bulletin',
  'regulatory notice': 'Regulatory Notice',
  'capacity alert': 'Capacity Alert',
  'hse and emissions notice': 'HSE and Emissions Notice',
};

export function getPlatformDisplayName(platform) {
  const raw = String(platform || '').trim();
  if (!raw) return '';
  return PLATFORM_DISPLAY_LABELS[raw.toLowerCase()] || raw.replace(/_/g, ' ');
}

export function getPlatformColor(platform) {
  switch (getPlatformDisplayName(platform)) {
    case 'Reliability Signal': return '#437C94';
    case 'Production Signal': return '#4C825C';
    case 'Supply Quality Notice': return '#A36472';
    case 'Compliance Signal': return '#4F7D7B';
    case 'Field Access Bulletin': return '#437C94';
    case 'Regulatory Notice': return '#C74634';
    case 'Capacity Alert': return '#796087';
    case 'HSE and Emissions Notice': return '#AA643B';
    default: return '#6F757E';
  }
}

export function getPlatformClassName(platform) {
  const slug = getPlatformDisplayName(platform)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `platform-badge platform-${slug}` : 'platform-badge';
}

const SIGNAL_SOURCE_DISPLAY_NAMES = {
  compliance_market: 'Regulatory Compliance Feed',
  fieldaccessops_brief: 'Field Access Operations Bulletin',
  restorationworkflow_monitor: 'Restoration Workflow Monitor',
  midwest_node: 'Midwest Asset Capacity Node',
};

const SOURCE_TOKEN_LABELS = {
  aircargo: 'Air Cargo',
  reading: 'Meter Reading',
  gridlogics: 'Gridlogics',
  customerops: 'Customer Operations',
  fieldlogistics: 'Field Operations',
  derintegration: 'DER Integration',
  gridservices: 'Grid Services Partner',
  fieldaccess: 'Field Access',
  fieldaccessops: 'Field Access Operations',
  compliance: 'Compliance',
  reliabilitypartner: 'Reliability Partner',
  diagnostic: 'Meter Telemetry',
  emaupdates: 'Public Utility Commission Updates',
  fda: 'Regulatory Commission',
  fdawatch: 'Regulatory Commission Watch',
  freight: 'Field Operations',
  reliability: 'Reliability',
  reliabilitydesk: 'Reliability Desk',
  import: 'Import Review',
  lab: 'Meter Shop',
  labdesk: 'Meter Shop Desk',
  market: 'Feed',
  mhra: 'Regulatory',
  midwest: 'Midwest Grid',
  northeast: 'Northeast Grid',
  pacific: 'Pacific Grid',
  customerprograms: 'Customer Programs',
  port: 'Logistics',
  portsupply: 'Logistics Supply',
  restorationworkflow: 'Restoration Workflow',
  restorationdesk: 'Restoration Workflow Desk',
  pv: 'Safety Event Review',
  pvwatch: 'Safety Event Watch',
  quality: 'Quality',
  recall: 'Recall',
  regulatory: 'Regulatory',
  release: 'Release',
  route: 'Service Route',
  safety: 'Safety',
  site: 'Service Point',
  stability: 'Stability',
  switchgear: 'Switchgear Integrity',
  southwest: 'Southwest Grid',
  pilot: 'Pilot Supply',
  demand_response: 'Demand Response',
  demand_response_watch: 'Demand Response Watch',
};

const SOURCE_SUFFIX_LABELS = {
  alerts: 'Alert Feed',
  audit: 'Audit Feed',
  brief: 'Bulletin',
  bulletin: 'Bulletin',
  bulletins: 'Bulletin',
  channel: 'Channel',
  compliance: 'Compliance Feed',
  controlroom: 'Control Room',
  coordinator: 'Coordinator',
  desk: 'Desk',
  feed: 'Feed',
  flow: 'Flow Monitor',
  forecast: 'Forecast Feed',
  hub: 'Hub',
  index: 'Index',
  intel: 'Intelligence Feed',
  lab: 'Meter Shop Feed',
  ledger: 'Ledger',
  map: 'Map',
  market: 'Feed',
  matrix: 'Matrix',
  monitor: 'Monitor',
  network: 'Network',
  node: 'Node',
  notice: 'Notice',
  observer: 'Observer',
  office: 'Office',
  ops: 'Operations Feed',
  planner: 'Planner',
  pulse: 'Pulse',
  queue: 'Queue',
  release: 'Release Desk',
  report: 'Report',
  review: 'Review Feed',
  risk: 'Risk Feed',
  routing: 'Routing Desk',
  safety: 'Safety Feed',
  screen: 'Screening Feed',
  signal: 'Signal Feed',
  source: 'Source Feed',
  status: 'Status Feed',
  tracker: 'Tracker',
  updates: 'Updates',
  watch: 'Watch',
  watchlist: 'Watchlist',
  weekly: 'Weekly Feed',
  wire: 'Bulletin',
};

function normalizeSourceKey(value) {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/\d+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCaseSourceToken(token) {
  const lower = String(token || '').toLowerCase();
  if (!lower) return '';
  return SOURCE_TOKEN_LABELS[lower] || SOURCE_SUFFIX_LABELS[lower] || lower.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getSignalSourceDisplayName(handle, displayName) {
  const key = normalizeSourceKey(handle || displayName);
  if (!key) return '';
  if (SIGNAL_SOURCE_DISPLAY_NAMES[key]) return SIGNAL_SOURCE_DISPLAY_NAMES[key];

  const parts = key.split('_').filter(Boolean);
  const suffix = parts.length > 1 ? parts[parts.length - 1] : '';
  const baseParts = suffix && SOURCE_SUFFIX_LABELS[suffix] ? parts.slice(0, -1) : parts;
  const base = baseParts.map(titleCaseSourceToken).filter(Boolean).join(' ').trim();
  const suffixLabel = SOURCE_SUFFIX_LABELS[suffix] || '';
  const candidate = [base, suffixLabel].filter(Boolean).join(' ').trim();

  return candidate || String(displayName || handle || '').replace(/^@/, '').replace(/_/g, ' ');
}
