# XTrend 実装可能MVP仕様 v0.2

最終更新: 2026-02-14

## 0. この文書の目的
- 企画段階の曖昧さをなくし、実装担当（CC）がすぐ着手できる仕様に落とし込む。
- ロール別レビュー（プランナー / PdM / テクニカルプランナー / アドバイザー）の指摘を反映する。

---

## 1. ロール別レビュー要約

### 1.1 プランナー視点（コアバリュー・差別化）
**コアバリュー（1文）**  
「Xの地域トレンドを、時系列で比較可能な形にし、話題の“変化”を誰でも即座に読めるようにする。」

**差別化ポイント**
- `リアルタイム性`: Xトレンドの短周期変化を1時間粒度で蓄積する。
- `地域性`: 日本 / 東京 / 大阪を同一UIで横断比較できる。
- `変化可視化`: “今何が上位か”だけでなく、24h/7dの推移を見せる。
- `軽量利用`: ログイン不要・閲覧中心でSEO流入に強い構造にする。

**競合との違い（要約）**
- Google Trends: 検索行動中心で粒度が異なる。X固有の話題瞬発力は拾いにくい。
- X公式トレンド表示: 現在値中心で履歴比較が弱い。
- 高価格帯ソーシャル分析SaaS: 高機能だが個人利用には重く高コスト。

**競合分析（2026-02-12 Playwright検証）**

| サービス | 強み | 弱み |
| --- | --- | --- |
| twittrend.jp | 時間軸切替（現在〜3日前）、横並び比較、シンプル | 推移グラフなし、比較機能弱い |
| Google Trends | 時系列グラフ、複数語比較、地域マップ、エクスポート | Xデータではない、リアルタイム性弱い |

**XTrendの差別化軸（twittrend.jp + Google Trendsのいいとこ取り）**
- `時点比較体験`: 「今」と「1h/3h/6h/12h/24h前」を即座に切替
- `横並び変化表示`: 複数時点のトレンドを横に並べて変化を一覧
- `推移グラフ`: 単語の24h/7d推移を折れ線で可視化
- `更新鮮度表示`: 「更新: 21:59」のようにデータの鮮度を明示

### 1.2 PdM視点（MVP最小機能）
MVPは「取得・蓄積・閲覧」の一連価値を最短で成立させる。

**P0（必須）- 最小構成**
- 3地域のトレンドを1時間ごとに収集しDBへ保存。
- `/` で日本の最新トレンド表示。
- `/place/[slug]` で地域別の最新ランキング表示。
- **時間軸切替**: 現在/1h前/3h前/6h前/12h前/24h前を即座に切替。
- **横並び比較**: 2〜3列で複数時点のトレンドを並べて変化を一覧。
- **更新時刻表示**: データの鮮度を「更新: HH:MM」形式で明示。
- `/term/[termKey]` で単語推移（24h / 7d）の折れ線グラフ表示。
- 基本SEO（title/description/canonical/sitemap）。

**P1（早期追加）**
- `/compare`（2語比較、1地域、24h/7d）。
- 30dレンジ。

**P2（後続）**
- 多言語UI、地域拡張、データAPI外販。

### 1.3 テクニカルプランナー視点（改善要点）
- `TIMESTAMP` を `TIMESTAMPTZ` に統一。
- `trend_snapshot.woeid` は `place` へのFKを必須化。
- 収集実行単位を記録する `ingest_run` を追加し、失敗解析と再実行を可能にする。
- URLは `woeid` 直出しをやめ、`slug` を正規URLとする。
- DB正本 + Next.jsキャッシュ + CDNの責務分離を明確化する。

### 1.4 アドバイザー視点（盲点）
- X APIの仕様・価格・利用規約変更リスク。
- 「順位データ」を「人気量」と誤認される解釈リスク。
- SEOで薄いページが大量生成されるリスク。
- キャッシュ失効の設計不備による古い情報表示リスク。
- バッチ部分失敗時の運用（partial success）未定義リスク。

---

## 2. MVP要件定義（PdM確定版）

### 2.1 対象ユーザー
- SNS運用担当者
- メディア編集者
- 個人クリエイター

