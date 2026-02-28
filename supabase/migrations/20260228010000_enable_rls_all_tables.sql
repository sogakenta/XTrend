-- 全テーブルに RLS を有効化
-- 書き込みは全て service_role キー（RLS bypass）経由で行うため、
-- INSERT/UPDATE/DELETE ポリシーは不要

-- ── place ──
ALTER TABLE place ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON place
  FOR SELECT USING (true);

-- ── term ──
ALTER TABLE term ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON term
  FOR SELECT USING (true);

-- ── ingest_run ──
-- Web からは参照不要。service_role のみアクセス
ALTER TABLE ingest_run ENABLE ROW LEVEL SECURITY;

-- ── ingest_run_place ──
-- Web からは参照不要。service_role のみアクセス
ALTER TABLE ingest_run_place ENABLE ROW LEVEL SECURITY;

-- ── trend_snapshot ──
ALTER TABLE trend_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON trend_snapshot
  FOR SELECT USING (true);

-- ── term_description ──
-- 既に有効化済みの場合はスキップ（20260228000000 で設定済み）
-- ALTER TABLE term_description ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow public read" ON term_description
--   FOR SELECT USING (true);
