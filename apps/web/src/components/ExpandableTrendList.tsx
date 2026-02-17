'use client';

import { useState } from 'react';
import { TrendList } from './TrendList';
import type { TrendItemWithSignals } from '@/lib/types';

interface ExpandableTrendListProps {
  trends: TrendItemWithSignals[];
  showSignals?: boolean;
  initialCount?: number;
}

export function ExpandableTrendList({
  trends,
  showSignals = false,
  initialCount = 20,
}: ExpandableTrendListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMore = trends.length > initialCount;
  const displayedTrends = isExpanded ? trends : trends.slice(0, initialCount);

  return (
    <div>
      <TrendList trends={displayedTrends} showSignals={showSignals} />

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline transition-all duration-200"
          >
            {isExpanded ? (
              <span>↑ 20位まで表示に戻す</span>
            ) : (
              <span>↓ 50位まで見る</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
