-- term_description: トレンド語の解説文を保存するテーブル
CREATE TABLE term_description (
  term_id     BIGINT PRIMARY KEY REFERENCES term(term_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'auto',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  term_description IS 'トレンド語の自動生成解説文';
COMMENT ON COLUMN term_description.source IS '生成元 (auto=Claude CLI, manual=手動)';

-- RLS: anon は読み取りのみ、書き込みは service_role (RLS bypass) 経由
ALTER TABLE term_description ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON term_description
  FOR SELECT USING (true);

-- 未解説 or 24時間以上更新なしのトレンドを取得する RPC 関数
CREATE OR REPLACE FUNCTION get_undescribed_trends()
RETURNS TABLE(term_id BIGINT, term_text TEXT) AS $$
  SELECT DISTINCT t.term_id, t.term_text
  FROM trend_snapshot ts
  JOIN term t ON t.term_id = ts.term_id
  WHERE ts.captured_at = (
    SELECT MAX(captured_at) FROM trend_snapshot
  )
  AND NOT EXISTS (
    SELECT 1 FROM term_description td
    WHERE td.term_id = t.term_id
    AND td.updated_at > NOW() - INTERVAL '24 hours'
  )
  ORDER BY t.term_id;
$$ LANGUAGE sql STABLE;
