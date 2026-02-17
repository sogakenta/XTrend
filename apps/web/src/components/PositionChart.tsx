'use client';

// Position 53 represents "圏外" (out of ranking) - extra gap for visual distinction from 50位
const OUT_OF_RANK_POSITION = 53;

interface DataPoint {
  capturedAt: string;
  position: number | null; // null = 圏外
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

  // Check if we have any out-of-rank data
  const hasOutOfRank = data.some(d => d.position === null);

  // Calculate dynamic Y-axis range based on data
  const validPositions = data.filter(d => d.position !== null).map(d => d.position as number);
  const dataMin = validPositions.length > 0 ? Math.min(...validPositions) : 1;
  const dataMax = validPositions.length > 0 ? Math.max(...validPositions) : 50;

  // Add padding of 2, but clamp to 1-50 (or 51 if we have out-of-rank)
  const minPos = Math.max(1, dataMin - 2);
  const maxPos = hasOutOfRank ? OUT_OF_RANK_POSITION : Math.min(50, dataMax + 2);

  // Helper to calculate Y position
  const getY = (pos: number) =>
    padding.top + ((pos - minPos) / (maxPos - minPos)) * (chartHeight - padding.top - padding.bottom);

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * (chartWidth - padding.left - padding.right);
    const effectivePosition = d.position ?? OUT_OF_RANK_POSITION;
    const y = getY(effectivePosition);
    return { x, y, position: d.position, time: d.capturedAt, isOutOfRank: d.position === null };
  });

  // Create single continuous path connecting all points (including 圏外)
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Y-axis labels - dynamic based on range, avoiding overlaps
  const minLabelDistance = 18; // Minimum pixel distance between labels
  const range = maxPos - minPos;
  const step = range <= 10 ? 2 : range <= 20 ? 5 : 10;

  // Generate candidate labels
  const candidateLabels: Array<{ pos: number; label: string; isOutOfRank: boolean }> = [];
  for (let pos = Math.ceil(minPos / step) * step; pos <= 50; pos += step) {
    if (pos >= minPos) {
      candidateLabels.push({ pos, label: `${pos}位`, isOutOfRank: false });
    }
  }
  // Add 圏外 if needed
  if (hasOutOfRank) {
    candidateLabels.push({ pos: OUT_OF_RANK_POSITION, label: '圏外', isOutOfRank: true });
  }

  // Filter labels to avoid overlaps
  const filteredLabels: typeof candidateLabels = [];
  for (const candidate of candidateLabels) {
    const candidateY = getY(candidate.pos);
    const hasOverlap = filteredLabels.some(existing => {
      const existingY = getY(existing.pos);
      return Math.abs(candidateY - existingY) < minLabelDistance;
    });
    if (!hasOverlap) {
      filteredLabels.push(candidate);
    }
  }

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
        {/* Grid lines and labels */}
        {filteredLabels.map(({ pos, label, isOutOfRank }) => {
          const y = getY(pos);
          return (
            <g key={label}>
              <line
                x1={padding.left}
                y1={y}
                x2={chartWidth - padding.right}
                y2={y}
                stroke="currentColor"
                className={isOutOfRank ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-300 dark:text-zinc-500"}
                strokeDasharray={isOutOfRank ? "2 2" : "4 4"}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className={`text-xs font-medium ${isOutOfRank ? 'fill-zinc-500 dark:fill-zinc-400' : 'fill-zinc-600 dark:fill-zinc-300'}`}
              >
                {label}
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
              className="text-xs font-medium fill-zinc-600 dark:fill-zinc-300"
            >
              {time}
            </text>
          );
        })}

        {/* Single continuous line connecting all points */}
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
                {p.isOutOfRank ? '圏外' : `${p.position}位`}
              </text>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
