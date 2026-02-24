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
 * Fills missing hours with position: null (圏外)
 */
export async function getTermHistory(termId: number, hours: number = 24): Promise<TermHistory | null> {
  // Get term info
  const term = await getTermById(termId);
  if (!term) return null;

  // Get latest captured_at from database (not current time)
  // This ensures we show data even when ingestion is delayed
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestSnapshot) return null;

  // Calculate time range based on latest snapshot, not current time
  const latestTime = new Date(latestSnapshot.captured_at);
  const since = new Date(latestTime.getTime() - hours * 60 * 60 * 1000);

  // Get snapshots for this term and available times in parallel
  const [snapshotsResult, availableTimesResult] = await Promise.all([
    supabase
      .from('trend_snapshot')
      .select(`
        captured_at,
        position,
        woeid,
        place:woeid (name_ja, sort_order)
      `)
      .eq('term_id', termId)
      .gte('captured_at', since.toISOString())
      .order('captured_at', { ascending: true }),
    // Get distinct captured_at times in the range (using position=1 for efficiency)
    supabase
      .from('trend_snapshot')
      .select('captured_at, woeid, place:woeid (name_ja, sort_order)')
      .eq('position', 1)
      .gte('captured_at', since.toISOString())
      .order('captured_at', { ascending: true }),
  ]);

  if (snapshotsResult.error) throw new Error(`Failed to fetch term history: ${snapshotsResult.error.message}`);

  const snapshots = snapshotsResult.data || [];
  const availableTimes = availableTimesResult.data || [];

  // Build a map of available times per woeid
  const timesByWoeid = new Map<number, Set<string>>();
  const placeInfoByWoeid = new Map<number, { name_ja: string; sort_order: number }>();

  for (const at of availableTimes) {
    if (!timesByWoeid.has(at.woeid)) {
      timesByWoeid.set(at.woeid, new Set());
      placeInfoByWoeid.set(at.woeid, {
        name_ja: (at.place as any)?.name_ja || '',
        sort_order: (at.place as any)?.sort_order ?? 100,
      });
    }
    timesByWoeid.get(at.woeid)!.add(at.captured_at);
  }

  // Build a map of actual positions: woeid -> capturedAt -> position
  const positionMap = new Map<number, Map<string, number>>();
  for (const s of snapshots) {
    if (!positionMap.has(s.woeid)) {
      positionMap.set(s.woeid, new Map());
      // Also capture place info from actual data
      placeInfoByWoeid.set(s.woeid, {
        name_ja: (s.place as any)?.name_ja || '',
        sort_order: (s.place as any)?.sort_order ?? 100,
      });
    }
    positionMap.get(s.woeid)!.set(s.captured_at, s.position);
  }

  // Get woeids that have actual data for this term
  const woeidsWithData = new Set(snapshots.map((s: any) => s.woeid));

  // Build complete history with gaps filled as null (圏外)
  const history: Array<{
    capturedAt: string;
    position: number | null;
    woeid: number;
    placeName: string;
    sortOrder: number;
  }> = [];

  for (const woeid of woeidsWithData) {
    const times = timesByWoeid.get(woeid);
    const positions = positionMap.get(woeid);
    const placeInfo = placeInfoByWoeid.get(woeid);

    if (!times || !positions || !placeInfo) continue;

    // Sort times chronologically
    const sortedTimes = Array.from(times).sort();

    for (const capturedAt of sortedTimes) {
      const position = positions.get(capturedAt) ?? null; // null = 圏外
      history.push({
        capturedAt,
        position,
        woeid,
        placeName: placeInfo.name_ja,
        sortOrder: placeInfo.sort_order,
      });
    }
  }

  // Sort by capturedAt
  history.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  return { term, history };
}

