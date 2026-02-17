import type { TrendItem, TrendItemWithSignals } from '@/lib/types';
import { TrendCard } from './TrendCard';

interface TrendListProps {
  trends: TrendItem[] | TrendItemWithSignals[];
  showRank?: boolean;
  showSignals?: boolean;
  compact?: boolean;
}

export function TrendList({ trends, showRank = true, showSignals = false, compact = false }: TrendListProps) {
  if (trends.length === 0) {
    return (
      <div className={`text-center ${compact ? 'py-4' : 'py-8'} text-zinc-500 ${compact ? 'text-xs' : ''}`}>
        トレンドデータがありません
      </div>
    );
  }

  return (
    <ol className={`divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950 ${compact ? 'rounded-lg' : 'rounded-xl shadow-sm'} border border-zinc-200 dark:border-zinc-800`}>
      {trends.map((trend, index) => (
        <li key={`${trend.termId}-${trend.position}-${index}`}>
          <TrendCard
            trend={trend as TrendItemWithSignals}
            showRank={showRank}
            showSignals={showSignals}
            compact={compact}
          />
        </li>
      ))}
    </ol>
  );
}
