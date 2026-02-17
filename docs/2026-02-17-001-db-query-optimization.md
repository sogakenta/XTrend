# DBクエリ最適化 設計ドキュメント

- **日付**: 2026-02-17
- **番号**: 2026-02-17-001-db-query-optimization
- **ステータス**: ドラフト
- **関連**: 2026-02-16-002-db-optimization-design.md, 2026-02-17-001-integrated-spec.md

---

## 1. 概要

Placeページ (`/place/[slug]`) のレンダリング時間が3〜8秒と非常に遅い問題を分析し、DBクエリ最適化の設計を行う。

---

## 2. 現状分析

### 2.1 データ取得フロー

```
PlacePage
  ├── getPlaceBySlug(slug)              # 1クエリ
  │
  ├── [offset=0] getLatestTrendsWithSignals(woeid)
  │     ├── getLatestTrends()
  │     │     ├── place取得               # 1クエリ
  │     │     ├── latest captured_at取得  # 1クエリ
  │     │     └── snapshots取得           # 1クエリ
  │     ├── resolveCapturedAt(1h)         # 1クエリ
  │     ├── previousSnapshots取得         # 1クエリ
  │     ├── regionCount取得               # 1クエリ
  │     └── durationSnapshots取得         # 1クエリ
  │     計: 8クエリ
  │
  ├── [offset=1] getTrendsAtOffset(woeid, 1)
  │     ├── place取得                     # 1クエリ
  │     ├── latest captured_at取得        # 1クエリ
  │     ├── target captured_at取得        # 1クエリ
  │     └── snapshots取得                 # 1クエリ
  │     計: 4クエリ
  │
  ├── [offset=3] getTrendsAtOffset(woeid, 3)   # 4クエリ
  ├── [offset=6] getTrendsAtOffset(woeid, 6)   # 4クエリ
  ├── [offset=12] getTrendsAtOffset(woeid, 12) # 4クエリ
  ├── [offset=24] getTrendsAtOffset(woeid, 24) # 4クエリ
  ├── [offset=48] getTrendsAtOffset(woeid, 48) # 4クエリ
  └── [offset=72] getTrendsAtOffset(woeid, 72) # 4クエリ

合計: 1 + 8 + (4 × 7) = 37クエリ
```

### 2.2 クエリ内訳

| 関数 | クエリ数 | 呼び出し回数 | 合計 |
|------|---------|-------------|------|
| `getPlaceBySlug` | 1 | 1 | 1 |
| `getLatestTrendsWithSignals` | 8 | 1 | 8 |
| `getTrendsAtOffset` | 4 | 7 | 28 |
| **合計** | - | - | **37** |

### 2.3 ネットワークレイテンシの影響

Supabaseはリモートデータベースであり、各クエリには以下のオーバーヘッドが発生する:

| 項目 | 推定時間 |
|------|---------|
| DNS解決 | 初回のみ 10-50ms |
| TCP接続確立 | keep-alive で軽減 |
| TLS ハンドシェイク | keep-alive で軽減 |
| クエリ実行 | 5-50ms |
| ネットワーク往復 (RTT) | 50-150ms |

**クエリあたり推定時間**: 60-200ms

```
37クエリ × 60-200ms = 2.2〜7.4秒
```

これがページロード時間3〜8秒の主因である。

### 2.4 並列実行の効果

現状のコードでは `Promise.all()` で8つのoffsetを並列取得している:

```typescript
// apps/web/src/app/place/[slug]/page.tsx:41-47
const fetchPromises = offsets.map(offset =>
  offset === 0
    ? getLatestTrendsWithSignals(place.woeid)
    : getTrendsAtOffset(place.woeid, offset)
);
const results = await Promise.all(fetchPromises);
```

しかし、各関数内部でシーケンシャルに複数クエリを実行しているため、並列化のメリットが限定的:

```
Timeline (parallel execution):
────────────────────────────────────────────────────────────
offset=0:  [place][latest][snaps][resolve][prev][region][dur]
offset=1:  [place][latest][target][snaps]
offset=3:  [place][latest][target][snaps]
offset=6:  [place][latest][target][snaps]
...
────────────────────────────────────────────────────────────
          │←─────────── 最長パス（offset=0）が支配的 ───────→│
```

### 2.5 重複クエリの特定

