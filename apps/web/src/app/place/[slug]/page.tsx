import { notFound } from 'next/navigation';
import { getPlaceBySlug, getLatestTrendsWithSignals, getTrendsAtOffset } from '@/lib/data';
import { TrendList, UpdatedAt } from '@/components';
import { DEFAULT_DISPLAY_OFFSETS, OFFSET_LABELS, type ValidOffset } from '@/lib/constants';
import type { Metadata } from 'next';
import type { TrendItemWithSignals } from '@/lib/types';
import Link from 'next/link';

// ISR: 600 seconds (10 minutes)
export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
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

export default async function PlacePage({ params }: PageProps) {
  const { slug } = await params;

  const place = await getPlaceBySlug(slug);
  if (!place) {
    notFound();
  }

  // Fetch trends for all display offsets in parallel
  // Use getLatestTrendsWithSignals for current (offset=0), getTrendsAtOffset for others
  const offsets = DEFAULT_DISPLAY_OFFSETS;
  const fetchPromises = offsets.map(offset =>
    offset === 0
      ? getLatestTrendsWithSignals(place.woeid)
      : getTrendsAtOffset(place.woeid, offset)
  );

  const results = await Promise.all(fetchPromises);

  // Build column data
  const columns = offsets.map((offset, index) => ({
    offset,
    label: OFFSET_LABELS[offset],
    data: results[index],
    showSignals: offset === 0, // Only show signals for current time
  }));

  // Check if we have any data
  const currentData = results[0];
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
        {columns.map(({ offset, label, data, showSignals }) => (
          <div key={offset} className="flex flex-col">
            <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                {label}
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
                  trends={data.trends.slice(0, 20) as TrendItemWithSignals[]}
                  showSignals={showSignals}
                />
                {data.trends.length > 20 && (
                  <div className="mt-4 text-center">
                    <Link
                      href={`/place/${slug}?offset=${offset}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      50位まで見る →
                    </Link>
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
          {columns.map(({ offset, label, data, showSignals }) => (
            <div key={offset} className="flex flex-col w-[320px] flex-shrink-0">
              <div className="mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                  {label}
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
                    trends={data.trends.slice(0, 20) as TrendItemWithSignals[]}
                    showSignals={showSignals}
                  />
                  {data.trends.length > 20 && (
                    <div className="mt-4 text-center">
                      <Link
                        href={`/place/${slug}?offset=${offset}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        50位まで見る →
                      </Link>
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
