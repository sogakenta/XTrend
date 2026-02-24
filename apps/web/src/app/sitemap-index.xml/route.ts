import { NextResponse } from 'next/server';
import { getTermCount } from '@/lib/data';
import { getSiteUrl, sitemapConfig } from '@/lib/seo';

/**
 * Generate sitemap index XML that references all split sitemaps
 * GET /sitemap-index.xml
 */
export async function GET() {
  const baseUrl = getSiteUrl();
  const termCount = await getTermCount();
  const termSitemapCount = Math.ceil(termCount / sitemapConfig.termChunkSize);

  // Total sitemaps: 1 (core+place) + termSitemapCount (terms)
  const totalSitemaps = 1 + termSitemapCount;

  const sitemapEntries = [];
  for (let i = 0; i < totalSitemaps; i++) {
    sitemapEntries.push(`
  <sitemap>
    <loc>${baseUrl}/sitemap/${i}.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('')}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
