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
  instagram: 'Supply Quality Notice',
  tiktok: 'Compliance Signal',
  twitter: 'Cold Chain Bulletin',
  youtube: 'Regulatory Notice',
  threads: 'Capacity Alert',
  'supply quality notice': 'Supply Quality Notice',
  'compliance signal': 'Compliance Signal',
  'cold chain bulletin': 'Cold Chain Bulletin',
  'regulatory notice': 'Regulatory Notice',
  'capacity alert': 'Capacity Alert',
};

export function getPlatformDisplayName(platform) {
  const raw = String(platform || '').trim();
  if (!raw) return '';
  return PLATFORM_DISPLAY_LABELS[raw.toLowerCase()] || raw.replace(/_/g, ' ');
}

export function getPlatformColor(platform) {
  switch (getPlatformDisplayName(platform)) {
    case 'Supply Quality Notice': return '#A36472';
    case 'Compliance Signal': return '#4F7D7B';
    case 'Cold Chain Bulletin': return '#437C94';
    case 'Regulatory Notice': return '#C74634';
    case 'Capacity Alert': return '#796087';
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
  compliance_market: 'PharmaPrep Compliance Feed',
  coldchainops_brief: 'Cold Chain Operations Bulletin',
  protocoldesk_monitor: 'Protocol Desk Monitor',
  midwest_node: 'Midwest Care Supply Node',
};

const SOURCE_TOKEN_LABELS = {
  aircargo: 'Air Cargo',
  assay: 'Assay',
  biologics: 'Biologics',
  care: 'Care',
  carelogistics: 'Care Logistics',
  celltherapy: 'Cell Therapy',
  cdmo: 'Manufacturing Partner',
  coldchain: 'Cold Chain',
  coldchainops: 'Cold Chain Operations',
  compliance: 'Compliance',
  cro: 'Research Partner',
  diagnostic: 'Diagnostics',
  emaupdates: 'Quality Review Updates',
  fda: 'Regulatory',
  fdawatch: 'Regulatory Watch',
  freight: 'Care Logistics',
  gxp: 'GxP',
  gxpdesk: 'GxP Desk',
  import: 'Import Review',
  lab: 'Lab',
  labdesk: 'Lab Desk',
  market: 'Feed',
  mhra: 'Regulatory',
  midwest: 'Midwest Care',
  northeast: 'Northeast Care',
  pacific: 'Pacific Care',
  pharma: 'Pharma',
  port: 'Logistics',
  portsupply: 'Logistics Supply',
  protocol: 'Protocol',
  protocoldesk: 'Protocol Desk',
  pv: 'Pharmacovigilance',
  pvwatch: 'Pharmacovigilance Watch',
  quality: 'Quality',
  recall: 'Recall',
  regulatory: 'Regulatory',
  release: 'Release',
  route: 'Care Route',
  safety: 'Safety',
  site: 'Care Site',
  stability: 'Stability',
  sterility: 'Sterility',
  southwest: 'Southwest Care',
  trial: 'Trial Supply',
  vaccine: 'Vaccine',
  vaccinewatch: 'Vaccine Watch',
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
  lab: 'Lab Feed',
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