### 2.2 ユーザーストーリー（P0）
1. ユーザーは地域（日本/東京/大阪）ごとの最新トレンドを確認できる。
2. ユーザーは「今」と「1h/3h/6h/12h/24h前」のトレンドを即座に切り替えて比較できる。
3. ユーザーは複数時点のトレンドを横並びで見て、順位の変化を把握できる。
4. ユーザーは任意のトレンド語について、時間推移（24h/7d）をグラフで確認できる。
5. ユーザーはURL共有時に同じ内容へ再訪できる（恒久URL）。

### 2.3 受け入れ基準（P0）
- データ鮮度: 各地域の最新データが70分以内に更新される。
- 収集成功率: 日次で各地域95%以上の取得成功。
- 可用性: `place` / `term` ページが500エラー率1%未満。
- 表示性能: 主要ページのサーバーレスポンスP95が1500ms以内。

### 2.4 非機能要件（P0）
- 認証不要（閲覧のみ）。
- 監視: Cloud Loggingで失敗理由を追跡可能。
- すべての時刻はUTC保存、表示のみJST変換。

---

## 3. 情報設計・URL設計（SEO込み）

### 3.1 正規URL
- `/` : 日本最新トレンド
- `/place/[slug]` : `jp`, `tokyo`, `osaka`
- `/term/[termKey]` : 例 `t-12345`
- `/compare` : `?place=tokyo&terms=t-123,t-456&range=7d`（P1）

### 3.2 URLポリシー
- `woeid` は内部識別子として保持し、公開URLには使わない。
- `termKey` は `t-{term_id}` をMVPの正規形式にする（slug衝突回避）。
- 将来の見た目改善用に `/{slug}-t-{id}` を許可しても canonical は `t-{id}` に統一。

### 3.3 SEO最小セット（P0）
- 各ページに `title` / `meta description` / `canonical` を設定。
- `sitemap.xml` を生成。
- 重複パラメータURLは canonical で集約。

---

## 4. データモデル（Supabase/PostgreSQL）

