# GitHub Actions CI/CD セットアップガイド

## 概要

`apps/batch/**` への Push で自動的に Cloud Run にデプロイされます。

## 事前準備 (GCP側)

### 1. Workload Identity Federation 設定

```bash
# 変数設定
PROJECT_ID="xtrend-prod"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
GITHUB_REPO="sogakenta/XTrend"

# Workload Identity Pool 作成
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# OIDC Provider 作成
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウント作成
gcloud iam service-accounts create "github-actions" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions"

# 必要な権限を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding \
  "github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}"

# Cloud Run サービスアカウントへの権限
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.serviceAccountUser" \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 2. 出力値の確認

```bash
# WIF_PROVIDER の値
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"

# WIF_SERVICE_ACCOUNT の値
echo "github-actions@${PROJECT_ID}.iam.gserviceaccount.com"
```

## GitHub Secrets 設定

リポジトリの Settings → Secrets and variables → Actions で以下を設定：

| Secret名 | 値 |
|----------|-----|
| `WIF_PROVIDER` | `projects/716605103738/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | `github-actions@xtrend-prod.iam.gserviceaccount.com` |

## Cloud Scheduler 更新（毎時01分に変更）

```bash
# 現在: 毎時05分 (5 * * * *)
# 変更: 毎時01分 (1 * * * *)

gcloud scheduler jobs update http xtrend-hourly-ingest \
  --location asia-northeast1 \
  --schedule "1 * * * *" \
  --description "XTrend hourly trend ingestion (at minute 1)"
```

## 動作確認

1. `apps/batch/` 内のファイルを変更
2. main ブランチに Push
3. Actions タブでワークフロー実行を確認
4. Cloud Run に新リビジョンがデプロイされることを確認

## トラブルシューティング

### 認証エラー
- WIF_PROVIDER, WIF_SERVICE_ACCOUNT が正しく設定されているか確認
- サービスアカウントの権限を確認

### ビルドエラー
- Dockerfile のパスを確認
- package.json の依存関係を確認
