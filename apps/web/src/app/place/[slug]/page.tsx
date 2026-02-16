import { notFound } from 'next/navigation';
import { getPlaceBySlug, getLatestTrends, getTrendsAtOffset } from '@/lib/data';
import { TrendList, UpdatedAt, TimeOffsetTabs } from '@/components';
import type { Metadata } from 'next';

// ISR: 300 seconds
export const revalidate = 300;

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
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

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
