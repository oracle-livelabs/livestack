export function formatNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function formatCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatDate(d) {
  if (!d) return '—';
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
    case 'viral': return '#E87B1A';
    case 'rising': return '#D4760A';
    default: return '#6B6560';
  }
}

export function getPlatformColor(platform) {
  switch (platform) {
    case 'instagram': return '#D4549A';
    case 'tiktok': return '#1AADA8';
    case 'twitter': return '#1B84ED';
    case 'youtube': return '#C74634';
    case 'threads': return '#7B48A5';
    default: return '#9D9893';
  }
}
