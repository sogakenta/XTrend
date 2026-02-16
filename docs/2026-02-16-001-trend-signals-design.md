# トレンドシグナル機能 設計ドキュメント

- **日付**: 2026-02-16
- **番号**: 001
- **ステータス**: 承認済み

---

## 概要

トレンド表示機能を拡張し、競合サイト（trends24.in, twittrend.jp）を超える差別化を実現する。

## 競合分析

### trends24.in
- 時間軸: 1時間ごとに20+スナップショット（過去24時間）
- 表示: 順位のみ、シグナルなし
- UI: 単一カラム、Timeline/Tag Cloud/Tableのビュー切替
- 強み: 「最長トレンド期間」「新規トレンド」などの分析機能

### twittrend.jp
- 時間軸: 現在/1h前/3h前/6h前/12h前/24h前/2日前/3日前
- 表示: 順位のみ、シグナルなし
- UI: タブ形式で時間帯切替、20位以下は折りたたみ
- 強み: 22地域+海外31地域、シンプルなインターフェース

### 両サイト共通の弱点
- シグナル情報（上昇、地域数、継続時間）がない
- 順位変動の可視化がない
- 時間軸比較が縦並びで、横並び比較しにくい

## 差別化ポイント

| 機能 | trends24.in | twittrend.jp | XTrend |
|------|-------------|--------------|--------|
| 時間軸 | 1h刻み×24 | 1h/3h/6h/12h/24h/2日/3日 | 同等+横並び比較 |
| シグナル(上昇/下降) | - | - | **対応** |
| 地域数表示 | - | - | **対応** |
| 継続時間 | 最長のみ | - | **対応** |
| 新規トレンドバッジ | あり | - | **対応** |
| 横並び比較 | - | - | **対応** |

**結論**: 「横並び比較 + シグナル」が明確な差別化

---

## 機能仕様

### 1. シグナル定義

| シグナル | 定義 | 表示例 |
|----------|------|--------|
| `rankChange` | 1時間前との順位差 | ↑12, ↓5 |
| `regionCount` | 同時刻にトレンド入りしている地域数 | 5地域 |
| `durationHours` | 連続してトップ50に入っている時間 | 3時間 |

### 2. 新規トレンドバッジ

| バッジ | 定義 |
|--------|------|
| **NEW** | 対象時点に存在し、直前24時間に同一地域で未出現 |
| **再浮上** | 直前1時間には不在だが、24時間内に出現履歴あり |
| (なし) | 直前1時間にも存在（継続中） |

### 3. 時間軸プリセット

```
0h (現在), 1h, 3h, 6h, 12h, 24h, 48h (2日), 72h (3日)
```

- トップページ: 固定3カラム（現在/1h/3h）
- 地域ページ: 上記プリセットをタブ表示
- 自由入力: 初期リリースでは見送り（キャッシュキー爆発防止）

---

## 技術設計

### 関数構成（リファクタリング）

```ts
// 時点解決
resolveCapturedAt(woeid: number, offsetHours: number): Promise<string | null>

// トレンド取得（シグナルなし）
getTrendsAtCapturedAt(woeid: number, capturedAt: string): Promise<TrendItem[]>

// シグナル付与
enrichSignals(woeid: number, capturedAt: string, trends: TrendItem[]): Promise<TrendItemWithSignals[]>

// 公開API
getTrends(woeid: number, options: { offsetHours?: number, withSignals?: boolean }): Promise<PlaceTrendsWithSignals | null>
```

### クエリ最適化（必須）

**問題**: `data.ts:182` の無制限履歴取得

```ts
// 現状（問題あり）
const { data: previousSnapshots } = await supabase
  .from('trend_snapshot')
  .in('term_id', termIds)
  .lte('captured_at', oneHourAgo.toISOString())
  .order('captured_at', { ascending: false });
// → 全履歴を取得してしまう

// 改善案
const { data: previousSnapshots } = await supabase
  .from('trend_snapshot')
  .in('term_id', termIds)
  .eq('captured_at', resolvedOneHourAgoCapturedAt) // 時点を固定
  .order('position');
```

### DB負荷評価

| 項目 | 現状 | 改善後 |
|------|------|--------|
| トップページクエリ数 | 14 | 約20（シグナル全表示） |
| 1クエリあたり行数 | 無制限（問題） | 50件固定 |
| ISRキャッシュ | 300秒 | 300秒（維持） |

**結論**: ISR 300秒、MVP 3地域なら、MVなしで十分回せる。マテリアライズドビューは計測後に検討。

---

## 実装優先度

### Phase 1（初回リリース）

| 優先度 | タスク |
|--------|--------|
| P0 | クエリ最適化（無制限履歴取得の是正） |
| P0 | 関数リファクタリング（汎用化） |
| P1 | 全カラムでシグナル表示 |
| P1 | 時間軸プリセット拡張 |
| P1 | NEW_24Hバッジ追加 |

### Phase 2（後続）

| 優先度 | タスク |
|--------|--------|
| P2 | 急上昇ソート/フィルタ |
| P2 | 再浮上バッジ |
| P3 | パフォーマンス計測導入 |
| P3 | キャッシュテーブル（必要に応じて） |

---

## 参考

- trends24.in: https://trends24.in/
- twittrend.jp: https://twittrend.jp/
