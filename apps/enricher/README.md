# enricher — トレンド解説自動生成

Claude CLI（ヘッドレスモード）+ Web検索を使い、未解説のトレンドワードに対して解説文を自動生成し、Supabaseに保存する。

## 前提条件

- **Claude CLI** がインストール済み（Maxプラン）
- **jq** がインストール済み
- **curl** が利用可能
- Supabase に `term_description` テーブルと `get_undescribed_trends()` 関数が作成済み

## セットアップ

```bash
cd apps/enricher
cp .env.example .env
# .env を編集して SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
```

## 手動実行

```bash
./enrich.sh
```

## cron 設定（Raspberry Pi など）

1時間毎に実行する例:

```bash
crontab -e
```

```cron
0 * * * * /path/to/XTrend/apps/enricher/enrich.sh >> /var/log/enricher.log 2>&1
```

## 動作フロー

1. `get_undescribed_trends()` RPC で未解説 or 24時間以上更新なしのトレンドを取得
2. 0件なら終了
3. 1件ずつ `claude -p --model haiku --allowedTools "WebSearch"` で解説生成
4. Supabase REST API で `term_description` テーブルに upsert
5. ログ出力
