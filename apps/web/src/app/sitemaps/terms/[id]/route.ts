import { NextResponse } from 'next/server';
import { getMaxTermId } from '@/lib/data';
import { getSiteUrl, sitemapConfig } from '@/lib/seo';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Terms sitemap (paginated)
 * GET /sitemaps/terms/1.xml, /sitemaps/terms/2.xml, ...
 *
 * Generates URLs from term_id 1 to maxTermId using a loop.
 * Each page contains up to termChunkSize (10000) URLs.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  // Expect format: "1.xml", "2.xml", etc.
  if (!id.endsWith('.xml')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const pageNum = parseInt(id.replace('.xml', ''), 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const baseUrl = getSiteUrl();
  const chunkSize = sitemapConfig.termChunkSize;
  const maxTermId = await getMaxTermId();

  // Calculate start and end term_id for this page
  const startId = (pageNum - 1) * chunkSize + 1;
  const endId = Math.min(pageNum * chunkSize, maxTermId);

  // Return 404 if this page is beyond the max
  if (startId > maxTermId) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Generate URLs for term_id range
  const urls: string[] = [];
  for (let termId = startId; termId <= endId; termId++) {
    urls.push(`
  <url>
    <loc>${baseUrl}/term/t-${termId}</loc>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
