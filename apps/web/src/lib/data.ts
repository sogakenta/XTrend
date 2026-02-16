import 'server-only';
import { supabase } from './supabase';
import type { Place, PlaceTrends, TrendItem, TrendItemWithSignals, Term, TermHistory } from './types';

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

  const trends: TrendItem[] = (snapshots || []).map((s: any) => ({
    position: s.position,
    termId: s.term_id,
    termText: s.term?.term_text || '',
    tweetCount: s.tweet_count,
  }));

  return {
    place: place as Place,
    capturedAt,
    trends,
  };
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

  const trends: TrendItem[] = (snapshots || []).map((s: any) => ({
    position: s.position,
    termId: s.term_id,
    termText: s.term?.term_text || '',
    tweetCount: s.tweet_count,
  }));

  return {
    place: place as Place,
    capturedAt,
    trends,
  };
}

/**
 * Get latest trends with calculated signals (rank change, duration, region count)
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

  // Calculate time 1 hour ago
  const currentTime = new Date(capturedAt);
  const oneHourAgo = new Date(currentTime.getTime() - 60 * 60 * 1000);

  // Get positions from 1 hour ago for rank change calculation
  const { data: previousSnapshots } = await supabase
    .from('trend_snapshot')
    .select('term_id, position, captured_at')
    .eq('woeid', woeid)
    .in('term_id', termIds)
    .lte('captured_at', oneHourAgo.toISOString())
    .order('captured_at', { ascending: false });

  // Create map of term_id -> previous position (most recent before 1 hour ago)
  const previousPositions = new Map<number, number>();
  if (previousSnapshots) {
    for (const snap of previousSnapshots) {
      if (!previousPositions.has(snap.term_id)) {
        previousPositions.set(snap.term_id, snap.position);
      }
    }
  }

  // Get region count for each term at current time (same captured_at across all woeids)
  const { data: regionSnapshots } = await supabase
    .from('trend_snapshot')
    .select('term_id, woeid')
    .in('term_id', termIds)
    .gte('captured_at', new Date(currentTime.getTime() - 30 * 60 * 1000).toISOString()) // Within 30 min
    .lte('captured_at', new Date(currentTime.getTime() + 30 * 60 * 1000).toISOString());

  // Count distinct regions per term
  const regionCounts = new Map<number, Set<number>>();
  if (regionSnapshots) {
    for (const snap of regionSnapshots) {
      if (!regionCounts.has(snap.term_id)) {
        regionCounts.set(snap.term_id, new Set());
      }
      regionCounts.get(snap.term_id)!.add(snap.woeid);
    }
  }

  // Calculate duration (how many consecutive hours in top 50)
  const twentyFourHoursAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
  const { data: durationSnapshots } = await supabase
    .from('trend_snapshot')
    .select('term_id, captured_at')
    .eq('woeid', woeid)
    .in('term_id', termIds)
    .gte('captured_at', twentyFourHoursAgo.toISOString())
    .order('captured_at', { ascending: false });

  // Calculate duration for each term
  const durationMap = new Map<number, number>();
  if (durationSnapshots) {
    const termSnapshots = new Map<number, string[]>();
    for (const snap of durationSnapshots) {
      if (!termSnapshots.has(snap.term_id)) {
        termSnapshots.set(snap.term_id, []);
      }
      termSnapshots.get(snap.term_id)!.push(snap.captured_at);
    }

    for (const [termId, timestamps] of termSnapshots) {
      // Count consecutive hours from now
      const hours = timestamps.length; // Each snapshot = 1 hour
      durationMap.set(termId, Math.min(hours, 24));
    }
  }

  // Enhance trends with signals
  const trendsWithSignals: TrendItemWithSignals[] = trends.map(trend => {
    const prevPos = previousPositions.get(trend.termId);
    const rankChange = prevPos !== undefined ? prevPos - trend.position : undefined;
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
