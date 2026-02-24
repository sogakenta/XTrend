/**
 * SEO utilities for TrendaX
 */

/** Site URL from environment (required for canonical/OG) */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    // Fallback for development
    return 'http://localhost:3000';
  }
  // Remove trailing slash
  return url.replace(/\/$/, '');
}

/** Convert relative path to absolute URL */
export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/** Default site metadata */
export const siteConfig = {
  name: 'TrendaX',
  title: 'TrendaX - Xのトレンド分析サイト',
  description: '日本のXトレンドをリアルタイムで分析・可視化。過去のランキング推移や地域別トレンドを確認できます。',
  locale: 'ja_JP',
  twitterHandle: '@TrendaX',
} as const;

/** OG Image dimensions */
export const ogImageConfig = {
  width: 1200,
  height: 630,
} as const;

/** Sitemap configuration */
export const sitemapConfig = {
  /** Number of term URLs per sitemap file */
  termChunkSize: 10000,
} as const;