| クエリ | 重複回数 | 内容 |
|--------|---------|------|
| place取得 | 9回 | 全関数で同じwoeidのplace情報を取得 |
| latest captured_at | 8回 | 8つのoffset全てで最新時刻を取得 |

**重複クエリ数**: 15クエリ（約40%が重複）

---

## 3. 問題の識別

### 3.1 N+1クエリ問題

現状の問題パターン:

```typescript
// 問題1: offsetごとにplace情報を取得
for (offset of offsets) {
  const { data: place } = await supabase.from('place').select('*').eq('woeid', woeid);
  // ...
}

// 問題2: offsetごとにlatest captured_atを取得
for (offset of offsets) {
  const { data: latestSnapshot } = await supabase.from('trend_snapshot')
    .select('captured_at').eq('woeid', woeid).order(...).limit(1);
  // ...
}
```

### 3.2 シーケンシャル実行のボトルネック

`getLatestTrendsWithSignals` 内部の依存関係:

```
getLatestTrends() → 結果必要 → resolveCapturedAt()
                 → 結果必要 → previousSnapshots取得
                 → 結果必要 → regionCount取得
                 → 結果必要 → durationSnapshots取得
```

4つのシグナルクエリが全て `getLatestTrends()` の結果（capturedAt, termIds）に依存しているため、シーケンシャル実行が強制される。

### 3.3 ネットワークラウンドトリップの累積

```
現状: 37クエリ × RTT = 37ラウンドトリップ
```

リモートDBでは各ラウンドトリップが50-150ms。これが最大の性能ボトルネック。

---

## 4. ユーザースケール時の影響

### 4.1 同時接続数別の負荷

| 同時ユーザー | クエリ/秒 | DB接続数 | 影響 |
|-------------|----------|---------|------|
| 1 | 37/3s = 12 | 1 | 問題なし |
| 10 | 120 | 10 | Supabase Free上限に近づく |
| 50 | 600 | 50 | 接続プール枯渇リスク |
| 100 | 1,200 | 100 | 確実に破綻 |

### 4.2 Supabase接続制限

| プラン | 最大接続数 | Pooler接続数 |
|--------|-----------|-------------|
| Free | 60 | 200 |
| Pro | 100 | 300 |

### 4.3 地域拡張時の影響

| 地域数 | クエリ/ページ | 読取行数/ページ |
|--------|-------------|----------------|
| 3（現在） | 37 | 約2,000行 |
| 53（将来） | 37 | 約35,000行 |

---

## 5. 解決策

### 5.1 解決策A: バッチクエリ最適化（即時実装可能）

#### 概要

既存の `getTrendsForOffsets()` 関数を活用・拡張し、複数offsetのデータを1回のDB往復で取得する。

#### 変更点

```typescript
// Before: 37クエリ
const results = await Promise.all(
  offsets.map(offset =>
    offset === 0
      ? getLatestTrendsWithSignals(woeid)
      : getTrendsAtOffset(woeid, offset)
  )
);

// After: 4クエリ
const [place, trendsMap, signals] = await Promise.all([
  getPlaceBySlug(slug),                           // 1クエリ
  getTrendsForOffsetsOptimized(woeid, offsets),   // 3クエリ (in句で一括取得)
]);
```

#### 最適化された `getTrendsForOffsetsOptimized`

```typescript
async function getTrendsForOffsetsOptimized(
  woeid: number,
  offsets: number[]
): Promise<Map<number, PlaceTrends>> {
  // 1. Place + Latest captured_at を1クエリで取得
  const { data: placeWithLatest } = await supabase
    .from('place')
    .select('*, trend_snapshot!inner(captured_at)')
    .eq('woeid', woeid)
    .order('trend_snapshot.captured_at', { ascending: false })
    .limit(1)
    .single();

  // 2. 全offsetのtarget時刻を計算
  const targetTimes = calculateTargetTimes(placeWithLatest.captured_at, offsets);

  // 3. 全時刻のスナップショットを1クエリで取得 (IN句)
  const { data: allSnapshots } = await supabase
    .from('trend_snapshot')
    .select(`captured_at, position, term_id, tweet_count, term:term_id(term_text)`)
    .eq('woeid', woeid)
    .in('captured_at', targetTimes);

  // 4. メモリ内でoffsetごとにグルーピング
  return groupByOffset(allSnapshots, offsets);
}
```

#### 効果

