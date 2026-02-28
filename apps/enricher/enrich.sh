#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────
# enrich.sh — トレンド解説自動生成スクリプト
#
# 1. Supabase RPC で未解説トレンドを取得
# 2. Claude CLI + WebSearch で解説文を生成
# 3. Supabase REST API で upsert
# ────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# .env 読み込み
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# 必須環境変数チェック
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY is required}"

LOG_PREFIX="[enricher $(date '+%Y-%m-%d %H:%M:%S')]"

log() {
  echo "$LOG_PREFIX $*"
}

log_error() {
  echo "$LOG_PREFIX ERROR: $*" >&2
}

# ── 1. 未解説トレンドを取得 ──
log "Fetching undescribed trends..."

RESPONSE=$(curl -sf \
  "${SUPABASE_URL}/rest/v1/rpc/get_undescribed_trends" \
  -H "apikey: ${SUPABASE_SECRET_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}')

# jq で件数チェック
COUNT=$(echo "$RESPONSE" | jq 'length')

if [[ "$COUNT" -eq 0 ]]; then
  log "No undescribed trends found. Exiting."
  exit 0
fi

log "Found ${COUNT} undescribed trends."

# ── 2. 1件ずつ解説生成 & upsert ──
echo "$RESPONSE" | jq -c '.[]' | while read -r ROW; do
  TERM_ID=$(echo "$ROW" | jq -r '.term_id')
  TERM_TEXT=$(echo "$ROW" | jq -r '.term_text')

  log "Processing term_id=${TERM_ID}: ${TERM_TEXT}"

  # Claude CLI で解説生成（WebSearch 有効）
  PROMPT="あなたはX（旧Twitter）のトレンドワード解説者です。
以下のトレンドワードについて、Web検索を使って最新情報を調べ、日本語で簡潔な解説文を生成してください。

トレンドワード: ${TERM_TEXT}

要件:
- 2〜4文程度の簡潔な解説
- なぜ今トレンドになっているのかの背景
- 客観的・中立的なトーン
- 解説文のみを出力（前置きや装飾なし）
- 情報が見つからない場合は「現在トレンド入りしているワードです。」とだけ返す"

  DESCRIPTION=$(claude -p \
    --model haiku \
    --allowedTools "WebSearch" \
    "$PROMPT" 2>/dev/null) || {
    log_error "Claude CLI failed for term_id=${TERM_ID}"
    continue
  }

  # 空チェック
  if [[ -z "$DESCRIPTION" ]]; then
    log_error "Empty description for term_id=${TERM_ID}. Skipping."
    continue
  fi

  # JSON エスケープ
  DESCRIPTION_JSON=$(echo "$DESCRIPTION" | jq -Rs '.')

  # ── 3. Supabase に upsert ──
  UPSERT_RESPONSE=$(curl -sf -o /dev/null -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/term_description" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{
      \"term_id\": ${TERM_ID},
      \"description\": ${DESCRIPTION_JSON},
      \"source\": \"auto\",
      \"updated_at\": \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"
    }")

  if [[ "$UPSERT_RESPONSE" =~ ^2 ]]; then
    log "OK term_id=${TERM_ID}: ${TERM_TEXT}"
  else
    log_error "Upsert failed (HTTP ${UPSERT_RESPONSE}) for term_id=${TERM_ID}"
  fi

  # レート制限回避
  sleep 2
done

log "Done."
