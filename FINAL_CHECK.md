# XTrend 実装前 最終チェックリスト

作成日: 2026-02-14
ステータス: **レビュー待ち**

---

## 1. Gate 0 完了確認

| 項目 | 状態 | 備考 |
|------|------|------|
| X API疎通（日本/東京/大阪） | :white_check_mark: 完了 | 3地域とも正常取得確認 |
| レスポンス構造検証 | :white_check_mark: 完了 | `tweet_count`はNULL許容で設計 |
| 利用規約確認 | :white_check_mark: 完了 | 付録Fに記載 |

---

## 2. Codexレビュー指摘対応

| 指摘 | 重要度 | 対応状況 |
|------|--------|----------|
| `ingest_run_place`テーブル追加 | High | :white_check_mark: DDLに追加済み |
| `trend_snapshot`一意制約整理 | High | :white_check_mark: position基準に統一 |
| 監視を早期に実装 | Medium | :white_check_mark: 実装順序を修正 |
| 初期化ステップ追加 | Medium | :white_check_mark: 実装順序を修正 |

---

## 3. 実装開始前の確認事項

### 3.1 環境準備（ユーザー確認必要）

| 項目 | 確認 | 備考 |
|------|------|------|
| Supabaseプロジェクト作成済み | [ ] | project_ref が必要 |
| Supabase接続情報取得済み | [ ] | URL, anon key, service role key |
| Vercelプロジェクト作成済み | [ ] | GitHub連携推奨 |
| X API Bearer Token設定済み | [x] | .env.local に設定済み |

### 3.2 技術選定確認

| 項目 | 選定 | 代替案 | 確認 |
|------|------|--------|------|
| バッチ実行環境 | Cloud Run + Scheduler | Vercel Cron | [ ] |
| DB | Supabase (PostgreSQL) | - | [x] |
| フロント | Next.js (App Router) | - | [x] |
| CDN | Vercel | - | [x] |

**Codex見解**: Vercel Cronは「厳密時刻実行保証なし」「リトライなし」のため、本番MVPはCloud Run + Scheduler推奨。

### 3.3 コスト確認

| 項目 | 月額目安 |
|------|----------|
| X API（3地域 × 24回/日 × 30日） | 約 ¥3,240 |
| Supabase（Free〜Pro） | ¥0〜¥2,500 |
| Vercel（Hobby〜Pro） | ¥0〜¥2,000 |
| Cloud Run + Scheduler | ¥500〜¥1,000 |
| **合計** | **約 ¥6,000〜¥8,000** |

---

## 4. 実装順序（確定版）

1. プロジェクト初期化（Next.js + Supabase CLI + 環境変数）
2. DBマイグレーション + seed
3. 収集バッチ実装（Cloud Run + Scheduler）
4. 監視・失敗通知（バッチと同時）
5. `/` と `/place/[slug]` 実装
6. `/term/[termKey]` 実装
7. SEO最小セット実装

---

## 5. ユーザー指摘事項

<!-- ここに指摘事項を追記してください -->




---

## 6. 承認

- [ ] 上記内容を確認し、実装開始を承認する

承認者: _______________
日付: _______________