| 指標 | Before | After | 削減率 |
|------|--------|-------|-------|
| クエリ数 | 37 | 4-6 | 84-89% |
| ラウンドトリップ | 37 | 4-6 | 84-89% |
| 推定レイテンシ | 3-8秒 | 0.3-0.8秒 | 90% |

#### トレードオフ

| メリット | デメリット |
|----------|-----------|
| 即時実装可能 | シグナル計算は都度実行 |
| 既存コードの延長 | メモリ使用量増加（一括取得） |
| DBスキーマ変更不要 | 53地域時の1クエリ行数が大きい |

---

### 5.2 解決策B: サーバーサイドキャッシュ層

#### 概要

Vercel/Cloud RunとSupabaseの間にインメモリキャッシュ（Redis/Upstash）を配置する。

#### アーキテクチャ

```
[ユーザー] → [Next.js ISR]
                  ↓
            [Redis/Upstash Cache] ← TTL: 1時間
                  ↓ (miss時のみ)
            [Supabase PostgreSQL]
```

#### キャッシュキー設計

```
trends:{woeid}:{captured_at}         # 50アイテム
signals:{woeid}:{captured_at}        # シグナル計算結果
place:{woeid}                        # 地域情報（長TTL）
```

#### 効果

| 指標 | Before | After (hit) | After (miss) |
|------|--------|-------------|--------------|
| レイテンシ | 3-8秒 | 50-100ms | 3-8秒 → 次回から50ms |
| DBクエリ | 37/req | 0 | 37 |

#### トレードオフ

| メリット | デメリット |
|----------|-----------|
| キャッシュヒット時は超高速 | 追加インフラ（Redis）が必要 |
| DB負荷を大幅削減 | キャッシュ無効化の複雑さ |
| ISRとの相性が良い | 初回アクセス/キャッシュ期限切れ時は遅い |

#### コスト（Upstash）

| プラン | 価格 | 制限 |
|--------|------|------|
| Free | $0 | 10K commands/day |
| Pay as you go | $0.2/100K commands | - |

---

### 5.3 解決策C: PostgreSQL View/RPC

#### 概要

Supabase PostgreSQLにVIEWまたはRPC関数を作成し、複数テーブルの結合・集計をDB側で行う。

#### VIEW定義

```sql
CREATE OR REPLACE VIEW v_trends_with_signals AS
SELECT
  ts.woeid,
  ts.captured_at,
  ts.position,
  ts.term_id,
  t.term_text,
  ts.tweet_count,

  -- rankChange: 1時間前との差
  (
    SELECT ts_prev.position - ts.position
    FROM trend_snapshot ts_prev
    WHERE ts_prev.woeid = ts.woeid
      AND ts_prev.term_id = ts.term_id
      AND ts_prev.captured_at = ts.captured_at - INTERVAL '1 hour'
  ) AS rank_change,

  -- regionCount: 同時刻の地域数
  (
    SELECT COUNT(DISTINCT ts_region.woeid)
    FROM trend_snapshot ts_region
    WHERE ts_region.term_id = ts.term_id
      AND ts_region.captured_at = ts.captured_at
  ) AS region_count,

  -- durationHours: 連続時間
  (
    SELECT COUNT(*)
    FROM generate_series(0, 23) AS h
    WHERE EXISTS (
      SELECT 1 FROM trend_snapshot ts_dur
      WHERE ts_dur.woeid = ts.woeid
        AND ts_dur.term_id = ts.term_id
        AND ts_dur.captured_at = ts.captured_at - (h || ' hours')::INTERVAL
    )
    -- 連続性チェックは別途実装が必要
  ) AS duration_hours

FROM trend_snapshot ts
JOIN term t ON t.term_id = ts.term_id;
```

#### RPC関数

```sql
CREATE OR REPLACE FUNCTION get_trends_for_offsets(
  p_woeid BIGINT,
  p_offsets INT[]
)
RETURNS TABLE (
  offset_hours INT,
  captured_at TIMESTAMPTZ,
  position INT,
  term_id BIGINT,
  term_text TEXT,
  tweet_count INT,
  rank_change INT,
  region_count INT,
  duration_hours INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_latest_captured_at TIMESTAMPTZ;
BEGIN
  -- 最新時刻を取得
  SELECT MAX(captured_at) INTO v_latest_captured_at
  FROM trend_snapshot
  WHERE woeid = p_woeid;

  -- 各offsetのデータを返却
  RETURN QUERY
  SELECT
    unnest(p_offsets) AS offset_hours,
    -- ... (複雑なロジックをDB側で実装)
  FROM ...;
END;
$$;
```

