// Supabase Database Client

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Place, IngestRun, IngestRunPlace, TrendSnapshot } from './types.js';
import { normalizeTerm } from './normalize.js';

let supabase: SupabaseClient | null = null;

export function initDb(url: string, serviceRoleKey: string): void {
  supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return supabase;
}

/** Get active places */
export async function getActivePlaces(): Promise<Place[]> {
  const { data, error } = await getClient()
    .from('place')
    .select('*')
    .eq('is_active', true);

  if (error) throw new Error(`Failed to fetch places: ${error.message}`);
  return data as Place[];
}

/** Create a new ingest run */
export async function createIngestRun(capturedAt: Date): Promise<string> {
  const { data, error } = await getClient()
    .from('ingest_run')
    .insert({
      captured_at: capturedAt.toISOString(),
      status: 'running',
    })
    .select('run_id')
    .single();

  if (error) throw new Error(`Failed to create ingest run: ${error.message}`);
  return data.run_id;
}

/** Update ingest run status */
export async function updateIngestRun(
  runId: string,
  status: IngestRun['status'],
  errorSummary?: string
): Promise<void> {
  const { error } = await getClient()
    .from('ingest_run')
    .update({
      finished_at: new Date().toISOString(),
      status,
      error_summary: errorSummary || null,
    })
    .eq('run_id', runId);

  if (error) throw new Error(`Failed to update ingest run: ${error.message}`);
}

/** Record place-level result */
export async function recordPlaceResult(result: IngestRunPlace): Promise<void> {
  const { error } = await getClient()
    .from('ingest_run_place')
    .insert({
      run_id: result.run_id,
      woeid: result.woeid,
      status: result.status,
      error_code: result.error_code,
      error_message: result.error_message,
      trend_count: result.trend_count,
    });

  if (error) throw new Error(`Failed to record place result: ${error.message}`);
}

/** Get or create term, returns term_id */
export async function upsertTerm(termText: string): Promise<number> {
  const termNorm = normalizeTerm(termText);

  // Try to find existing term
  const { data: existing } = await getClient()
    .from('term')
    .select('term_id')
    .eq('term_norm', termNorm)
    .single();

  if (existing) {
    return existing.term_id;
  }

  // Insert new term
  const { data, error } = await getClient()
    .from('term')
    .insert({
      term_text: termText,
      term_norm: termNorm,
    })
    .select('term_id')
    .single();

  if (error) {
    // Handle race condition - another process may have inserted
    if (error.code === '23505') { // unique_violation
      const { data: retry } = await getClient()
        .from('term')
        .select('term_id')
        .eq('term_norm', termNorm)
        .single();
      if (retry) return retry.term_id;
    }
    throw new Error(`Failed to upsert term: ${error.message}`);
  }

  return data.term_id;
}

/** Insert trend snapshot (UPSERT by captured_at, woeid, position) */
export async function insertSnapshot(snapshot: TrendSnapshot): Promise<void> {
  const { error } = await getClient()
    .from('trend_snapshot')
    .upsert({
      run_id: snapshot.run_id,
      captured_at: snapshot.captured_at,
      woeid: snapshot.woeid,
      position: snapshot.position,
      term_id: snapshot.term_id,
      tweet_count: snapshot.tweet_count,
      raw_name: snapshot.raw_name,
    }, {
      onConflict: 'captured_at,woeid,position',
    });

  if (error) throw new Error(`Failed to insert snapshot: ${error.message}`);
}
