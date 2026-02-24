import { NextResponse } from 'next/server';
import { getTermsForSitemap } from '@/lib/data';
import { getSiteUrl, sitemapConfig } from '@/lib/seo';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Terms sitemap (paginated)
 * GET /sitemaps/terms/1, /sitemaps/terms/2, ...
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const pageNum = parseInt(id, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const baseUrl = getSiteUrl();
  const chunkSize = sitemapConfig.termChunkSize;
  const offset = (pageNum - 1) * chunkSize;

  const terms = await getTermsForSitemap(offset, chunkSize);

  if (terms.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const urls = terms
    .map(
      (term) => `
  <url>
    <loc>${baseUrl}/term/t-${term.term_id}</loc>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
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
