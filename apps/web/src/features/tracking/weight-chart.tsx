import type { WeightEntry } from './tracking-api';

type ChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  recordedAt: string;
};

const width = 360;
const height = 190;
const horizontalPadding = 28;
const topPadding = 24;
const bottomPadding = 36;

export function WeightChart({
  entries,
  timezone,
}: {
  entries: WeightEntry[];
  timezone: string;
}) {
  const points = buildPoints(entries);
  if (points.length === 0) return null;

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = points[0]!;
  const last = points.at(-1)!;
  const sameDay =
    chartDate(first.recordedAt, timezone) ===
    chartDate(last.recordedAt, timezone);

  return (
    <div className="weight-chart-wrap">
      <svg
        className="weight-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="График изменения веса"
      >
        <title>Изменение веса по недавним записям</title>
        <line
          className="weight-chart-grid"
          x1={horizontalPadding}
          x2={width - horizontalPadding}
          y1={topPadding}
          y2={topPadding}
        />
        <line
          className="weight-chart-grid"
          x1={horizontalPadding}
          x2={width - horizontalPadding}
          y1={height - bottomPadding}
          y2={height - bottomPadding}
        />
        {points.length > 1 && (
          <polyline className="weight-chart-line" points={line} />
        )}
        {points.map((point) => (
          <circle
            key={point.id}
            data-testid="weight-chart-point"
            className="weight-chart-point"
            cx={point.x}
            cy={point.y}
            r="4.5"
          />
        ))}
        <text className="weight-chart-value" x={first.x} y={first.y - 12}>
          {formatChartWeight(first.value)}
        </text>
        {points.length > 1 && (
          <text
            className="weight-chart-value weight-chart-value-last"
            x={last.x}
            y={last.y - 12}
          >
            {formatChartWeight(last.value)}
          </text>
        )}
        <text
          className="weight-chart-date"
          x={points.length === 1 ? width / 2 : horizontalPadding}
          y={height - 10}
          textAnchor={points.length === 1 ? 'middle' : 'start'}
        >
          {chartDate(first.recordedAt, timezone)}
        </text>
        {!sameDay && (
          <text
            className="weight-chart-date"
            x={width - horizontalPadding}
            y={height - 10}
            textAnchor="end"
          >
            {chartDate(last.recordedAt, timezone)}
          </text>
        )}
      </svg>
    </div>
  );
}

function buildPoints(entries: WeightEntry[]): ChartPoint[] {
  const ordered = [...entries].sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() -
      new Date(right.recordedAt).getTime(),
  );
  const values = ordered.map((entry) => Number(entry.weightKg));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const chartRange = range === 0 ? 1 : range * 1.25;
  const chartMinimum = range === 0 ? minimum - 0.5 : minimum - range * 0.125;
  const plotWidth = width - horizontalPadding * 2;
  const plotHeight = height - topPadding - bottomPadding;

  return ordered.map((entry, index) => ({
    id: entry.id,
    x:
      ordered.length === 1
        ? width / 2
        : horizontalPadding + (index / (ordered.length - 1)) * plotWidth,
    y:
      topPadding +
      (1 - (Number(entry.weightKg) - chartMinimum) / chartRange) * plotHeight,
    value: Number(entry.weightKg),
    recordedAt: entry.recordedAt,
  }));
}

function chartDate(recordedAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(recordedAt));
}

function formatChartWeight(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}
