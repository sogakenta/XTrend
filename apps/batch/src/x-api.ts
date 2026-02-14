// X API v2 Client for Trends (per plan.md A.1-A.6)

import type { XTrendResponse } from './types.js';

const X_API_BASE = 'https://api.twitter.com/2';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const FETCH_TIMEOUT_MS = 30000; // 30 seconds

export interface FetchTrendsResult {
  success: boolean;
  data?: XTrendResponse;
  errorCode?: string;
  errorMessage?: string;
  /** True if error is fatal and should stop all places */
  fatal?: boolean;
}

/**
 * Fetch trends for a specific place (WOEID) using X API v2.
 * Implements exponential backoff with jitter for 429/5xx errors.
 *
 * Endpoint: GET /2/trends/by/woeid/{woeid}?max_trends=50
 */
export async function fetchTrends(
  woeid: number,
  bearerToken: string
): Promise<FetchTrendsResult> {
  const url = `${X_API_BASE}/trends/by/woeid/${woeid}?max_trends=50`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter
      const baseBackoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      const backoff = Math.floor(baseBackoff + jitter);
      console.log(`Retry ${attempt}/${MAX_RETRIES} for WOEID ${woeid}, waiting ${backoff}ms`);
      await sleep(backoff);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json() as XTrendResponse;
        return {
          success: true,
          data,
        };
      }

      // Handle specific error codes
      const errorBody = await response.text();

      // Fatal errors - stop all places
      if (response.status === 401) {
        return {
          success: false,
          errorCode: '401',
          errorMessage: 'Unauthorized - check bearer token',
          fatal: true,
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          errorCode: '403',
          errorMessage: 'Forbidden - API access not permitted',
          fatal: true,
        };
      }

      // Retryable errors
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${errorBody}`);
        continue;
      }

      // Non-retryable error (4xx except 401/403/429)
      return {
        success: false,
        errorCode: String(response.status),
        errorMessage: errorBody,
      };

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error('Request timeout');
      } else {
        // Network error - retryable
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    } finally {
      // Always clear timeout to prevent resource leak
      clearTimeout(timeoutId);
    }
  }

  // All retries exhausted
  return {
    success: false,
    errorCode: 'RETRY_EXHAUSTED',
    errorMessage: lastError?.message || 'Max retries exceeded',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