#### 呼び出し

```typescript
const { data } = await supabase
  .rpc('get_trends_for_offsets', {
    p_woeid: woeid,
    p_offsets: [0, 1, 3, 6, 12, 24, 48, 72]
  });
// 1クエリで全データ取得
```

#### 効果

| 指標 | Before | After |
|------|--------|-------|
| クエリ数 | 37 | 1 |
| ラウンドトリップ | 37 | 1 |
| 推定レイテンシ | 3-8秒 | 0.2-0.5秒 |

#### トレードオフ

| メリット | デメリット |
|----------|-----------|
| 最も効率的（1クエリ） | SQL複雑度が高い |
| ネットワーク転送量削減 | デバッグが困難 |
| インフラ追加不要 | マイグレーション管理が必要 |

---

### 5.4 解決策D: 事前計算シグナル（バッチジョブ）

#### 概要

ingest（バッチ収集）完了時にシグナルを事前計算し、専用テーブルに保存する。Web側は計算済みデータを取得するのみ。

#### スキーマ

```sql
CREATE TABLE trend_signal_hourly (
  captured_at TIMESTAMPTZ NOT NULL,
  woeid BIGINT NOT NULL,
  term_id BIGINT NOT NULL,

  -- 事前計算シグナル
  rank_change_1h SMALLINT,
  region_count SMALLINT,
  duration_hours SMALLINT,
  is_new_24h BOOLEAN DEFAULT FALSE,
  is_reentry_24h BOOLEAN DEFAULT FALSE,

  PRIMARY KEY (captured_at, woeid, term_id)
);
```

#### データフロー

```
[X API] → [ingest.ts] → [trend_snapshot] (生データ)
                      ↓
              [compute_signals] (ingest完了後に実行)
                      ↓
              [trend_signal_hourly] (計算済み)

[Web] → SELECT FROM trend_snapshot
        JOIN trend_signal_hourly
        USING (captured_at, woeid, term_id)
```

#### 効果

| 指標 | Before | After |
|------|--------|-------|
| 読取クエリ数 | 37 | 4-6 |
| 計算タイミング | リクエストごと | 1時間に1回 |
| 53地域でのスケール | 破綻 | 問題なし |

#### トレードオフ

| メリット | デメリット |
|----------|-----------|
| Web側の負荷を最小化 | 実装工数が大きい（2-4日） |
| データの正確性が保証される | ストレージ使用量が増加 |
| スケール時も安定 | バッチ失敗時のリカバリが必要 |

---

### 5.5 解決策E: エッジキャッシュ戦略

#### 概要

Vercel Edge / Cloudflare のエッジキャッシュを活用し、静的JSONとしてデータを配信する。

#### アーキテクチャ

```
[ingest] → [trend_snapshot DB]
         → [JSON生成] → [R2/S3] → [CDN Edge]
                                       ↓
[ユーザー] → [Next.js] → [CDN Edge] (キャッシュヒット)
```

#### JSON構造

```json
// /data/2026/02/17/12/japan.json
{
  "capturedAt": "2026-02-17T12:00:00Z",
  "woeid": 23424856,
  "trends": [
    {
      "position": 1,
      "termId": 12345,
      "termText": "サンプルトレンド",
      "tweetCount": 50000,
      "rankChange": 5,
      "regionCount": 3,
      "durationHours": 4
    }
  ]
}
```

#### 効果

| 指標 | Before | After |
|------|--------|-------|
| レイテンシ | 3-8秒 | 50-100ms |
| DB負荷 | 高 | ほぼゼロ |
| スケール | 制限あり | 無制限 |

#### トレードオフ

| メリット | デメリット |
|----------|-----------|
| 最高のパフォーマンス | ingestパイプラインの変更が必要 |
| 無限スケール | JSONとDBの整合性管理 |
| DBコスト削減 | 追加ストレージ（R2/S3） |

---

## 6. 実装優先順位

### 6.1 推奨ロードマップ

