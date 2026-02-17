import 'server-only';
import { supabase } from './supabase';
import type { Place, PlaceTrends, TrendItem, TrendItemWithSignals, Term, TermHistory } from './types';

/**
 * Resolution mode for captured_at lookup
 * - exact_or_null: Returns the exact time point or null (for rankChange comparison)
 * - nearest_before: Returns the nearest time point before target (for history display)
 */
type ResolveMode = 'exact_or_null' | 'nearest_before';

/**
 * Deduplicate trends by term_id, keeping only the first occurrence (lowest position).
 * This handles edge cases where the same term might appear multiple times due to data issues.
 */
function deduplicateTrends<T extends { termId: number }>(trends: T[]): T[] {
  const seen = new Set<number>();
  return trends.filter(trend => {
    if (seen.has(trend.termId)) {
      return false;
    }
    seen.add(trend.termId);
    return true;
  });
}

/**
 * Resolve the captured_at timestamp for a given offset.
 *
 * @param woeid - The place WOEID
 * @param baseCapturedAt - The base timestamp to calculate offset from
 * @param offsetHours - Hours to go back from base
 * @param mode - Resolution mode
 * @returns The resolved captured_at string or null if not found
 */
async function resolveCapturedAt(
  woeid: number,
  baseCapturedAt: string,
  offsetHours: number,
  mode: ResolveMode = 'exact_or_null'
): Promise<string | null> {
  if (offsetHours === 0) {
    return baseCapturedAt;
  }

  // Calculate target time (UTC)
  const baseTime = new Date(baseCapturedAt);
  const targetTime = new Date(baseTime.getTime() - offsetHours * 60 * 60 * 1000);
  // Round to hour (ingest stores data at hour boundaries)
  targetTime.setUTCMinutes(0, 0, 0);
  const targetIso = targetTime.toISOString();

  if (mode === 'exact_or_null') {
    // Exact match only
    const { data } = await supabase
      .from('trend_snapshot')
      .select('captured_at')
      .eq('woeid', woeid)
      .eq('captured_at', targetIso)
      .limit(1)
      .maybeSingle();

    return data?.captured_at ?? null;
  } else {
    // nearest_before: Find the closest snapshot at or before target time
    const { data } = await supabase
      .from('trend_snapshot')
      .select('captured_at')
      .eq('woeid', woeid)
      .lte('captured_at', targetIso)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.captured_at ?? null;
  }
}

/**
 * Get all active places
 */
export async function getPlaces(): Promise<Place[]> {
  const { data, error } = await supabase
    .from('place')
    .select('*')
    .eq('is_active', true)
    .order('woeid');

  if (error) throw new Error(`Failed to fetch places: ${error.message}`);
  return data as Place[];
}

/**
 * Get place by slug
 */
