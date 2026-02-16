# DB負荷対策 設計ドキュメント

- **日付**: 2026-02-16
- **番号**: 002
- **ステータス**: 承認済み
- **関連**: 2026-02-16-001-trend-signals-design.md

---

## 概要

シグナル機能を競合を上回る形で実装しつつ、DB負荷問題を解決するための設計。

## 背景

### 競合サービスの実装

- **trends24.in / twittrend.jp**: 近々のデータや指定範囲のデータを取得するだけ
- シグナル計算（上昇、地域数、継続時間）は行っていない
- スケーラビリティの考慮は不明

### XTrendの目標

- シグナル情報で差別化
- 53地域まで拡張してもスケールする設計
- DB負荷を抑えつつ高機能を実現

---

## 現状の問題

### 問題クエリ（data.ts:182-198）

```ts
// 1時間前の位置取得 - 全履歴を取得してしまう
const { data: previousSnapshots } = await supabase
  .from('trend_snapshot')
  .select('term_id, position, captured_at')
  .eq('woeid', woeid)
  .in('term_id', termIds)  // 50件
  .lte('captured_at', oneHourAgo.toISOString())
  .order('captured_at', { ascending: false });
```

### 破綻タイムライン

| 期間 | 1地域の累積行数 | 問題 |
|------|----------------|------|
| 4〜8日 | 4,800〜9,600 | max_rows=1000で切り捨て開始 |
| 1ヶ月 | 36,000 | 深刻な精度劣化 |
| 6ヶ月 | 216,000 | 完全に機能しない |

### 負荷の数値

| 項目 | 現状（問題あり） | 最適化後 |
|------|-----------------|----------|
| 1リクエストの読み取り行数 | 約6,608行 | 約611行 |
| ISR再生成1日分 | 約190万行 | 約18万行 |

---

## 対策設計

### アプローチ比較

| アプローチ | 説明 | 評価 | 採用 |
|-----------|------|------|------|
| A. ingest時に事前計算 | バッチ収集時にシグナルを計算してキャッシュテーブルに保存 | 本命 | ✅ |
| B. マテリアライズドビュー | PostgreSQLのMVで集計を事前計算 | 53地域でrefreshコスト問題 | ⏸️ |
| C. クエリ最適化のみ | 時点固定 + group by | 応急処置として必須 | ✅ |

### 結論

**C（クエリ最適化）を即実施 → A（事前計算テーブル）へ移行**

---

## キャッシュテーブル設計（A案）

### スキーマ

```sql
-- シグナル事前計算テーブル
CREATE TABLE trend_signal_hourly (
  captured_at TIMESTAMPTZ NOT NULL,
  woeid BIGINT NOT NULL REFERENCES place(woeid),
  term_id BIGINT NOT NULL REFERENCES term(term_id),

  -- シグナル
  rank_change_1h SMALLINT NULL,      -- 1時間前との順位差（+は上昇、-は下降）
  region_count SMALLINT NULL,        -- 同時刻にトレンド入りしている地域数
  duration_hours SMALLINT NOT NULL,  -- 連続してトップ50に入っている時間

  -- 新規判定フラグ
  is_new_24h BOOLEAN NOT NULL DEFAULT FALSE,       -- 直前24hに未出現
  is_reentry_24h BOOLEAN NOT NULL DEFAULT FALSE,   -- 直前1hには不在、24h内に出現歴あり
  is_continuing_1h BOOLEAN NOT NULL DEFAULT FALSE, -- 直前1hにも存在

  -- 品質フラグ
  region_count_is_partial BOOLEAN NOT NULL DEFAULT FALSE, -- 部分失敗時のフラグ
  run_id UUID NOT NULL REFERENCES ingest_run(run_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (captured_at, woeid, term_id)
);

-- インデックス
CREATE INDEX idx_signal_woeid_time
  ON trend_signal_hourly (woeid, captured_at DESC);

CREATE INDEX idx_signal_term_time
  ON trend_signal_hourly (term_id, captured_at DESC);

-- trend_snapshotへの追加インデックス（存在判定/24h判定で効く）
CREATE INDEX idx_snapshot_woeid_term_time
  ON trend_snapshot (woeid, term_id, captured_at DESC);
```

