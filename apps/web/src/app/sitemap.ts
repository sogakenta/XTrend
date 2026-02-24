import { MetadataRoute } from 'next';
import { getPlaceSlugsForSitemap, getTermCount, getTermsForSitemap } from '@/lib/data';
import { getSiteUrl, sitemapConfig } from '@/lib/seo';

const CHUNK_SIZE = sitemapConfig.termChunkSize;

/**
 * Generate multiple sitemaps:
 * - ID 0: Core pages + Place pages
 * - ID 1+: Term pages (paginated)
 */
export async function generateSitemaps() {
  const termCount = await getTermCount();
  const termSitemapCount = Math.ceil(termCount / CHUNK_SIZE);

  // ID 0 is for core + places, ID 1+ for terms
  const sitemaps = [{ id: 0 }];
  for (let i = 0; i < termSitemapCount; i++) {
    sitemaps.push({ id: i + 1 });
  }

  return sitemaps;
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  if (id === 0) {
    // Core pages + Place pages
    const places = await getPlaceSlugsForSitemap();

    const coreUrls: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 1.0,
      },
    ];

    const placeUrls: MetadataRoute.Sitemap = places.map((place) => ({
      url: `${baseUrl}/place/${place.slug}`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }));

    return [...coreUrls, ...placeUrls];
  }

  // Term pages (ID 1+ = term sitemap index 0+)
  const termSitemapIndex = id - 1;
  const offset = termSitemapIndex * CHUNK_SIZE;
  const terms = await getTermsForSitemap(offset, CHUNK_SIZE);

  return terms.map((term) => ({
    url: `${baseUrl}/term/t-${term.term_id}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.5,
  }));
}