export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const { data, error } = await supabase
    .from('place')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch place: ${error.message}`);
  }
  return data as Place;
}

/**
 * Get latest trends for a place
 */
export async function getLatestTrends(woeid: number): Promise<PlaceTrends | null> {
  // Get place info
  const { data: place, error: placeError } = await supabase
    .from('place')
    .select('*')
    .eq('woeid', woeid)
    .single();

  if (placeError) return null;

  // Get latest captured_at for this place
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestSnapshot) return null;

  const capturedAt = latestSnapshot.captured_at;

  // Get all trends for that timestamp
  const { data: snapshots, error: snapshotError } = await supabase
    .from('trend_snapshot')
    .select(`
      position,
      term_id,
      tweet_count,
      term:term_id (term_id, term_text)
    `)
    .eq('woeid', woeid)
    .eq('captured_at', capturedAt)
    .order('position');

  if (snapshotError) throw new Error(`Failed to fetch trends: ${snapshotError.message}`);

  const trends: TrendItem[] = deduplicateTrends(
    (snapshots || []).map((s: any) => ({
      position: s.position,
      termId: s.term_id,
      termText: s.term?.term_text || '',
      tweetCount: s.tweet_count,
    }))
  );

  return {
    place: place as Place,
    capturedAt,
    trends,
  };
}

/**
 * Get trends for multiple offsets at once (batch query optimization)
 * Reduces query count from O(n*4) to O(n+3) for n offsets
 */
export async function getTrendsForOffsets(
  woeid: number,
  offsets: number[]
): Promise<Map<number, PlaceTrends>> {
  const result = new Map<number, PlaceTrends>();

  if (offsets.length === 0) return result;

  // Get place info (1 query)
  const { data: place, error: placeError } = await supabase
    .from('place')
    .select('*')
    .eq('woeid', woeid)
    .single();

  if (placeError || !place) return result;

  // Get latest captured_at (1 query)
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestSnapshot) return result;

  const latestCapturedAt = latestSnapshot.captured_at;
  const latestTime = new Date(latestCapturedAt);

  // Calculate all target times
  // For offset=0, use the exact latest captured_at (not rounded)
  // For other offsets, calculate target time rounded to hour boundary
  const targetTimes = offsets.map(offset => {
    if (offset === 0) {
      return { offset, targetIso: latestCapturedAt };
    }
    const targetTime = new Date(latestTime.getTime() - offset * 60 * 60 * 1000);
    targetTime.setUTCMinutes(0, 0, 0);
    return { offset, targetIso: targetTime.toISOString() };
  });

  // Get all unique captured_at values we need (1 query with IN clause)
  const uniqueTargetIsos = [...new Set(targetTimes.map(t => t.targetIso))];
  const { data: availableSnapshots } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .in('captured_at', uniqueTargetIsos)
    .order('captured_at', { ascending: false });

  const availableTimes = new Set(availableSnapshots?.map(s => s.captured_at) || []);

  // Get all trends for available times (1 query)
  const timesToFetch = [...availableTimes];
  if (timesToFetch.length === 0) return result;

  const { data: allSnapshots } = await supabase
    .from('trend_snapshot')
    .select(`
      captured_at,
      position,
      term_id,
      tweet_count,
      term:term_id (term_id, term_text)
    `)
    .eq('woeid', woeid)
    .in('captured_at', timesToFetch)
    .order('position');

  // Group snapshots by captured_at
  const snapshotsByTime = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots || []) {
    const existing = snapshotsByTime.get(snap.captured_at) || [];
    existing.push(snap);
    snapshotsByTime.set(snap.captured_at, existing);
  }

  // Build result for each offset
  for (const { offset, targetIso } of targetTimes) {
    if (!availableTimes.has(targetIso)) continue;

    const snapshots = snapshotsByTime.get(targetIso) || [];
    const trends: TrendItem[] = deduplicateTrends(
      snapshots.map((s: any) => ({
        position: s.position,
        termId: s.term_id,
        termText: s.term?.term_text || '',
        tweetCount: s.tweet_count,
      }))
    );

    result.set(offset, {
      place: place as Place,
      capturedAt: targetIso,
      trends,
    });
  }

  return result;
}

/**
 * Get trends at a specific offset (hours ago)
 */
export async function getTrendsAtOffset(woeid: number, hoursAgo: number): Promise<PlaceTrends | null> {
  // Get place info
  const { data: place, error: placeError } = await supabase
    .from('place')
    .select('*')
    .eq('woeid', woeid)
    .single();

  if (placeError) return null;

  // Get latest captured_at for this place
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestSnapshot) return null;

  // Calculate target time
  const latestTime = new Date(latestSnapshot.captured_at);
  const targetTime = new Date(latestTime.getTime() - hoursAgo * 60 * 60 * 1000);

  // Find the closest snapshot to target time
  const { data: targetSnapshot } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .lte('captured_at', targetTime.toISOString())
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!targetSnapshot) return null;

  const capturedAt = targetSnapshot.captured_at;

  // Get all trends for that timestamp
  const { data: snapshots, error: snapshotError } = await supabase
    .from('trend_snapshot')
    .select(`
      position,
      term_id,
      tweet_count,
      term:term_id (term_id, term_text)
    `)
    .eq('woeid', woeid)
    .eq('captured_at', capturedAt)
    .order('position');

  if (snapshotError) throw new Error(`Failed to fetch trends: ${snapshotError.message}`);

  const trends: TrendItem[] = deduplicateTrends(
    (snapshots || []).map((s: any) => ({
      position: s.position,
      termId: s.term_id,
      termText: s.term?.term_text || '',
      tweetCount: s.tweet_count,
    }))
  );

  return {
    place: place as Place,
    capturedAt,
    trends,
  };
}

/**
 * Get latest trends with calculated signals (rank change, duration, region count)
 *
 * Signal definitions:
 * - rankChange: Difference from EXACTLY 1 hour ago (null if data missing)
 * - regionCount: Number of regions trending at the SAME captured_at
 * - durationHours: CONSECUTIVE hours in top 50 (stops at first gap)
 */
export async function getLatestTrendsWithSignals(woeid: number): Promise<{
  place: Place;
  capturedAt: string;
  trends: TrendItemWithSignals[];
} | null> {
  // Get basic trends first
  const basicData = await getLatestTrends(woeid);
  if (!basicData) return null;

  const { place, capturedAt, trends } = basicData;
  const termIds = trends.map(t => t.termId);

  // Early return if no trends (avoid empty .in() query)
  if (termIds.length === 0) {
    return { place, capturedAt, trends: [] };
  }

  // === P0-1: rankChange with fixed time point ===
  // Resolve exactly 1 hour ago (returns null if missing)
  const oneHourAgoCapturedAt = await resolveCapturedAt(woeid, capturedAt, 1, 'exact_or_null');

  const previousPositions = new Map<number, number>();
  if (oneHourAgoCapturedAt) {
    // Fixed time point query - returns exactly 50 rows max
    const { data: previousSnapshots } = await supabase
      .from('trend_snapshot')
      .select('term_id, position')
      .eq('woeid', woeid)
      .eq('captured_at', oneHourAgoCapturedAt)
      .in('term_id', termIds);

    if (previousSnapshots) {
      for (const snap of previousSnapshots) {
        previousPositions.set(snap.term_id, snap.position);
      }
    }
  }

  // === P0-3: regionCount with fixed time point ===
  // Use the exact same captured_at across all regions (ingest already stores at hour boundaries)
  // Query to count distinct woeids per term at the same captured_at
  const { data: regionData } = await supabase
    .from('trend_snapshot')
    .select('term_id, woeid')
    .eq('captured_at', capturedAt)
    .in('term_id', termIds);

  const regionCounts = new Map<number, Set<number>>();
  if (regionData) {
    for (const snap of regionData) {
      if (!regionCounts.has(snap.term_id)) {
        regionCounts.set(snap.term_id, new Set());
      }
      regionCounts.get(snap.term_id)!.add(snap.woeid);
    }
  }

  // === P0-2: durationHours with consecutive hour detection ===
  // Get all snapshots for past 24 hours to check continuity
  const baseTime = new Date(capturedAt);
  const twentyFourHoursAgo = new Date(baseTime.getTime() - 24 * 60 * 60 * 1000);

  const { data: durationSnapshots } = await supabase
    .from('trend_snapshot')
    .select('term_id, captured_at')
    .eq('woeid', woeid)
    .in('term_id', termIds)
    .gte('captured_at', twentyFourHoursAgo.toISOString())
    .lte('captured_at', capturedAt)
    .order('captured_at', { ascending: false });

  // Calculate consecutive duration for each term
  const durationMap = new Map<number, number>();
  if (durationSnapshots) {
    // Group snapshots by term_id, normalize timestamps to epoch ms for comparison
    const termSnapshots = new Map<number, Set<number>>();
    for (const snap of durationSnapshots) {
      if (!termSnapshots.has(snap.term_id)) {
        termSnapshots.set(snap.term_id, new Set());
      }
      // Normalize to hour boundary and store as epoch ms (avoids Z vs +00:00 issues)
      const snapTime = new Date(snap.captured_at);
      snapTime.setUTCMinutes(0, 0, 0);
      termSnapshots.get(snap.term_id)!.add(snapTime.getTime());
    }

    // For each term, count consecutive hours from current time
    for (const [termId, timestampSet] of termSnapshots) {
      let consecutiveHours = 0;
      const currentHour = new Date(capturedAt);
      currentHour.setUTCMinutes(0, 0, 0);

      // Check each hour going backwards
      for (let h = 0; h < 24; h++) {
        const checkTime = currentHour.getTime() - h * 60 * 60 * 1000;

        if (timestampSet.has(checkTime)) {
          consecutiveHours++;
        } else {
          // Gap found - stop counting
          break;
        }
      }

      if (consecutiveHours > 0) {
        durationMap.set(termId, consecutiveHours);
      }
    }
  }

  // Enhance trends with signals
  const trendsWithSignals: TrendItemWithSignals[] = trends.map(trend => {
    const prevPos = previousPositions.get(trend.termId);
    // rankChange is null if 1-hour-ago data is missing (not undefined)
    const rankChange = oneHourAgoCapturedAt === null
      ? undefined  // Data missing - show as unknown
      : (prevPos !== undefined ? prevPos - trend.position : undefined);
    const regionCount = regionCounts.get(trend.termId)?.size;
    const durationHours = durationMap.get(trend.termId);

    return {
      ...trend,
      rankChange,
      durationHours,
      regionCount: regionCount && regionCount > 1 ? regionCount : undefined,
    };
  });

  return {
    place,
    capturedAt,
    trends: trendsWithSignals,
  };
}

/**
 * Get term by ID
 */
export async function getTermById(termId: number): Promise<Term | null> {
  const { data, error } = await supabase
    .from('term')
    .select('*')
    .eq('term_id', termId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch term: ${error.message}`);
  }
  return data as Term;
}

/**
 * Get term history (position changes over time)
 */
export async function getTermHistory(termId: number, hours: number = 24): Promise<TermHistory | null> {
  // Get term info
  const term = await getTermById(termId);
  if (!term) return null;

  // Calculate time range
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);

  // Get snapshots for this term
  const { data: snapshots, error } = await supabase
    .from('trend_snapshot')
    .select(`
      captured_at,
      position,
      woeid,
      place:woeid (name_ja, sort_order)
    `)
    .eq('term_id', termId)
    .gte('captured_at', since.toISOString())
    .order('captured_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch term history: ${error.message}`);

  const history = (snapshots || []).map((s: any) => ({
    capturedAt: s.captured_at,
    position: s.position,
    woeid: s.woeid,
    placeName: s.place?.name_ja || '',
    sortOrder: s.place?.sort_order ?? 100,
  }));

  return { term, history };
}