| Phase | 解決策 | 工数 | 効果 | 推奨度 |
|-------|--------|------|------|--------|
| **Phase 0** | A: バッチクエリ最適化 | 0.5-1日 | 80%改善 | **最優先** |
| **Phase 1** | D: 事前計算（offset=0のみ） | 2日 | シグナル計算を削減 | 高 |
| Phase 2 | C: PostgreSQL RPC | 1-2日 | さらなる最適化 | 中 |
| Phase 3 | E: エッジキャッシュ | 2-3日 | 究極のスケール | 低（MVPでは不要） |
| 保留 | B: Redisキャッシュ | 1-2日 | 追加インフラのため | 低 |

### 6.2 Phase 0 詳細（即時対応）

#### タスク

1. **重複クエリの排除**
   - `getPlaceBySlug` の結果を再利用
   - `latest captured_at` を1回だけ取得

2. **`getTrendsForOffsets` の拡張**
   - 既存関数にシグナル計算を統合
   - `getLatestTrendsWithSignals` を廃止

3. **IN句による一括取得**
   - 8つのoffsetの `captured_at` を配列で渡す
   - 1クエリで全スナップショットを取得

#### 変更ファイル

```
apps/web/src/lib/data.ts
apps/web/src/app/place/[slug]/page.tsx
```

#### 期待効果

```
Before: 37クエリ, 3-8秒
After:  4-6クエリ, 0.3-1秒
```

---

## 7. モニタリング提案

### 7.1 計測すべきメトリクス

| メトリクス | 目的 | 閾値 |
|-----------|------|------|
| `page_render_time_p95` | ユーザー体感速度 | < 1秒 |
| `db_query_count_per_page` | クエリ効率 | < 10 |
| `db_query_latency_p95` | DB応答速度 | < 100ms |
| `supabase_egress_daily` | コスト管理 | < 無料枠70% |
| `cache_hit_rate` | キャッシュ効率 | > 90% |

### 7.2 実装方法

#### Vercel Analytics（推奨）

```typescript
// app/place/[slug]/page.tsx
import { track } from '@vercel/analytics';

export default async function PlacePage({ params }: PageProps) {
  const start = performance.now();

  // ... データ取得 ...

  const duration = performance.now() - start;
  track('page_render', {
    slug,
    duration_ms: Math.round(duration),
    query_count: queryCount
  });
}
```

#### Server Timing Header

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('Server-Timing', `db;dur=${dbDuration}`);
  return response;
}
```

### 7.3 アラート設定

| 条件 | アクション |
|------|-----------|
| `page_render_time_p95 > 3s` | Slack通知、Phase 1へ移行検討 |
| `db_query_count > 50` | コードレビュー、N+1検知 |
| `supabase_egress > 4GB` | Pro プラン検討 |

---

## 8. 結論

### 8.1 根本原因

1. **多すぎるラウンドトリップ**: 37クエリ × 60-200ms = 3-8秒
2. **重複クエリ**: place取得9回、latest取得8回（40%が無駄）
3. **シーケンシャル依存**: シグナル計算が getLatestTrends() に依存

### 8.2 推奨アクション

| 優先度 | アクション | 効果 | 工数 |
|--------|-----------|------|------|
| **P0** | バッチクエリ最適化（解決策A） | 80%高速化 | 0.5-1日 |
| P1 | offset=0のシグナル事前計算 | シグナル負荷削減 | 2日 |
| P2 | PostgreSQL RPC化 | さらなる最適化 | 1-2日 |

### 8.3 期待成果

```
Before: 37クエリ, 3-8秒, スケール不可
After:  4-6クエリ, 0.3-1秒, 53地域対応可能
```

---

## 付録A: 既存関数のクエリ分析

### getLatestTrendsWithSignals (8クエリ)

```typescript
// Query 1: getLatestTrends -> place
supabase.from('place').select('*').eq('woeid', woeid)

// Query 2: getLatestTrends -> latest captured_at
supabase.from('trend_snapshot').select('captured_at')
  .eq('woeid', woeid).order('captured_at', { ascending: false }).limit(1)

// Query 3: getLatestTrends -> snapshots
supabase.from('trend_snapshot').select(`position, term_id, tweet_count, term:term_id(...)`)
  .eq('woeid', woeid).eq('captured_at', capturedAt)

// Query 4: resolveCapturedAt (1h ago)
supabase.from('trend_snapshot').select('captured_at')
  .eq('woeid', woeid).eq('captured_at', targetIso).limit(1)

