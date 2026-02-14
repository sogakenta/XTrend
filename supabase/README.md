# XTrend データベース構成

## テーブル概要

```
place (地域マスタ)
  │
  ├──< ingest_run_place (収集結果/地域別)
  │         │
  │         └──> ingest_run (収集実行記録)
  │
  └──< trend_snapshot (トレンドスナップショット)
              │
              └──> term (トレンド語マスタ)
```

## テーブル詳細

### place - 地域マスタ
収集対象の地域を管理。

| カラム | 型 | 説明 |
|--------|------|------|
| woeid | BIGINT | X API の地域ID (PK) |
| slug | TEXT | URL用識別子 (例: "tokyo") |
| name_ja | TEXT | 日本語名 (例: "東京") |
| is_active | BOOLEAN | 収集対象かどうか |

現在の設定:
- 23424856: 日本 (jp)
- 1118370: 東京 (tokyo)
- 15015370: 大阪 (osaka)

---

### term - トレンド語マスタ
トレンドワードの正規化・重複排除用。

| カラム | 型 | 説明 |
|--------|------|------|
| term_id | BIGSERIAL | 自動採番ID (PK) |
| term_text | TEXT | 表示用テキスト (例: "#推しの子") |
| term_norm | TEXT | 正規化テキスト (UNIQUE, 検索用) |

正規化ルール: NFKC → trim → collapse spaces → lowercase

---

### ingest_run - 収集実行記録
1時間ごとのバッチ実行を記録。

| カラム | 型 | 説明 |
|--------|------|------|
| run_id | UUID | 実行ID (PK) |
| captured_at | TIMESTAMPTZ | 収集時刻（時単位で丸め） |
| started_at | TIMESTAMPTZ | 実行開始時刻 |
| finished_at | TIMESTAMPTZ | 実行終了時刻 |
| status | TEXT | running / succeeded / failed / partial |
| error_summary | TEXT | エラー概要（失敗時） |

---

### ingest_run_place - 収集結果（地域別）
地域ごとの収集成否を記録。部分失敗の検証用。

| カラム | 型 | 説明 |
|--------|------|------|
| run_id | UUID | 実行ID (FK) |
| woeid | BIGINT | 地域ID (FK) |
| status | TEXT | succeeded / failed |
| error_code | TEXT | HTTPステータス等 |
| trend_count | SMALLINT | 取得トレンド数 |

---

### trend_snapshot - トレンドスナップショット
**メインテーブル。** 毎時のトレンド順位を蓄積。

| カラム | 型 | 説明 |
|--------|------|------|
| snapshot_id | BIGSERIAL | 自動採番ID (PK) |
| captured_at | TIMESTAMPTZ | 収集時刻 |
| woeid | BIGINT | 地域ID (FK) |
| position | SMALLINT | 順位 (1-50) |
| term_id | BIGINT | トレンド語ID (FK) |
| tweet_count | INT | ツイート数（NULL可） |
| raw_name | TEXT | 元のトレンド名 |

UNIQUE制約: (captured_at, woeid, position)

---

## ビュー

### latest_trends_v
各地域の最新トレンドを取得するビュー。

```sql
SELECT * FROM latest_trends_v WHERE woeid = 23424856 ORDER BY position;
```

---

## データフロー

```
Cloud Scheduler (毎時05分)
    ↓
Cloud Run (apps/batch)
    ↓
X API v2 (/trends/by/woeid/:woeid)
    ↓
Supabase PostgreSQL
    ├── ingest_run (実行記録)
    ├── ingest_run_place (地域別結果)
    ├── term (新規トレンド語を追加)
    └── trend_snapshot (順位データ)
```

---

## よく使うクエリ

### 最新トレンド取得
```sql
SELECT t.term_text, s.position, s.tweet_count
FROM trend_snapshot s
JOIN term t ON s.term_id = t.term_id
WHERE s.woeid = 23424856
  AND s.captured_at = (SELECT MAX(captured_at) FROM trend_snapshot WHERE woeid = 23424856)
ORDER BY s.position;
```

### 特定トレンドの順位推移
```sql
SELECT s.captured_at, s.position, s.woeid
FROM trend_snapshot s
JOIN term t ON s.term_id = t.term_id
WHERE t.term_norm LIKE '%keyword%'
ORDER BY s.captured_at DESC;
```

### 収集履歴確認
```sql
SELECT captured_at, status, error_summary
FROM ingest_run
ORDER BY captured_at DESC
LIMIT 24;
```
