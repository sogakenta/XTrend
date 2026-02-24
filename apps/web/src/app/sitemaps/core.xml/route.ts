import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/seo';

/**
 * Core sitemap (homepage only)
 * GET /sitemaps/core.xml
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
