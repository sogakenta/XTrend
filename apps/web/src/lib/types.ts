// Database types for XTrend

export interface Place {
  woeid: number;
  slug: string;
  country_code: string;
  name_ja: string;
  name_en: string | null;
  timezone: string;
  is_active: boolean;
  sort_order: number;
}

export interface Term {
  term_id: number;
  term_text: string;
  term_norm: string;
}

export interface TrendSnapshot {
  snapshot_id: number;
  run_id: string;
  captured_at: string;
  woeid: number;
  position: number;
  term_id: number;
  tweet_count: number | null;
  raw_name: string;
}

// Combined types for UI
export interface TrendItem {
  position: number;
  termId: number;
  termText: string;
  tweetCount: number | null;
}

// Extended trend item with momentum signals (for enhanced UI)
export interface TrendItemWithSignals extends TrendItem {
  // Momentum signals
  rankChange?: number;      // +12 means went up 12 positions, -5 means dropped
  durationHours?: number;   // How long it's been trending
  regionCount?: number;     // Number of regions where it's trending

  // Description (will be from Wikidata/LLM later, mock for now)
  description?: string;
  descriptionSource?: 'wikipedia' | 'wikidata' | 'mock';
}

export interface PlaceTrends {
  place: Place;
  capturedAt: string;
  trends: TrendItem[];
}

export interface TermDescription {
  term_id: number;
  description: string;
  source: string;
  updated_at: string;
}

export interface TermHistory {
  term: Term;
  history: {
    capturedAt: string;
    position: number | null; // null = 圏外 (out of ranking)
    woeid: number;
    placeName: string;
    sortOrder: number;
  }[];
}
