import { notFound, redirect } from 'next/navigation';
import { getPlaceBySlug, getLatestTrends, getTrendsAtOffset } from '@/lib/data';
import { TrendList, UpdatedAt, TimeOffsetTabs } from '@/components';
import { VALID_OFFSETS } from '@/lib/constants';
import type { Metadata } from 'next';

// ISR: 600 seconds (10 minutes)
export const revalidate = 600;

/**
 * Parse and validate offset parameter.
 * Returns { valid: true, value } for valid values, { valid: false } for invalid.
 * Strict validation: only exact numeric strings matching preset values are accepted.
 */
function parseOffset(offsetStr: string | undefined): { valid: true; value: number } | { valid: false } {
  if (!offsetStr) return { valid: true, value: 0 };

  // Strict validation: must be exact numeric string (no "1abc", "3.5", etc.)
  if (!/^\d+$/.test(offsetStr)) {
    return { valid: false };
  }

  const parsed = parseInt(offsetStr, 10);
  // Reject non-preset values (cast to number[] for includes check)
  if (!(VALID_OFFSETS as readonly number[]).includes(parsed)) {
    return { valid: false };
  }
  return { valid: true, value: parsed };
}

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
  const { offset: offsetStr } = await searchParams;
  const offsetResult = parseOffset(offsetStr);

  // Redirect invalid offset to base path (prevents cache key explosion)
  if (!offsetResult.valid) {
    redirect(`/place/${slug}`);
  }
  const offset = offsetResult.value;

  const place = await getPlaceBySlug(slug);
  if (!place) {
    notFound();
  }

  const data = offset > 0
    ? await getTrendsAtOffset(place.woeid, offset)
    : await getLatestTrends(place.woeid);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {place.name_ja}のトレンド
        </h1>
        <UpdatedAt capturedAt={data.capturedAt} />
      </div>

      <div className="mb-6">
        <TimeOffsetTabs currentOffset={offset} basePath={`/place/${slug}`} />
      </div>

      <TrendList trends={data.trends} />
    </div>
  );
}
