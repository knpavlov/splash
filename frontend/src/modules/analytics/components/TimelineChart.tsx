import { useMemo } from 'react';
import styles from '../../../styles/AnalyticsScreen.module.css';
import type { TimelinePoint } from '../types/analytics';

export interface SeriesConfig {
  key: keyof TimelinePoint;
  label: string;
  color: string;
  type: 'count' | 'percentage' | 'score';
}

interface TimelineChartProps {
  points: TimelinePoint[];
  series: SeriesConfig[];
}

const WIDTH = 960;
const HEIGHT = 360;
const PADDING_X = 72;
const PADDING_Y = 48;

const formatPointLabel = (value: number, type: SeriesConfig['type']) => {
  if (type === 'count') {
    return String(Math.round(value));
  }
  if (type === 'score') {
    return value.toFixed(1);
  }
  return `${Math.round(value * 1000) / 10}%`;
};

const formatMonthLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric'
  }).format(date);
};

export const TimelineChart = ({ points, series }: TimelineChartProps) => {
  const xPositions = useMemo(() => {
    if (points.length <= 1) {
      return points.map(() => WIDTH / 2);
    }
    const availableWidth = WIDTH - PADDING_X * 2;
    return points.map((_, index) => PADDING_X + (index / (points.length - 1)) * availableWidth);
  }, [points]);

  const countsSeries = series.filter((item) => item.type === 'count');
  const percentageSeries = series.filter((item) => item.type !== 'count');

  const countsMax = useMemo(() => {
    if (!countsSeries.length) {
      return 1;
    }
    const max = Math.max(
      ...points.map((point) =>
        Math.max(
          ...countsSeries.map((item) => {
            const value = point[item.key];
            return typeof value === 'number' ? value : 0;
          })
        )
      )
    );
    return max > 0 ? max : 1;
  }, [countsSeries, points]);

  const buildPath = (values: (number | null)[], color: string) => {
    let path = '';
    let moveTo = true;
    values.forEach((value, index) => {
      if (value == null) {
        moveTo = true;
        return;
      }
      const x = xPositions[index];
      const y = HEIGHT - PADDING_Y - value * (HEIGHT - PADDING_Y * 2);
      if (moveTo) {
        path += `M ${x} ${y}`;
        moveTo = false;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    return <path key={color} d={path} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />;
  };

  const countPaths = countsSeries.map((item) => {
    const values = points.map((point) => {
      const raw = point[item.key];
      if (typeof raw !== 'number') {
        return null;
      }
      return raw / countsMax;
    });
    return buildPath(values, item.color);
  });

  const percentagePaths = percentageSeries.map((item) => {
    const values = points.map((point) => {
      const raw = point[item.key];
      if (typeof raw !== 'number') {
        return null;
      }
      const normalized = item.type === 'score' ? raw * 20 : raw * 100;
      return normalized / 100;
    });
    return buildPath(values, item.color);
  });

  const xLabels = useMemo(() => {
    const step = points.length > 8 ? Math.ceil(points.length / 8) : 1;
    return points.map((point, index) => ({
      label: formatMonthLabel(point.bucket),
      index,
      visible: index % step === 0 || index === points.length - 1
    }));
  }, [points]);

  const availableHeight = HEIGHT - PADDING_Y * 2;

  return (
    <div className={styles.timelineWrapper}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Key metrics over time">
        <defs>
          <linearGradient id="gridGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(148, 163, 184, 0.25)" />
            <stop offset="100%" stopColor="rgba(148, 163, 184, 0)" />
          </linearGradient>
        </defs>
        {/* Axes */}
        <line x1={PADDING_X} y1={HEIGHT - PADDING_Y} x2={WIDTH - PADDING_X} y2={HEIGHT - PADDING_Y} stroke="rgba(148,163,184,0.6)" strokeWidth={1.2} />
        <line x1={PADDING_X} y1={PADDING_Y} x2={PADDING_X} y2={HEIGHT - PADDING_Y} stroke="rgba(148,163,184,0.6)" strokeWidth={1.2} />
        <line x1={WIDTH - PADDING_X} y1={PADDING_Y} x2={WIDTH - PADDING_X} y2={HEIGHT - PADDING_Y} stroke="rgba(148,163,184,0.4)" strokeWidth={1.2} strokeDasharray="4 6" />

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((value) => (
          <line
            key={`grid-${value}`}
            x1={PADDING_X}
            x2={WIDTH - PADDING_X}
            y1={HEIGHT - PADDING_Y - value * availableHeight}
            y2={HEIGHT - PADDING_Y - value * availableHeight}
            stroke="url(#gridGradient)"
            strokeWidth={1}
          />
        ))}

        {/* Left axis labels for counts */}
        {[0, 0.5, 1].map((value) => (
          <text
            key={`y-left-${value}`}
            x={PADDING_X - 16}
            y={HEIGHT - PADDING_Y - value * availableHeight + 4}
            textAnchor="end"
            fontSize={12}
            fill="#475569"
          >
            {Math.round(countsMax * value)}
          </text>
        ))}

        {/* Right axis labels for percentages and scores */}
        {[0, 0.5, 1].map((value) => (
          <text
            key={`y-right-${value}`}
            x={WIDTH - PADDING_X + 16}
            y={HEIGHT - PADDING_Y - value * availableHeight + 4}
            textAnchor="start"
            fontSize={12}
            fill="#475569"
          >
            {Math.round(100 * value)}%
          </text>
        ))}

        {/* X axis labels */}
        {xLabels.map((item) => (
          <text
            key={`x-${item.index}`}
            x={xPositions[item.index]}
            y={HEIGHT - PADDING_Y + 24}
            textAnchor="middle"
            fontSize={12}
            fill={item.visible ? '#475569' : 'rgba(71,85,105,0)'}
          >
            {item.visible ? item.label : ''}
          </text>
        ))}

        {countPaths}
        {percentagePaths}

        {/* Data points */}
        {series.map((item) =>
          points.map((point, index) => {
            const raw = point[item.key];
            if (typeof raw !== 'number') {
              return null;
            }
            const normalized =
              item.type === 'count'
                ? raw / countsMax
                : item.type === 'score'
                ? (raw * 20) / 100
                : (raw * 100) / 100;
            const x = xPositions[index];
            const y = HEIGHT - PADDING_Y - normalized * availableHeight;
            const label = formatPointLabel(raw, item.type);
            return (
              <g key={`${item.key}-${index}`}>
                <circle cx={x} cy={y} r={3.5} fill={item.color} />
                <text
                  x={x}
                  y={y - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={item.color}
                >
                  {label}
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
};
