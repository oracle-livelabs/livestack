import { Info } from 'lucide-react';

export function MetricDefinition({ label, children, scale }) {
  const description = [children, scale].filter(Boolean).join(' ');
  return (
    <span className="metric-definition-chip" title={`${label}: ${description}`} aria-label={`${label}: ${description}`}>
      <Info size={12} aria-hidden="true" />
      <span className="metric-definition-chip__label">{label}</span>
      <span className="metric-definition-chip__text">{children}</span>
      {scale && <span className="metric-definition-chip__scale">{scale}</span>}
    </span>
  );
}

export function DefinitionRow({ items }) {
  if (!items?.length) return null;
  return (
    <div className="metric-definition-row" aria-label="Metric definitions">
      {items.map((item) => (
        <MetricDefinition key={item.label} label={item.label} scale={item.scale}>
          {item.description}
        </MetricDefinition>
      ))}
    </div>
  );
}

export function ChartLegend({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="chart-legend" aria-label={title || 'Chart legend'}>
      {title && <span className="chart-legend__title">{title}</span>}
      {items.map((item) => (
        <span key={item.label} className="chart-legend__item">
          <span className="chart-legend__swatch" style={{ background: item.color }} aria-hidden="true" />
          <span className="chart-legend__label">{item.label}</span>
          {item.value && <strong>{item.value}</strong>}
        </span>
      ))}
    </div>
  );
}

export function MetricChip({ label, value, helper, color = '#C74634' }) {
  return (
    <div className="metric-chip" style={{ '--metric-chip-color': color }}>
      <span className="metric-chip__rule" aria-hidden="true" />
      <span className="metric-chip__value">{value}</span>
      <span className="metric-chip__label">{label}</span>
      {helper && <span className="metric-chip__helper">{helper}</span>}
    </div>
  );
}
