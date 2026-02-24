import { notFound } from 'next/navigation';
import { getTermById, getTermHistory } from '@/lib/data';
import { PositionChart } from '@/components';
import type { Metadata } from 'next';
import { siteConfig } from '@/lib/seo';

// ISR: 900 seconds
export const revalidate = 900;

interface PageProps {
  params: Promise<{ termKey: string }>;
  searchParams: Promise<{ range?: string }>;
}

function parseTermKey(termKey: string): number | null {
  const match = termKey.match(/^t-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { termKey } = await params;
  const termId = parseTermKey(termKey);

  if (!termId) {
    return {
      title: 'Not Found',
      robots: { index: false, follow: false },
    };
  }

  // Use lightweight getTermById instead of heavy getTermHistory
  const term = await getTermById(termId);
  if (!term) {
    return {
      title: 'Not Found',
      robots: { index: false, follow: false },
    };
  }

  const title = term.term_text + 'のトレンド推移';
  const description = '「' + term.term_text + '」のXトレンド順位推移をグラフで確認。地域別の過去24時間・7日間の動きが見られます。';
  // Always use canonical without query params to avoid duplicate content
  const canonicalUrl = '/term/' + termKey;

  return {
    title,
    description,
    openGraph: {
      title: title + ' | ' + siteConfig.name,
      description,
      url: canonicalUrl,
    },
    twitter: {
      title: title + ' | ' + siteConfig.name,
      description,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function TermPage({ params, searchParams }: PageProps) {
  const { termKey } = await params;
  const { range: rangeStr } = await searchParams;

  const termId = parseTermKey(termKey);
  if (!termId) {
    notFound();
  }

  const hours = rangeStr === '7d' ? 168 : 24;
  const data = await getTermHistory(termId, hours);

  if (!data) {
    notFound();
  }

  // Group history by place
  const historyByPlace = new Map<number, typeof data.history>();
  for (const h of data.history) {
    const existing = historyByPlace.get(h.woeid) || [];
    existing.push(h);
    historyByPlace.set(h.woeid, existing);
  }

  // Sort by sortOrder (smaller = higher priority)
  const sortedEntries = Array.from(historyByPlace.entries()).sort((a, b) => {
    const sortOrderA = a[1][0]?.sortOrder ?? 100;
    const sortOrderB = b[1][0]?.sortOrder ?? 100;
    return sortOrderA - sortOrderB;
  });

  const rangeLabel = hours === 168 ? '7日間' : '24時間';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {data.term.term_text}
        </h1>
        <p className="text-sm text-zinc-500">
          過去{rangeLabel}の順位推移
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href={'/term/' + termKey}
          className={'px-3 py-1.5 text-sm rounded-full transition-colors ' + (
            hours === 24
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
          )}
        >
          24時間
        </a>
        <a
          href={'/term/' + termKey + '?range=7d'}
          className={'px-3 py-1.5 text-sm rounded-full transition-colors ' + (
            hours === 168
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
          )}
        >
          7日間
        </a>
      </div>

      {sortedEntries.map(([woeid, history]) => {
        // Filter to get only ranked entries (position !== null)
        const rankedHistory = history.filter(h => h.position !== null);
        const rankedPositions = rankedHistory.map(h => h.position as number);
        const bestRank = rankedPositions.length > 0 ? Math.min(...rankedPositions) : null;
        const worstRank = rankedPositions.length > 0 ? Math.max(...rankedPositions) : null;
        const rankInCount = rankedHistory.length;
        const outOfRankCount = history.length - rankedHistory.length;

        return (
          <div key={woeid} className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {history[0]?.placeName || '不明'}
            </h2>

            <PositionChart data={history} height={250} />

            <div className="mt-4 grid grid-cols-4 gap-4 text-center">
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {bestRank !== null ? bestRank + '位' : '-'}
                </div>
                <div className="text-xs text-zinc-500">最高順位</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {worstRank !== null ? worstRank + '位' : '-'}
                </div>
                <div className="text-xs text-zinc-500">最低順位</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {rankInCount}回
                </div>
                <div className="text-xs text-zinc-500">ランクイン</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                <div className="text-2xl font-bold text-zinc-400 dark:text-zinc-500">
                  {outOfRankCount}回
                </div>
                <div className="text-xs text-zinc-500">圏外</div>
              </div>
            </div>

            <details className="mt-4">
              <summary className="text-sm text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                全データを表示
              </summary>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2">時刻</th>
                    <th className="py-2">順位</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[...history].reverse().map((h, i) => (
                    <tr key={i}>
                      <td className="py-2 text-zinc-700 dark:text-zinc-300">
                        {new Date(h.capturedAt).toLocaleString('ja-JP', {
                          timeZone: 'Asia/Tokyo',
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className={'py-2 font-medium ' + (
                        h.position === null
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-900 dark:text-zinc-100'
                      )}>
                        {h.position !== null ? h.position + '位' : '圏外'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      })}

      {data.history.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          この期間のデータがありません
        </div>
      )}
    </div>
  );
}
