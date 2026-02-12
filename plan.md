# Xトレンド可視化サービス 企画・設計書（完全版）

## 1. プロジェクト概要

### サービス目的
- X（旧Twitter）の地域別トレンドを取得
- データを時系列で蓄積
- Google Trends風に可視化
- 単語比較機能を提供
- SEO流入を獲得
- 将来的な多言語展開を可能にする

---

## 2. ビジネスモデル

### フェーズ1（初期）
- SEO流入
- ディスプレイ広告

### フェーズ2
- 比較機能の高度化
- データAPI提供
- B2B向け分析機能

---

## 3. 利用API

### エンドポイント
GET https://api.twitter.com/2/trends/by/woeid/{woeid}

### 公式ドキュメント
- https://docs.x.com/x-api/trends/trends-by-woeid/introduction
- https://docs.x.com/x-api/trends/get-trends-by-woeid

### リクエスト例
```bash
curl -X GET \
  "https://api.twitter.com/2/trends/by/woeid/23424856?max_trends=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### パラメータ
| パラメータ | 内容 |
| --- | --- |
| woeid | 地域ID |
| max_trends | 最大取得件数（1〜50） |

### レスポンス例
```json
{
  "data": [
    {"trend_name": "#日向坂ちゃんねる"},
    {"trend_name": "#Aぇヤンタン"}
  ]
}
```

※ tweet_count は現時点では返らないケースがあるため NULL前提設計。

---

## 4. 初期対象地域

| 地域 | WOEID |
| --- | --- |
| 日本 | 23424856 |
| 東京 | 1118370 |
| 大阪 | 要確認 |

- 更新頻度：1時間ごと
- 取得件数：50件

---

## 5. データベース設計（PostgreSQL / Supabase）

### 5.1 term テーブル
```sql
CREATE TABLE term (
  term_id SERIAL PRIMARY KEY,
  term_text TEXT NOT NULL,
  term_norm TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.2 place テーブル
```sql
CREATE TABLE place (
  woeid BIGINT PRIMARY KEY,
  country_code VARCHAR(10),
  name_ja TEXT,
  name_en TEXT,
  timezone TEXT,
  is_active BOOLEAN DEFAULT TRUE
);
```

### 5.3 trend_snapshot テーブル
```sql
CREATE TABLE trend_snapshot (
  captured_at TIMESTAMP NOT NULL,
  woeid BIGINT NOT NULL,
  position INT NOT NULL,
  term_id INT REFERENCES term(term_id),
  tweet_count INT NULL,
  raw_name TEXT,
  PRIMARY KEY (captured_at, woeid, position)
);
```

### 5.4 インデックス
```sql
CREATE INDEX idx_term_time ON trend_snapshot(term_id, captured_at DESC);
CREATE INDEX idx_place_time ON trend_snapshot(woeid, captured_at DESC);
CREATE INDEX idx_time ON trend_snapshot(captured_at DESC);
```

---

## 6. スコア設計（Google Trends風）

### 基本スコア
rank_score = (51 - position)

### 正規化
index = 100 * rank_score / max(rank_score)

※ 期間（24h / 7d / 30d）ごとに最大値を100として正規化する。

---

## 7. URL設計（SEO）

### トップページ
/
日本の最新トレンド表示

### 地域別
/place/{woeid}

### 単語詳細
/term/{keyword}
表示内容：
- 24時間推移
- 7日推移
- 30日推移
- 地域別比較

### 比較ページ
/compare?term=a&term=b&place=23424856&range=7d

---

## 8. バッチ取得設計（Cloud Run）

### 実行頻度
1時間ごと（Cloud Scheduler）

### 疑似コード
```python
for woeid in active_places:
    response = fetch_trends(woeid)

    for index, trend in enumerate(response["data"]):
        term_id = get_or_create_term(trend["trend_name"])
        
        insert trend_snapshot (
            captured_at=now(),
            woeid=woeid,
            position=index+1,
            term_id=term_id,
            tweet_count=trend.get("tweet_count"),
            raw_name=trend["trend_name"]
        )
```

---

## 9. キャッシュ戦略

### レイヤー1：DB内キャッシュ
- latest_trends テーブルを用意
- 最新データを上書き

### レイヤー2：APIレスポンスキャッシュ
| ページ | TTL |
| --- | --- |
| /place | 5〜10分 |
| /term | 10〜30分 |
| /compare | 30分 |

### レイヤー3：ISR（Next.js）
revalidate を利用して静的再生成。

---

## 10. システム構成

- DB：Supabase（PostgreSQL）
- バッチ：Cloud Run
- フロント：Next.js
- CDN：Vercel または Cloudflare

---

## 11. コスト試算（3地域）

1WOEID ≒ ¥1,080 / 月  
3地域 ≒ ¥3,240 / 月  

DB・サーバー込み総額：約 ¥6,000〜¥8,000

---

## 12. 拡張ロードマップ

Phase1：日本・東京・大阪  
Phase2：世界・アメリカ追加 + 英語UI  
Phase3：英語圏拡張  
Phase4：非英語圏追加  

---

## 13. リスク

- API仕様変更
- tweet_count未提供
- 商標・ブランド誤認
- SEO競合

---

## 14. 次のアクション

- ER図確定
- DDL最終化
- Cron実装
- UIワイヤー作成
- SEO設計
