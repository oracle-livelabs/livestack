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

export function formatScore(value) {
  if (value == null || value === '') return 'Not scored';
  const score = Number(value);
  if (!Number.isFinite(score)) return 'Not scored';
  return score.toLocaleString('en-US', { maximumFractionDigits: 2 });
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
    case 'critical': return '#C74634';
    case 'escalating': return '#AA643B';
    case 'elevated': return '#AA643B';
    default: return '#7A736E';
  }
}