/**
 * Optimized: Get trends for all offsets with signals in minimal queries
 *
 * Query optimization:
 * - Before: 37 queries (8 functions × 4-8 queries each)
 * - After: ~12 queries (2 base + 8 parallel nearest time + 1 batch snapshots + 3 parallel signals)
 * - All nearest-time queries run in parallel, so effective round trips = 4
 *
 * @param woeid - Place WOEID
 * @param offsets - Array of offset hours [0, 1, 3, 6, 12, 24, 48, 72]
 * @returns Map of offset to trends data with signals for offset=0
 */
export async function getTrendsForAllOffsets(
  woeid: number,
  offsets: number[]
): Promise<{
  place: Place;
  results: Map<number, { capturedAt: string; trends: TrendItemWithSignals[] }>;
} | null> {
  if (offsets.length === 0) return null;

  // Query 1 & 2 in parallel: Get place info and latest captured_at
  const [placeResult, latestResult] = await Promise.all([
    supabase.from('place').select('*').eq('woeid', woeid).single(),
    supabase
      .from('trend_snapshot')
      .select('captured_at')
      .eq('woeid', woeid)
      .order('captured_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (placeResult.error || !placeResult.data) return null;
  if (!latestResult.data) return null;

  const place = placeResult.data;
  const latestCapturedAt = latestResult.data.captured_at;
  const latestTime = new Date(latestCapturedAt);

  // Query 3: Get distinct captured_at in the past 72+ hours
  // Use position=1 filter to get only 1 row per captured_at (effectively distinct)
  const maxOffset = Math.max(...offsets);
  const oldestTargetTime = new Date(latestTime.getTime() - (maxOffset + 1) * 60 * 60 * 1000);

  const { data: availableTimes } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .eq('position', 1)
    .gte('captured_at', oldestTargetTime.toISOString())
    .order('captured_at', { ascending: false });

  // Build sorted list of available times (descending) - now only ~73 rows max
  const sortedTimes = (availableTimes || []).map(t => t.captured_at);

  // Find nearest captured_at for each offset in memory
  const offsetToActualTime = new Map<number, string>();

  for (const offset of offsets) {
    if (offset === 0) {
      offsetToActualTime.set(offset, latestCapturedAt);
      continue;
    }

    const targetTime = new Date(latestTime.getTime() - offset * 60 * 60 * 1000);
    const targetIso = targetTime.toISOString();

    // Find the first time that is <= targetTime (list is descending)
    const nearestTime = sortedTimes.find(t => t <= targetIso);
    if (nearestTime) {
      offsetToActualTime.set(offset, nearestTime);
    }
  }

  // Get unique actual times to fetch
  const timesToFetch = [...new Set(offsetToActualTime.values())];
  if (timesToFetch.length === 0) return null;

  // Query 4: Get all snapshots for all actual times in one query
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

  if (!allSnapshots || allSnapshots.length === 0) return null;

  // Group snapshots by captured_at
  const snapshotsByTime = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots) {
    const existing = snapshotsByTime.get(snap.captured_at) || [];
    existing.push(snap);
    snapshotsByTime.set(snap.captured_at, existing);
  }

  // Get term IDs for offset=0 (for signal calculation)
  const currentCapturedAt = offsetToActualTime.get(0) || latestCapturedAt;
  const currentSnapshots = snapshotsByTime.get(currentCapturedAt) || [];
  const termIds = currentSnapshots.map((s: any) => s.term_id);

  // Queries 4-6 (parallel): Get signal data for offset=0
  const oneHourAgo = new Date(latestTime.getTime() - 60 * 60 * 1000);
  oneHourAgo.setUTCMinutes(0, 0, 0);
  const oneHourAgoIso = oneHourAgo.toISOString();
  const twentyFourHoursAgo = new Date(latestTime.getTime() - 24 * 60 * 60 * 1000);

  const [previousResult, regionResult, durationResult] = await Promise.all([
    // Previous positions (1 hour ago)
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, position')
          .eq('woeid', woeid)
          .eq('captured_at', oneHourAgoIso)
          .in('term_id', termIds)
      : Promise.resolve({ data: null }),
    // Region count
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, woeid')
          .eq('captured_at', latestCapturedAt)
          .in('term_id', termIds)
      : Promise.resolve({ data: null }),
    // Duration (24 hours)
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, captured_at')
          .eq('woeid', woeid)
          .in('term_id', termIds)
          .gte('captured_at', twentyFourHoursAgo.toISOString())
          .lte('captured_at', latestCapturedAt)
          .order('captured_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  // Build signal maps
  const previousPositions = new Map<number, number>();
  if (previousResult.data) {
    for (const snap of previousResult.data) {
      previousPositions.set(snap.term_id, snap.position);
    }
  }

  const regionCounts = new Map<number, Set<number>>();
  if (regionResult.data) {
    for (const snap of regionResult.data) {
      if (!regionCounts.has(snap.term_id)) {
        regionCounts.set(snap.term_id, new Set());
      }
      regionCounts.get(snap.term_id)!.add(snap.woeid);
    }
  }

  const durationMap = new Map<number, number>();
  if (durationResult.data) {
    const termSnapshots = new Map<number, Set<number>>();
    for (const snap of durationResult.data) {
      if (!termSnapshots.has(snap.term_id)) {
        termSnapshots.set(snap.term_id, new Set());
      }
      const snapTime = new Date(snap.captured_at);
      snapTime.setUTCMinutes(0, 0, 0);
      termSnapshots.get(snap.term_id)!.add(snapTime.getTime());
    }

    const currentHour = new Date(latestCapturedAt);
    currentHour.setUTCMinutes(0, 0, 0);

    for (const [termId, timestampSet] of termSnapshots) {
      let consecutiveHours = 0;
      for (let h = 0; h < 24; h++) {
        const checkTime = currentHour.getTime() - h * 60 * 60 * 1000;
        if (timestampSet.has(checkTime)) {
          consecutiveHours++;
        } else {
          break;
        }
      }
      if (consecutiveHours > 0) {
        durationMap.set(termId, consecutiveHours);
      }
    }
  }

  // Check if 1-hour-ago data exists
  const hasOneHourAgoData = snapshotsByTime.has(oneHourAgoIso) || (previousResult.data?.length ?? 0) > 0;

  // Build results for each offset
  const results = new Map<number, { capturedAt: string; trends: TrendItemWithSignals[] }>();

  for (const offset of offsets) {
    const actualTime = offsetToActualTime.get(offset);
    if (!actualTime) continue;

    const snapshots = snapshotsByTime.get(actualTime);
    if (!snapshots || snapshots.length === 0) continue;

    const trends: TrendItemWithSignals[] = deduplicateTrends(
      snapshots.map((s: any) => {
        const base: TrendItemWithSignals = {
          position: s.position,
          termId: s.term_id,
          termText: s.term?.term_text || '',
          tweetCount: s.tweet_count,
        };

        // Add signals only for offset=0
        if (offset === 0) {
          const prevPos = previousPositions.get(s.term_id);
          base.rankChange = hasOneHourAgoData
            ? (prevPos !== undefined ? prevPos - s.position : undefined)
            : undefined;
          base.durationHours = durationMap.get(s.term_id);
          const regionCount = regionCounts.get(s.term_id)?.size;
          base.regionCount = regionCount && regionCount > 1 ? regionCount : undefined;
        }

        return base;
      })
    );

    results.set(offset, { capturedAt: actualTime, trends });
  }

  return { place: place as Place, results };
}

/**
 * Get trends for all offsets by slug (avoids duplicate place query)
 */
export async function getTrendsForAllOffsetsBySlug(
  slug: string,
  offsets: number[]
): Promise<{
  place: Place;
  results: Map<number, { capturedAt: string; trends: TrendItemWithSignals[] }>;
} | null> {
  // Get place by slug
  const { data: place, error } = await supabase
    .from('place')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !place) return null;

  // Reuse the main function but skip the place query
  return getTrendsForAllOffsetsInternal(place as Place, offsets);
}

/**
 * Internal: Get trends for all offsets (place already resolved)
 */
async function getTrendsForAllOffsetsInternal(
  place: Place,
  offsets: number[]
): Promise<{
  place: Place;
  results: Map<number, { capturedAt: string; trends: TrendItemWithSignals[] }>;
} | null> {
  const woeid = place.woeid;

  if (offsets.length === 0) return null;

  // Query 1: Get latest captured_at
  const { data: latestResult } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestResult) return null;

  const latestCapturedAt = latestResult.captured_at;
  const latestTime = new Date(latestCapturedAt);

  // Query 2: Get distinct captured_at in the past 72+ hours
  // Use position=1 filter to get only 1 row per captured_at (effectively distinct)
  const maxOffset = Math.max(...offsets);
  const oldestTargetTime = new Date(latestTime.getTime() - (maxOffset + 1) * 60 * 60 * 1000);

  const { data: availableTimes } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .eq('position', 1)
    .gte('captured_at', oldestTargetTime.toISOString())
    .order('captured_at', { ascending: false });

  // Build sorted list of available times (descending) - now only ~73 rows max
  const sortedTimes = (availableTimes || []).map(t => t.captured_at);

  // Find nearest captured_at for each offset in memory
  const offsetToActualTime = new Map<number, string>();

  for (const offset of offsets) {
    if (offset === 0) {
      offsetToActualTime.set(offset, latestCapturedAt);
      continue;
    }

    const targetTime = new Date(latestTime.getTime() - offset * 60 * 60 * 1000);
    const targetIso = targetTime.toISOString();

    // Find the first time that is <= targetTime (list is descending)
    const nearestTime = sortedTimes.find(t => t <= targetIso);
    if (nearestTime) {
      offsetToActualTime.set(offset, nearestTime);
    }
  }

  // Get unique actual times to fetch
  const timesToFetch = [...new Set(offsetToActualTime.values())];
  if (timesToFetch.length === 0) return null;

  // Query 3: Get all snapshots for all actual times in one query
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

  if (!allSnapshots || allSnapshots.length === 0) return null;

  // Group snapshots by captured_at
  const snapshotsByTime = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots) {
    const existing = snapshotsByTime.get(snap.captured_at) || [];
    existing.push(snap);
    snapshotsByTime.set(snap.captured_at, existing);
  }

  // Get term IDs for offset=0 (for signal calculation)
  const currentCapturedAt = offsetToActualTime.get(0) || latestCapturedAt;
  const currentSnapshots = snapshotsByTime.get(currentCapturedAt) || [];
  const termIds = currentSnapshots.map((s: any) => s.term_id);

  // Queries 4-6 (parallel): Get signal data for offset=0
  const oneHourAgo = new Date(latestTime.getTime() - 60 * 60 * 1000);
  oneHourAgo.setUTCMinutes(0, 0, 0);
  const oneHourAgoIso = oneHourAgo.toISOString();
  const twentyFourHoursAgo = new Date(latestTime.getTime() - 24 * 60 * 60 * 1000);

  const [previousResult, regionResult, durationResult] = await Promise.all([
    // Previous positions (1 hour ago)
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, position')
          .eq('woeid', woeid)
          .eq('captured_at', oneHourAgoIso)
          .in('term_id', termIds)
      : Promise.resolve({ data: null }),
    // Region count
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, woeid')
          .eq('captured_at', latestCapturedAt)
          .in('term_id', termIds)
      : Promise.resolve({ data: null }),
    // Duration (24 hours)
    termIds.length > 0
      ? supabase
          .from('trend_snapshot')
          .select('term_id, captured_at')
          .eq('woeid', woeid)
          .in('term_id', termIds)
          .gte('captured_at', twentyFourHoursAgo.toISOString())
          .lte('captured_at', latestCapturedAt)
          .order('captured_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  // Build signal maps
  const previousPositions = new Map<number, number>();
  if (previousResult.data) {
    for (const snap of previousResult.data) {
      previousPositions.set(snap.term_id, snap.position);
    }
  }

  const regionCounts = new Map<number, Set<number>>();
  if (regionResult.data) {
    for (const snap of regionResult.data) {
      if (!regionCounts.has(snap.term_id)) {
        regionCounts.set(snap.term_id, new Set());
      }
      regionCounts.get(snap.term_id)!.add(snap.woeid);
    }
  }

  const durationMap = new Map<number, number>();
  if (durationResult.data) {
    const termSnapshots = new Map<number, Set<number>>();
    for (const snap of durationResult.data) {
      if (!termSnapshots.has(snap.term_id)) {
        termSnapshots.set(snap.term_id, new Set());
      }
      const snapTime = new Date(snap.captured_at);
      snapTime.setUTCMinutes(0, 0, 0);
      termSnapshots.get(snap.term_id)!.add(snapTime.getTime());
    }

    const currentHour = new Date(latestCapturedAt);
    currentHour.setUTCMinutes(0, 0, 0);

    for (const [termId, timestampSet] of termSnapshots) {
      let consecutiveHours = 0;
      for (let h = 0; h < 24; h++) {
        const checkTime = currentHour.getTime() - h * 60 * 60 * 1000;
        if (timestampSet.has(checkTime)) {
          consecutiveHours++;
        } else {
          break;
        }
      }
      if (consecutiveHours > 0) {
        durationMap.set(termId, consecutiveHours);
      }
    }
  }

  // Check if 1-hour-ago data exists
  const hasOneHourAgoData = snapshotsByTime.has(oneHourAgoIso) || (previousResult.data?.length ?? 0) > 0;

  // Build results for each offset
  const results = new Map<number, { capturedAt: string; trends: TrendItemWithSignals[] }>();

  for (const offset of offsets) {
    const actualTime = offsetToActualTime.get(offset);
    if (!actualTime) continue;

    const snapshots = snapshotsByTime.get(actualTime);
    if (!snapshots || snapshots.length === 0) continue;

    const trends: TrendItemWithSignals[] = deduplicateTrends(
      snapshots.map((s: any) => {
        const base: TrendItemWithSignals = {
          position: s.position,
          termId: s.term_id,
          termText: s.term?.term_text || '',
          tweetCount: s.tweet_count,
        };

        // Add signals only for offset=0
        if (offset === 0) {
          const prevPos = previousPositions.get(s.term_id);
          base.rankChange = hasOneHourAgoData
            ? (prevPos !== undefined ? prevPos - s.position : undefined)
            : undefined;
          base.durationHours = durationMap.get(s.term_id);
          const regionCount = regionCounts.get(s.term_id)?.size;
          base.regionCount = regionCount && regionCount > 1 ? regionCount : undefined;
        }

        return base;
      })
    );

    results.set(offset, { capturedAt: actualTime, trends });
  }

  return { place, results };
}

// ============================================================
// Sitemap data functions
// ============================================================

/**
 * Get maximum term_id for sitemap generation
 * Used to generate URLs from 1 to maxTermId without fetching all records
 */
export async function getMaxTermId(): Promise<number> {
  const { data, error } = await supabase
    .from('term')
    .select('term_id')
    .order('term_id', { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(`Failed to fetch max term_id: ${error.message}`);
  return data?.term_id ?? 0;
}


/**
 * Get all place slugs for sitemap
 */
export async function getPlaceSlugsForSitemap(): Promise<Array<{ slug: string }>> {
  const { data, error } = await supabase
    .from('place')
    .select('slug')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw new Error(`Failed to fetch place slugs: ${error.message}`);
  return data || [];
}
