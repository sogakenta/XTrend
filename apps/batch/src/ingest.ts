// XTrend Main Ingest Logic

import type { IngestResult, PlaceIngestResult } from './types.js';
import { fetchTrends } from './x-api.js';
import {
  getActivePlaces,
  createIngestRun,
  updateIngestRun,
  recordPlaceResult,
  upsertTerm,
  insertSnapshot,
} from './db.js';

/**
 * Round timestamp to UTC hour for idempotency.
 * Per plan.md:212, captured_at should be rounded to hour.
 */
function roundToHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded;
}

/**
 * Run the trend ingestion process for all active places.
 * Returns the overall result with per-place details.
 */
export async function runIngest(bearerToken: string): Promise<IngestResult> {
  const rawTime = new Date();
  const capturedAt = roundToHour(rawTime);
  console.log(`[Ingest] Starting at ${rawTime.toISOString()}, captured_at rounded to ${capturedAt.toISOString()}`);

  // Create ingest run record FIRST (before getting places)
  // This ensures we have a run record even if place fetch fails
  const runId = await createIngestRun(capturedAt);
  console.log(`[Ingest] Created run: ${runId}`);

  const placeResults: PlaceIngestResult[] = [];
  const errors: string[] = [];
  let fatalError = false;
  let unexpectedError = false;

  try {
    // Get active places from DB
    const places = await getActivePlaces();
    console.log(`[Ingest] Found ${places.length} active places`);

    if (places.length === 0) {
      errors.push('No active places configured');
      fatalError = true;
      return {
        runId,
        capturedAt,
        status: 'failed',
        placeResults: [],
        errorSummary: 'No active places configured',
      };
    }

    // Process each place
    for (const place of places) {
      console.log(`[Ingest] Processing ${place.name_ja} (WOEID: ${place.woeid})`);

      const result = await processPlace(
        runId,
        place.woeid,
        capturedAt,
        bearerToken
      );

      placeResults.push(result);

      // Record place-level result
      try {
        await recordPlaceResult({
          run_id: runId,
          woeid: place.woeid,
          status: result.success ? 'succeeded' : 'failed',
          error_code: result.errorCode || null,
          error_message: result.errorMessage || null,
          trend_count: result.trendCount ?? null,
        });
      } catch (recordErr) {
        // If we can't record the result, treat this place as failed
        const errMsg = recordErr instanceof Error ? recordErr.message : String(recordErr);
        console.error(`[Ingest] Failed to record place result: ${errMsg}`);
        // Update the result to reflect failure
        result.success = false;
        result.errorCode = result.errorCode || 'RECORD_FAILED';
        result.errorMessage = `${result.errorMessage || ''}; Record failed: ${errMsg}`;
        errors.push(`${place.name_ja}: Record failed: ${errMsg}`);
      }

      if (!result.success) {
        errors.push(`${place.name_ja}: ${result.errorMessage}`);

        // Check for fatal error (401/403) - stop all places
        if (result.errorCode === '401' || result.errorCode === '403') {
          console.error(`[Ingest] Fatal error detected: ${result.errorCode}`);
          fatalError = true;
          break;
        }
      }
    }
  } catch (err) {
    // Catch any unexpected error
    unexpectedError = true;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Ingest] Unexpected error: ${errMsg}`);
    errors.push(`Unexpected error: ${errMsg}`);
  } finally {
    // Determine overall status (guaranteed to run even on exception)
    const successCount = placeResults.filter(r => r.success).length;
    const totalAttempted = placeResults.length;
    let status: IngestResult['status'];
    let errorSummary: string | undefined;

    if (unexpectedError || fatalError || successCount === 0) {
      status = 'failed';
      errorSummary = errors.join('; ');
    } else if (totalAttempted > 0 && successCount === totalAttempted) {
      status = 'succeeded';
    } else if (successCount > 0) {
      status = 'partial';
      errorSummary = errors.join('; ');
    } else {
      // No places attempted (edge case)
      status = 'failed';
      errorSummary = errors.join('; ') || 'No places processed';
    }

    // Update ingest run (always executed)
    try {
      await updateIngestRun(runId, status, errorSummary);
      console.log(`[Ingest] Completed with status: ${status}`);
    } catch (updateErr) {
      console.error(`[Ingest] Failed to update run status: ${updateErr}`);
    }
  }

  // Calculate final return value
  const successCount = placeResults.filter(r => r.success).length;
  let status: IngestResult['status'];
  let errorSummary: string | undefined;

  if (unexpectedError || fatalError || successCount === 0) {
    status = 'failed';
    errorSummary = errors.join('; ');
  } else if (successCount === placeResults.length && placeResults.length > 0) {
    status = 'succeeded';
  } else if (successCount > 0) {
    status = 'partial';
    errorSummary = errors.join('; ');
  } else {
    status = 'failed';
    errorSummary = errors.join('; ') || 'No places processed';
  }

  return {
    runId,
    capturedAt,
    status,
    placeResults,
    errorSummary,
  };
}

/**
 * Process trends for a single place.
 * Returns success only if ALL trends are written successfully.
 */
async function processPlace(
  runId: string,
  woeid: number,
  capturedAt: Date,
  bearerToken: string
): Promise<PlaceIngestResult> {
  const fetchResult = await fetchTrends(woeid, bearerToken);

  if (!fetchResult.success || !fetchResult.data) {
    return {
      woeid,
      success: false,
      errorCode: fetchResult.errorCode,
      errorMessage: fetchResult.errorMessage,
    };
  }

  const rawTrends = fetchResult.data.data;
  if (!rawTrends || !Array.isArray(rawTrends)) {
    return {
      woeid,
      success: false,
      errorCode: 'INVALID_RESPONSE',
      errorMessage: 'Response data is not an array',
    };
  }

  // Deduplicate trends by trend_name (keep first occurrence only)
  // X API sometimes returns the same trend at multiple positions
  const seenNames = new Set<string>();
  const trends = rawTrends.filter(trend => {
    const name = trend.trend_name?.toLowerCase();
    if (!name || seenNames.has(name)) {
      return false;
    }
    seenNames.add(name);
    return true;
  });

  const duplicateCount = rawTrends.length - trends.length;
  if (duplicateCount > 0) {
    console.log(`[Ingest] Removed ${duplicateCount} duplicate trends for WOEID ${woeid}`);
  }

  console.log(`[Ingest] Processing ${trends.length} unique trends for WOEID ${woeid}`);

  // Insert trends (limit to top 50)
  const maxTrends = Math.min(trends.length, 50);
  let writtenCount = 0;
  let writeError: string | null = null;

  for (let i = 0; i < maxTrends; i++) {
    const trend = trends[i];
    const position = i + 1;

    try {
      // Upsert term (using trend_name per X API v2)
      const termId = await upsertTerm(trend.trend_name);

      // Insert snapshot
      await insertSnapshot({
        run_id: runId,
        captured_at: capturedAt.toISOString(),
        woeid,
        position,
        term_id: termId,
        tweet_count: trend.tweet_count,
        raw_name: trend.trend_name,
      });

      writtenCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Ingest] Failed to insert trend ${position}: ${errMsg}`);
      writeError = errMsg;
      // Continue with other trends, but track failure
    }
  }

  // Only success if ALL trends were written
  if (writtenCount === maxTrends) {
    return {
      woeid,
      success: true,
      trendCount: writtenCount,
    };
  } else {
    return {
      woeid,
      success: false,
      errorCode: 'PARTIAL_WRITE',
      errorMessage: `Only ${writtenCount}/${maxTrends} trends written. Last error: ${writeError}`,
      trendCount: writtenCount,
    };
  }
}
