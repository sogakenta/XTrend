'use client';

interface DataPoint {
  capturedAt: string;
  position: number;
}

interface PositionChartProps {
  data: DataPoint[];
  height?: number;
}

export function PositionChart({ data, height = 200 }: PositionChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        データがありません
      </div>
    );
  }

  const padding = { top: 20, right: 40, bottom: 30, left: 50 };
  const chartWidth = 800;
  const chartHeight = height;

  // Calculate dynamic Y-axis range based on data
  const positions = data.map(d => d.position);
  const dataMin = Math.min(...positions);
  const dataMax = Math.max(...positions);

  // Add padding of 2, but clamp to 1-50
  const minPos = Math.max(1, dataMin - 2);
  const maxPos = Math.min(50, dataMax + 2);

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * (chartWidth - padding.left - padding.right);
    const y = padding.top + ((d.position - minPos) / (maxPos - minPos)) * (chartHeight - padding.top - padding.bottom);
    return { x, y, position: d.position, time: d.capturedAt };
  });

  // Create path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Y-axis labels - dynamic based on range
  const range = maxPos - minPos;
  const step = range <= 10 ? 2 : range <= 20 ? 5 : 10;
  const yLabels: number[] = [];
  for (let pos = Math.ceil(minPos / step) * step; pos <= maxPos; pos += step) {
    if (pos >= minPos) yLabels.push(pos);
  }
  // Always include min and max
  if (!yLabels.includes(minPos)) yLabels.unshift(minPos);
  if (!yLabels.includes(maxPos)) yLabels.push(maxPos);

  // X-axis labels (show a few time labels)
  const xLabelIndices = data.length <= 6
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ height: `${height}px` }}
      >
        {/* Grid lines */}
        {yLabels.map((pos) => {
          const y = padding.top + ((pos - minPos) / (maxPos - minPos)) * (chartHeight - padding.top - padding.bottom);
          return (
            <g key={pos}>
              <line
                x1={padding.left}
                y1={y}
                x2={chartWidth - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-700"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-zinc-500"
              >
                {pos}位
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabelIndices.map((i) => {
          const p = points[i];
          if (!p) return null;
          const time = new Date(data[i].capturedAt).toLocaleTimeString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <text
              key={i}
              x={p.x}
              y={chartHeight - 8}
              textAnchor="middle"
              className="text-xs fill-zinc-500"
            >
              {time}
            </text>
          );
        })}

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          className="text-blue-500"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="currentColor"
            className="text-blue-500"
          />
        ))}

        {/* Hover areas with tooltips */}
        {points.map((p, i) => (
          <g key={`tooltip-${i}`} className="group">
            <circle
              cx={p.x}
              cy={p.y}
              r={12}
              fill="transparent"
              className="cursor-pointer"
            />
            {/* Tooltip */}
            <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <rect
                x={p.x - 40}
                y={p.y - 35}
                width={80}
                height={24}
                rx={4}
                fill="currentColor"
                className="text-zinc-800 dark:text-zinc-200"
              />
              <text
                x={p.x}
                y={p.y - 18}
                textAnchor="middle"
                className="text-xs fill-white dark:fill-zinc-900 font-medium"
              >
                {p.position}位
              </text>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
