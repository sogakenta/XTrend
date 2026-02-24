import { NextResponse } from 'next/server';
import { getPlaceSlugsForSitemap } from '@/lib/data';
import { getSiteUrl } from '@/lib/seo';

/**
 * Places sitemap
 * GET /sitemaps/places.xml
 */
export async function GET() {
  const baseUrl = getSiteUrl();
  const places = await getPlaceSlugsForSitemap();

  const urls = places
    .map(
      (place) => `
  <url>
    <loc>${baseUrl}/place/${place.slug}</loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