### データフロー

```
[X API] → [ingest.ts] → [trend_snapshot] (生データ)
                      ↓
              [compute_signals]
                      ↓
              [trend_signal_hourly] (シグナル)

[Web UI] → SELECT FROM trend_snapshot
           JOIN trend_signal_hourly
           ON (captured_at, woeid, term_id)
```

### 利点

1. **読み取り時は計算済みデータを取得するだけ**
   - 53地域でも「1画面あたり50行×列数」の読み取り

2. **シグナルは1時間に1回だけ計算**
   - ingest完了後に1回実行
   - Web側のDB負荷を大幅削減

3. **品質管理が可能**
   - `region_count_is_partial`で部分失敗を検知
   - `run_id`でトレーサビリティ確保

---

## 実装計画

### Phase 0: クエリ最適化（応急処置）

**工数**: 0.5〜1日

| タスク | ファイル | 内容 |
|--------|----------|------|
| 時点固定化 | `data.ts:182` | `lte()`を`eq(resolved_time)`に変更 |
| group by化 | `data.ts:201`, `data.ts:221` | 集計クエリに変更 |
| offset制限 | `place/[slug]/page.tsx:31` | プリセット値のみ許可 |

```ts
// Before
.lte('captured_at', oneHourAgo.toISOString())

// After
const resolvedOneHourAgo = await resolveCapturedAt(woeid, 1);
.eq('captured_at', resolvedOneHourAgo)
```

### Phase 1: シグナルテーブル導入

**工数**: 2〜4日

| タスク | 内容 |
|--------|------|
| マイグレーション | `trend_signal_hourly`テーブル作成 |
| 計算SQL関数 | `compute_signals_for_captured_at()`実装 |
| ingest連携 | 全地域処理後にシグナル計算を呼び出し |
| Web読取変更 | `trend_snapshot` + `trend_signal_hourly` JOIN |

#### ingest処理の変更箇所

```
apps/batch/src/ingest.ts:28   - オーケストレーション
apps/batch/src/ingest.ts:172  - 地域ごとの書き込み
apps/batch/src/db.ts:123      - trend_snapshot upsert
```

全地域処理後に追加:
```ts
await computeSignalsForCapturedAt(capturedAt, runId, succeededPlaces, totalPlaces);
```

### Phase 2: 運用品質

**工数**: 1〜2日

| タスク | 内容 |
|--------|------|
| 部分失敗表示 | UIで`region_count_is_partial`を表示 |
| メトリクス | 計算時間・行数・失敗率の記録 |
| バックフィル | 既存データへのシグナル計算（72h/30d） |

---

## スケーラビリティ

### 53地域対応時の見積もり

| 項目 | 3地域（現在） | 53地域（将来） |
|------|--------------|----------------|
| 1時間の新規行（snapshot） | 150 | 2,650 |
| 1時間の新規行（signal） | 150 | 2,650 |
| 1日の新規行 | 3,600 | 63,600 |
| 1ヶ月の累積 | 108,000 | 1,908,000 |

### 事前計算の効果

| 項目 | 現状（都度計算） | 事前計算後 |
|------|-----------------|-----------|
| 1リクエストの読み取り | 約6,608行 | 約100行 |
| 計算タイミング | リクエストごと | 1時間に1回 |
| 53地域でのスケール | 破綻 | 問題なし |

---

## Supabase制限との照合

| リソース | Free | Pro | XTrend想定 |
|----------|------|-----|-----------|
| DBサイズ | 500MB | 8GB | 1年で約300MB |
| Egress | 5GB | 250GB | ISR 300秒で十分 |
| Compute | Nano | Micro+ | 事前計算で軽減 |

**結論**: 事前計算方式ならFreeプランでも1年以上運用可能

---

## 参考

- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase compute: https://supabase.com/docs/guides/platform/compute-and-disk
- 関連ドキュメント: 2026-02-16-001-trend-signals-design.md
