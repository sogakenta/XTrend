import { getTrendsForAllOffsets } from '@/lib/data';
import { ExpandableTrendList, UpdatedAt } from '@/components';
import type { TrendItemWithSignals } from '@/lib/types';
import { DEFAULT_DISPLAY_OFFSETS, OFFSET_LABELS } from '@/lib/constants';

// ISR: 600 seconds (10 minutes)
export const revalidate = 600;

// Japan WOEID
const JAPAN_WOEID = 23424856;

export default async function HomePage() {
  // Optimized: Fetch all offsets in ~5 queries instead of 37
  const offsets = DEFAULT_DISPLAY_OFFSETS;
  const data = await getTrendsForAllOffsets(JAPAN_WOEID, offsets);

  if (!data) {
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

  // Build column data from optimized results
  const columns = offsets.map(offset => {
    const result = data.results.get(offset);
    return {
      offset,
      label: OFFSET_LABELS[offset],
      data: result ? { capturedAt: result.capturedAt, trends: result.trends } : null,
      showSignals: offset === 0,
    };
  });

  // Check if we have any data
  const currentData = data.results.get(0);
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
    <div className="max-w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          日本のトレンド
        </h1>
        <UpdatedAt capturedAt={currentData.capturedAt} />
      </div>

      {/* SP: vertical stack, PC: horizontal scroll */}
      {/* Mobile */}
      <div className="md:hidden flex flex-col gap-8">
        {columns.map(({ offset, label, data, showSignals }) => (
          <div key={offset} className="flex flex-col">
            <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                {label}
              </h2>
            </div>
            {data && data.trends.length > 0 ? (
              <ExpandableTrendList
                trends={data.trends as TrendItemWithSignals[]}
                showSignals={showSignals}
              />
            ) : (
              <p className="text-zinc-500 text-sm py-4">データなし</p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: horizontal scroll */}
      <div className="hidden md:block overflow-x-auto -mx-4 px-4 pb-4">
        <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
          {columns.map(({ offset, label, data, showSignals }) => (
            <div key={offset} className="flex flex-col w-[320px] flex-shrink-0">
              <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                  {label}
                </h2>
              </div>
              {data && data.trends.length > 0 ? (
                <ExpandableTrendList
                  trends={data.trends as TrendItemWithSignals[]}
                  showSignals={showSignals}
                />
              ) : (
                <p className="text-zinc-500 text-sm py-4">データなし</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
