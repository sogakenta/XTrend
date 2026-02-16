import { getLatestTrendsWithSignals, getTrendsAtOffset } from '@/lib/data';
import { TrendList, UpdatedAt } from '@/components';
import Link from 'next/link';
import type { TrendItemWithSignals } from '@/lib/types';

// ISR: 300 seconds
export const revalidate = 300;

// Japan WOEID
const JAPAN_WOEID = 23424856;

export default async function HomePage() {
  // Fetch all time periods in parallel
  const [currentData, oneHourData, threeHourData] = await Promise.all([
    getLatestTrendsWithSignals(JAPAN_WOEID),
    getTrendsAtOffset(JAPAN_WOEID, 1),
    getTrendsAtOffset(JAPAN_WOEID, 3),
  ]);

  const columns = [
    { label: '現在', offset: 0, trends: currentData?.trends || [], showSignals: true },
    { label: '1時間前', offset: 1, trends: (oneHourData?.trends || []) as TrendItemWithSignals[], showSignals: false },
    { label: '3時間前', offset: 3, trends: (threeHourData?.trends || []) as TrendItemWithSignals[], showSignals: false },
  ];

  if (!currentData) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          データを取得できませんでした
        </h1>
        <p className="text-zinc-500">
          しばらく経ってから再度お試しください
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          日本のトレンド
        </h1>
        <UpdatedAt capturedAt={currentData.capturedAt} />
      </div>

      {/* Multi-column trend lists */}
      <div className="flex gap-8 overflow-x-auto">
        {columns.map((col) => (
          <div key={col.label} className="flex-1 min-w-[320px]">
            <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              {col.label}
            </h2>
            {col.trends.length > 0 ? (
              <>
                <TrendList trends={col.trends.slice(0, 20)} showSignals={col.showSignals} />
                <div className="mt-4 text-center">
                  <Link
                    href={col.offset === 0 ? '/place/jp' : `/place/jp?offset=${col.offset}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    50位まで見る →
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">データなし</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
