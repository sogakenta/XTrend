import { NextResponse } from 'next/server';
import { getTermCount } from '@/lib/data';
import { getSiteUrl, sitemapConfig } from '@/lib/seo';

/**
 * Generate sitemap index XML that references all split sitemaps
 * GET /sitemap-index.xml
 *
 * Structure:
 * - /sitemaps/core.xml     - Homepage
 * - /sitemaps/places.xml   - Place pages
 * - /sitemaps/terms/1      - Term pages (paginated)
 */
export async function GET() {
  const baseUrl = getSiteUrl();
  const termCount = await getTermCount();
  const termSitemapCount = Math.ceil(termCount / sitemapConfig.termChunkSize);
  const lastmod = new Date().toISOString();

  const sitemapEntries = [
    // Core sitemap (homepage)
    `
  <sitemap>
    <loc>${baseUrl}/sitemaps/core.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`,
    // Places sitemap
    `
  <sitemap>
    <loc>${baseUrl}/sitemaps/places.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`,
  ];

  // Term sitemaps (1-indexed for readability)
  for (let i = 1; i <= termSitemapCount; i++) {
    sitemapEntries.push(`
  <sitemap>
    <loc>${baseUrl}/sitemaps/terms/${i}</loc>
    <lastmod>${lastmod}</lastmod>
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
