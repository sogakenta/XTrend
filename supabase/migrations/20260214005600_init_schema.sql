-- XTrend MVP Schema
-- Created: 2026-02-14

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 地域マスタ
CREATE TABLE place (
  woeid BIGINT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  country_code CHAR(2) NOT NULL DEFAULT 'JP',
  name_ja TEXT NOT NULL,
  name_en TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- トレンド語マスタ
CREATE TABLE term (
  term_id BIGSERIAL PRIMARY KEY,
  term_text TEXT NOT NULL,
  term_norm TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 収集実行記録（全体）
CREATE TABLE ingest_run (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  error_summary TEXT
);

-- 収集実行記録（地域別）- 部分失敗の検証・再実行判断用
CREATE TABLE ingest_run_place (
  run_id UUID NOT NULL REFERENCES ingest_run(run_id) ON DELETE CASCADE,
  woeid BIGINT NOT NULL REFERENCES place(woeid) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error_code TEXT,
  error_message TEXT,
  trend_count SMALLINT,
  PRIMARY KEY (run_id, woeid)
);

-- トレンドスナップショット
CREATE TABLE trend_snapshot (
  snapshot_id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES ingest_run(run_id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL,
  woeid BIGINT NOT NULL REFERENCES place(woeid) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 50),
  term_id BIGINT NOT NULL REFERENCES term(term_id) ON DELETE RESTRICT,
  tweet_count INT NULL,  -- ドキュメント記載あり、実際は返却されない場合があるためNULL許容
  raw_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (captured_at, woeid, position)  -- UPSERTの正規キー
);

-- インデックス
CREATE INDEX idx_snapshot_woeid_time_pos
  ON trend_snapshot (woeid, captured_at DESC, position);
CREATE INDEX idx_snapshot_term_time
  ON trend_snapshot (term_id, captured_at DESC);
CREATE INDEX idx_snapshot_time
  ON trend_snapshot (captured_at DESC);

-- 最新トレンド取得用ビュー
CREATE VIEW latest_trends_v AS
WITH latest AS (
  SELECT woeid, MAX(captured_at) AS captured_at
  FROM trend_snapshot
  GROUP BY woeid
)
SELECT s.*
FROM trend_snapshot s
JOIN latest l
  ON s.woeid = l.woeid
 AND s.captured_at = l.captured_at;