### 4.1 DDL（MVP）
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE TABLE term (
  term_id BIGSERIAL PRIMARY KEY,
  term_text TEXT NOT NULL,
  term_norm TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingest_run (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  error_summary TEXT
);

-- 地域別の取得結果を記録（部分失敗の検証・再実行判断用）
CREATE TABLE ingest_run_place (
  run_id UUID NOT NULL REFERENCES ingest_run(run_id) ON DELETE CASCADE,
  woeid BIGINT NOT NULL REFERENCES place(woeid) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error_code TEXT,
  error_message TEXT,
  trend_count SMALLINT,
  PRIMARY KEY (run_id, woeid)
);

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
-- NOTE: (captured_at, woeid, term_id) の一意制約は削除。同一時刻に同一語が複数順位に出る可能性は低いが、
--       UPSERT時の競合回避のため position ベースのみを採用。

CREATE INDEX idx_snapshot_woeid_time_pos
  ON trend_snapshot (woeid, captured_at DESC, position);
CREATE INDEX idx_snapshot_term_time
  ON trend_snapshot (term_id, captured_at DESC);
CREATE INDEX idx_snapshot_time
  ON trend_snapshot (captured_at DESC);
```

### 4.2 初期データ（place seed）
```sql
INSERT INTO place (woeid, slug, name_ja, name_en) VALUES
  (23424856, 'jp', '日本', 'Japan'),
  (1118370, 'tokyo', '東京', 'Tokyo'),
  (15015370, 'osaka', '大阪', 'Osaka');
```
※ WOEID検証済み（2026-02-12 Playwright確認）

### 4.3 用語正規化ルール（term_norm）
- 前後空白除去。
- 連続空白を単一空白へ圧縮。
- 英字は小文字化。
- 先頭 `#` は保持（トレンド語の意味を維持）。

---

## 5. バッチ取得設計（Cloud Run + Scheduler）

### 5.1 実行条件
- Cloud Scheduler: 毎時 `5分` 実行（例: `5 * * * *`）。
- `captured_at` は実行時刻をUTC時間で `date_trunc('hour', now())` に丸める。

### 5.2 処理フロー
1. `ingest_run` を `running` で作成。
2. `is_active = true` の `place` を取得。
3. 各 `woeid` に対しX API呼び出し（**常に `max_trends=50` を指定**）。
4. `term` を `UPSERT`。
5. `trend_snapshot` を `UPSERT`（冪等性確保）。
6. 地域単位失敗があれば `partial`、全成功なら `succeeded`。
7. 実行結果を構造化ログで出力。

### 5.3 冪等性ルール
- 同一 `captured_at + woeid + position` は上書き更新する。
- 再実行で重複行を作らない。
- 1地域失敗でも他地域はコミットする（全体ロールバックしない）。

---

## 6. キャッシュ戦略（責務分離）

### 6.1 正本
- 正本は `trend_snapshot`（DB）とする。
- `latest_trends` のような上書きテーブルはMVPでは作らない。

### 6.2 読み取り最適化
```sql
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
```

### 6.3 Next.js / CDNキャッシュ
- `/place/[slug]`: 300秒
- `/term/[termKey]`: 900秒
- `/compare`: 1800秒（P1）

### 6.4 失効方針
- MVPは `TTLベース` を基本にする（実装複雑度を抑える）。
- P1で `revalidateTag` を導入し、バッチ成功時に選択的失効へ移行する。

---

## 7. スコア設計（表示用）

### 7.1 基本式
- `rank_score = 51 - position`（1位=50点、50位=1点）
- `index = 100 * rank_score / max(rank_score in range)`

### 7.2 表示レンジ
- P0: 24h / 7d
- P1: 30d

### 7.3 注意書き
- 指標は「順位ベース」であり、検索量や投稿量の絶対値ではない。

---

## 8. リスク一覧（アドバイザー反映）

| リスク | 影響 | 対策 |
| --- | --- | --- |
| X API仕様・価格改定 | 機能停止/採算悪化 | 取得頻度・対象地域を可変設定化 |
| 利用規約の解釈差 | 公開停止リスク | ToS確認をGate 0に追加 |
| ~~大阪WOEID未確定~~ | ~~初期スコープ未成立~~ | **解決済み**: 15015370で確定 |
| 薄いSEOページ増加 | 検索評価低下 | index/noindex条件を導入 |
| キャッシュ不整合 | 古い情報表示 | TTL短縮 + 将来tag失効 |
| 部分失敗運用不足 | 障害検知遅延 | `ingest_run.status` とエラーログ監視 |

---

## 9. 開発順序（実装担当向け）

### 9.1 Gate 0（着手初日）✅ 完了
- [x] 大阪WOEID確定: **15015370**（2026-02-12 検証済み）
- [x] X APIで日本/東京/大阪の実データ取得確認（2026-02-14 検証済み）
  - 日本（23424856）: 正常取得、30件のトレンドデータ確認
  - 東京（1118370）: 正常取得
  - 大阪（15015370）: 正常取得
  - レスポンス構造: `{"data": [{"trend_name": "..."}]}`
  - `tweet_count` は返却されない（NULL設計で正解）
- [x] 利用規約上の表示/保存要件を確認（2026-02-14 検証済み）
  - 詳細は付録F参照

### 9.2 実装ステップ（Codexレビュー反映版）
1. **プロジェクト初期化**（Next.js + Supabase CLI + 環境変数）
2. **DBマイグレーション + seed**（`place`, `term`, `ingest_run`, `ingest_run_place`, `trend_snapshot`）
3. **収集バッチ実装**（Cloud Runジョブ + Scheduler）
4. **監視・失敗通知**（バッチと同時に実装 - Cloud Loggingベース）
5. `/` と `/place/[slug]` 実装
6. `/term/[termKey]` 実装（24h/7d）
7. **SEO最小セット実装**（metadata, sitemap, canonical）

※ 監視はバッチ導入直後に入れる（Codex指摘: 初期運用の失敗検知遅延防止）

### 9.3 Definition of Done（MVP）
- P0機能が本番環境で動作し、72時間連続で収集継続。
- 3地域（日本/東京/大阪）の最新データ表示が可能。
- 主要ページで受け入れ基準（2.3）を満たす。

---

## 10. この仕様で削ったもの（意図的スコープ外）
- 高度な比較UI（3語以上、複数地域同時比較）
- ユーザー認証・お気に入り機能
- 外部提供API
- 多言語UI

MVPで価値検証後に再評価する。

---

## 付録A. 利用API（検証済み）

### A.1 エンドポイント
```
GET https://api.twitter.com/2/trends/by/woeid/{woeid}
```

### A.2 公式ドキュメント
- https://docs.x.com/x-api/trends/trends-by-woeid/introduction
- https://docs.x.com/x-api/trends/get-trends-by-woeid

### A.3 リクエスト例
```bash
curl -X GET \
  "https://api.twitter.com/2/trends/by/woeid/23424856?max_trends=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### A.4 パラメータ
| パラメータ | 内容 | 設定値 |
| --- | --- | --- |
| woeid | 地域ID | 必須 |
| max_trends | 最大取得件数（1〜50） | **常に50を指定** |

### A.5 レスポンス例
```json
{
  "data": [
    {"trend_name": "#AI", "tweet_count": 250000},
    {"trend_name": "Breaking News", "tweet_count": 180000}
  ]
}
```

※ `tweet_count` はドキュメントに記載があり受け取る仕組みとするが、実際には返却されないケースがあるため NULL許容設計とする。

### A.6 取得件数方針
- **常に `max_trends=50` を指定する**
- 理由: 1回のAPIコール料金は取得件数に依存しないため、最大件数を取得するのが最もコスト効率が良い

### A.7 対応WOEID一覧（日本）
| 地域 | WOEID | slug |
| --- | --- | --- |
| 日本（全国） | 23424856 | jp |
| 東京 | 1118370 | tokyo |
| 大阪 | 15015370 | osaka |
| 京都 | 15015372 | - |
| 横浜 | 1118550 | - |
| 名古屋 | 1117817 | - |
| 福岡 | 1117099 | - |
| 札幌 | 1118108 | - |

---

## 付録B. ビジネスモデル

### B.1 フェーズ1（初期）
- SEO流入
- ディスプレイ広告

### B.2 フェーズ2
- 比較機能の高度化
- データAPI提供
- B2B向け分析機能

---

## 付録C. システム構成

- **DB**: Supabase（PostgreSQL）
- **バッチ**: Cloud Run + Cloud Scheduler
- **フロント**: Next.js（App Router）
- **CDN**: Vercel

---

## 付録D. コスト試算（3地域）

| 項目 | 月額 |
| --- | --- |
| X API（3地域 × 24回/日 × 30日） | 約 ¥3,240 |
| Supabase（Free〜Pro） | ¥0〜¥2,500 |
| Vercel（Hobby〜Pro） | ¥0〜¥2,000 |
| Cloud Run | ¥500〜¥1,000 |
| **合計** | **約 ¥6,000〜¥8,000** |

※ X API料金は2026年時点の想定。実際の契約条件で再確認が必要。

---

## 付録E. 拡張ロードマップ

| Phase | 内容 |
| --- | --- |
| Phase1 | 日本・東京・大阪（MVP） |
| Phase2 | 世界・アメリカ追加 + 英語UI |
| Phase3 | 英語圏拡張 |
| Phase4 | 非英語圏追加 |

---

## 付録F. X API利用規約コンプライアンス（2026-02-14確認）

### F.1 表示要件（Display Requirements）
XTrendはトレンド名のみを表示するため、ツイート表示に関する厳格な要件（ユーザー名、プロフィール画像、アクション等）は直接適用されない。

**遵守事項**
- X/Twitterがデータソースであることの帰属表示
- フッター等に「Data from X」等の表記を追加

### F.2 データ保存・キャッシュ
**許可されている利用**
- X Contentのコピー、表示、フォーマット調整は許可
- トレンドデータ（trend_name）の蓄積・時系列表示は許可範囲内

**注意事項**
- 位置情報データは関連コンテンツと紐づけた形でのみ保存可
- XTrendはトレンド名+WOEID（地域）という形で保存するため問題なし

### F.3 禁止事項
- AI/MLモデルのトレーニング利用（Grok除く）→ XTrendは対象外
- 監視目的での利用 → XTrendは対象外
- スパム行為 → XTrendは閲覧専用のため対象外

### F.4 XTrendへの具体的対応
| 要件 | 対応 |
| --- | --- |
| 帰属表示 | フッターに「Trend data provided by X」を表示 |
| データ保存 | トレンド名+地域+時刻の保存は許可範囲内 |
| 表示形式 | ランキング形式での表示は問題なし |
| 更新頻度 | 1時間ごとの取得・表示は規約に抵触しない |

### F.5 参考リンク
- X Terms of Service: https://x.com/tos
- X Developer Policy: https://developer.x.com/developer-terms/policy
- Display Requirements: https://developer.twitter.com/en/developer-terms/display-requirements