// Query 5: previousSnapshots
supabase.from('trend_snapshot').select('term_id, position')
  .eq('woeid', woeid).eq('captured_at', oneHourAgoCapturedAt).in('term_id', termIds)

// Query 6: regionData
supabase.from('trend_snapshot').select('term_id, woeid')
  .eq('captured_at', capturedAt).in('term_id', termIds)

// Query 7-8: durationSnapshots
supabase.from('trend_snapshot').select('term_id, captured_at')
  .eq('woeid', woeid).in('term_id', termIds)
  .gte('captured_at', twentyFourHoursAgo).lte('captured_at', capturedAt)
```

### getTrendsAtOffset (4クエリ)

```typescript
// Query 1: place
supabase.from('place').select('*').eq('woeid', woeid)

// Query 2: latest captured_at
supabase.from('trend_snapshot').select('captured_at')
  .eq('woeid', woeid).order('captured_at', { ascending: false }).limit(1)

// Query 3: target captured_at
supabase.from('trend_snapshot').select('captured_at')
  .eq('woeid', woeid).lte('captured_at', targetTime).order(...).limit(1)

// Query 4: snapshots
supabase.from('trend_snapshot').select(`...`)
  .eq('woeid', woeid).eq('captured_at', capturedAt)
```

---

## 付録B: 最適化後のコード例

```typescript
// 最適化版: getTrendsWithSignalsForAllOffsets
export async function getTrendsWithSignalsForAllOffsets(
  woeid: number,
  offsets: ValidOffset[]
): Promise<Map<ValidOffset, TrendItemWithSignals[]>> {
  const result = new Map<ValidOffset, TrendItemWithSignals[]>();

  // Query 1: Place情報（キャッシュ候補）
  const { data: place } = await supabase
    .from('place')
    .select('*')
    .eq('woeid', woeid)
    .single();
  if (!place) return result;

  // Query 2: 最新captured_at
  const { data: latest } = await supabase
    .from('trend_snapshot')
    .select('captured_at')
    .eq('woeid', woeid)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();
  if (!latest) return result;

  // 全offsetのtarget時刻を計算
  const latestTime = new Date(latest.captured_at);
  const targetTimes = offsets.map(offset => {
    if (offset === 0) return latest.captured_at;
    const target = new Date(latestTime.getTime() - offset * 60 * 60 * 1000);
    target.setUTCMinutes(0, 0, 0);
    return target.toISOString();
  });
  const uniqueTimes = [...new Set(targetTimes)];

  // Query 3: 全時刻のスナップショットを一括取得
  const { data: allSnapshots } = await supabase
    .from('trend_snapshot')
    .select(`
      captured_at, position, term_id, tweet_count,
      term:term_id (term_text)
    `)
    .eq('woeid', woeid)
    .in('captured_at', uniqueTimes)
    .order('position');

  // Query 4: offset=0用のシグナルデータ（1時間前・地域数・継続時間）
  const termIds = allSnapshots
    ?.filter(s => s.captured_at === latest.captured_at)
    .map(s => s.term_id) || [];

  const oneHourAgo = new Date(latestTime.getTime() - 60 * 60 * 1000);
  oneHourAgo.setUTCMinutes(0, 0, 0);

  const [previousData, regionData, durationData] = await Promise.all([
    // 1時間前のポジション
    supabase.from('trend_snapshot')
      .select('term_id, position')
      .eq('woeid', woeid)
      .eq('captured_at', oneHourAgo.toISOString())
      .in('term_id', termIds),
    // 地域数
    supabase.from('trend_snapshot')
      .select('term_id, woeid')
      .eq('captured_at', latest.captured_at)
      .in('term_id', termIds),
    // 継続時間（24時間分）
    supabase.from('trend_snapshot')
      .select('term_id, captured_at')
      .eq('woeid', woeid)
      .in('term_id', termIds)
      .gte('captured_at', new Date(latestTime.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .lte('captured_at', latest.captured_at)
  ]);

  // メモリ内でデータを組み立て
  // ... (省略)

  return result;
}
```

**クエリ数: 4 + 3(並列) = 実質4ラウンドトリップ**

---

## 参考

- [Supabase Performance Guide](https://supabase.com/docs/guides/platform/performance)
- [PostgreSQL EXPLAIN ANALYZE](https://www.postgresql.org/docs/current/using-explain.html)
- [Next.js ISR Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Vercel Analytics](https://vercel.com/docs/analytics)
