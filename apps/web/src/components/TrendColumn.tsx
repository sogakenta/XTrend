'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TrendItem } from '@/lib/types';
import { COLUMN_INITIAL_ITEMS, OFFSET_LABELS, type ValidOffset } from '@/lib/constants';

interface TrendColumnProps {
  offset: ValidOffset;
  trends: TrendItem[];
  capturedAt: string;
}

export function TrendColumn({ offset, trends, capturedAt }: TrendColumnProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const initialItems = trends.slice(0, COLUMN_INITIAL_ITEMS);
  const expandedItems = trends.slice(COLUMN_INITIAL_ITEMS);
  const hasMore = expandedItems.length > 0;

  const displayedTrends = isExpanded ? trends : initialItems;

  // Format captured time for display
  const capturedTime = new Date(capturedAt);
  const timeStr = capturedTime.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Column Header */}
      <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          {OFFSET_LABELS[offset]}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {timeStr}
        </p>
      </div>

      {/* Trend Items */}
      {trends.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-500 text-sm">
          データなし
        </div>
      ) : (
        <>
          <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {displayedTrends.map((trend) => (
              <li key={`${trend.termId}-${trend.position}`}>
                <Link
                  href={`/term/t-${trend.termId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <span className="w-6 text-right text-sm font-medium text-zinc-400 dark:text-zinc-500">
                    {trend.position}
                  </span>
                  <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {trend.termText}
                  </span>
                  {trend.tweetCount && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {formatCount(trend.tweetCount)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>

          {/* Expand/Collapse Button */}
          {hasMore && (
            <div className="border-t border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1"
              >
                {isExpanded ? (
                  <>
                    <span>閉じる</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    <span>21-{trends.length}位を表示</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
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
