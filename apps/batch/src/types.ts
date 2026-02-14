// XTrend Batch Types

/** X API v2 Trends Response (per plan.md A.5) */
export interface XTrendResponse {
  data: XTrend[];
}

export interface XTrend {
  trend_name: string;
  tweet_count: number | null;
}

/** Place master record */
export interface Place {
  woeid: number;
  slug: string;
  country_code: string;
  name_ja: string;
  name_en: string | null;
  timezone: string;
  is_active: boolean;
}

/** Ingest run record */
export interface IngestRun {
  run_id: string;
  captured_at: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'partial';
  error_summary: string | null;
}

/** Ingest run place record */
export interface IngestRunPlace {
  run_id: string;
  woeid: number;
  status: 'succeeded' | 'failed';
  error_code: string | null;
  error_message: string | null;
  trend_count: number | null;
}

/** Term record */
export interface Term {
  term_id: number;
  term_text: string;
  term_norm: string;
}

/** Trend snapshot record */
export interface TrendSnapshot {
  run_id: string;
  captured_at: string;
  woeid: number;
  position: number;
  term_id: number;
  tweet_count: number | null;
  raw_name: string;
}

/** Ingest result for a single place */
export interface PlaceIngestResult {
  woeid: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  trendCount?: number;
}

/** Overall ingest result */
export interface IngestResult {
  runId: string;
  capturedAt: Date;
  status: 'succeeded' | 'failed' | 'partial';
  placeResults: PlaceIngestResult[];
  errorSummary?: string;
}
