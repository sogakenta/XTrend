import Link from 'next/link';
import type { TrendItemWithSignals } from '@/lib/types';

interface TrendCardProps {
  trend: TrendItemWithSignals;
  showRank?: boolean;
  showSignals?: boolean;
  compact?: boolean;
}

export function TrendCard({ trend, showRank = true, showSignals = false, compact = false }: TrendCardProps) {
  const hasSignals = showSignals && (trend.rankChange !== undefined || trend.durationHours !== undefined || trend.regionCount !== undefined);

  if (compact) {
    // Compact mode for horizontal scroll view
    return (
      <Link
        href={`/term/t-${trend.termId}`}
        className="block py-2 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          {showRank && (
            <span className="w-6 text-right text-sm font-bold text-zinc-400 dark:text-zinc-500 flex-shrink-0">
              {trend.position}
            </span>
          )}
          <span className="text-zinc-900 dark:text-zinc-100 font-medium text-sm truncate">
            {trend.termText}
          </span>
        </div>
        {/* Compact signals - inline */}
        {hasSignals && (
          <div className="flex items-center gap-1.5 mt-1 ml-8">
            {trend.rankChange !== undefined && trend.rankChange !== 0 && (
              <span className={`text-xs ${trend.rankChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {trend.rankChange > 0 ? '↑' : '↓'}{Math.abs(trend.rankChange)}
              </span>
            )}
            {trend.durationHours !== undefined && (
              <span className="text-xs text-zinc-500">{trend.durationHours}h</span>
            )}
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={`/term/t-${trend.termId}`}
      className="block py-4 px-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
    >
      {/* Main row: Rank + Term + Tweet count */}
      <div className="flex items-center gap-4">
        {showRank && (
          <span className="w-8 text-right text-lg font-bold text-zinc-400 dark:text-zinc-500">
            {trend.position}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">
            {trend.termText}
          </span>
        </div>
        {trend.tweetCount && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            {formatCount(trend.tweetCount)} posts
          </span>
        )}
      </div>

      {/* Signals row: Momentum indicators */}
      {hasSignals && (
        <div className="flex items-center gap-3 mt-2 ml-12">
          {trend.rankChange !== undefined && trend.rankChange !== 0 && (
            <SignalBadge
              icon={trend.rankChange > 0 ? '↑' : '↓'}
              value={`${Math.abs(trend.rankChange)}`}
              label="1h"
              variant={trend.rankChange > 0 ? 'positive' : 'negative'}
            />
          )}
          {trend.rankChange === 0 && (
            <SignalBadge icon="→" value="0" label="1h" variant="neutral" />
          )}
          {trend.durationHours !== undefined && (
            <SignalBadge icon="⏱" value={`${trend.durationHours}h`} label="継続" variant="neutral" />
          )}
          {trend.regionCount !== undefined && trend.regionCount > 1 && (
            <SignalBadge icon="📍" value={`${trend.regionCount}`} label="地域" variant="neutral" />
          )}
        </div>
      )}

      {/* Description row */}
      {trend.description && (
        <div className="mt-2 ml-12">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {trend.description}
          </p>
          {trend.descriptionSource && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              出典: {trend.descriptionSource === 'wikipedia' ? 'Wikipedia' :
                     trend.descriptionSource === 'wikidata' ? 'Wikidata' : 'Mock'}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

interface SignalBadgeProps {
  icon: string;
  value: string;
  label: string;
  variant: 'positive' | 'negative' | 'neutral';
}

function SignalBadge({ icon, value, label, variant }: SignalBadgeProps) {
  const colors = {
    positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}>
      <span>{icon}</span>
      <span>{value}</span>
      <span className="text-[10px] opacity-70">{label}</span>
    </span>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
