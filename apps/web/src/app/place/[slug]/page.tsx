import { notFound } from 'next/navigation';
import { getPlaceBySlug, getTrendsForAllOffsetsBySlug } from '@/lib/data';
import { TrendList, UpdatedAt } from '@/components';
import { DEFAULT_DISPLAY_OFFSETS, OFFSET_LABELS, type ValidOffset } from '@/lib/constants';
import type { Metadata } from 'next';
import type { TrendItemWithSignals } from '@/lib/types';
import Link from 'next/link';

// ISR: 600 seconds (10 minutes)
export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ offset?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);

  if (!place) {
    return { title: 'Not Found' };
  }

  return {
    title: `${place.name_ja}のトレンド - XTrend`,
    description: `${place.name_ja}で話題のトレンドをリアルタイムで確認`,
  };
}

export default async function PlacePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { offset: offsetParam } = await searchParams;

  // Parse offset param to determine which column should show all 50 items
  const expandedOffset = offsetParam !== undefined ? parseInt(offsetParam, 10) : null;

  // Use getTrendsForAllOffsetsBySlug to avoid duplicate place query from generateMetadata
  const offsets = DEFAULT_DISPLAY_OFFSETS;
  const data = await getTrendsForAllOffsetsBySlug(slug, offsets);

  if (!data) {
    notFound();
  }

  const { place, results } = data;

  // Build column data from optimized results
  const columns = offsets.map(offset => {
    const result = results.get(offset);
    const isExpanded = expandedOffset === offset;
    return {
      offset,
      label: OFFSET_LABELS[offset],
      data: result ? { capturedAt: result.capturedAt, trends: result.trends } : null,
      showSignals: offset === 0,
      isExpanded,
    };
  });

  // Check if we have any data
  const currentData = results.get(0);
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
          {place.name_ja}のトレンド
        </h1>
        <UpdatedAt capturedAt={currentData.capturedAt} />
      </div>

      {/* SP: vertical stack, PC: horizontal scroll */}
      {/* Mobile */}
      <div className="md:hidden flex flex-col gap-8">
        {columns.map(({ offset, label, data, showSignals, isExpanded }) => (
          <div key={offset} className="flex flex-col">
            <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                {label}
                {isExpanded && <span className="text-sm font-normal text-zinc-500 ml-2">（50位まで表示）</span>}
              </h2>
              {data?.capturedAt && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {formatTime(data.capturedAt)}
                </p>
              )}
            </div>
            {data && data.trends.length > 0 ? (
              <>
                <TrendList
                  trends={(isExpanded ? data.trends : data.trends.slice(0, 20)) as TrendItemWithSignals[]}
                  showSignals={showSignals}
                />
                {data.trends.length > 20 && (
                  <div className="mt-4 text-center">
                    {isExpanded ? (
                      <Link
                        href={`/place/${slug}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        ← 20位まで表示に戻る
                      </Link>
                    ) : (
                      <Link
                        href={`/place/${slug}?offset=${offset}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        50位まで見る →
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-zinc-500 text-sm py-4">データなし</p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: horizontal scroll */}
      <div className="hidden md:block overflow-x-auto -mx-4 px-4 pb-4">
        <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
          {columns.map(({ offset, label, data, showSignals, isExpanded }) => (
            <div key={offset} className="flex flex-col w-[320px] flex-shrink-0">
              <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                  {label}
                  {isExpanded && <span className="text-sm font-normal text-zinc-500 ml-2">（50位まで）</span>}
                </h2>
                {data?.capturedAt && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {formatTime(data.capturedAt)}
                  </p>
                )}
              </div>
              {data && data.trends.length > 0 ? (
                <>
                  <TrendList
                    trends={(isExpanded ? data.trends : data.trends.slice(0, 20)) as TrendItemWithSignals[]}
                    showSignals={showSignals}
                  />
                  {data.trends.length > 20 && (
                    <div className="mt-4 text-center">
                      {isExpanded ? (
                        <Link
                          href={`/place/${slug}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          ← 20位まで表示に戻る
                        </Link>
                      ) : (
                        <Link
                          href={`/place/${slug}?offset=${offset}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          50位まで見る →
                        </Link>
                      )}
                    </div>
                  )}
                </>
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

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}
