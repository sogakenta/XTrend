# On-Demand Revalidation 設計ドキュメント

- **日付**: 2026-02-16
- **番号**: 003
- **ステータス**: レビュー済み（Open Questions要確認）
- **関連**: 2026-02-16-002-db-optimization-design.md

---

## 概要

トレンドデータは1時間に1回更新されるが、現在のISR設定（revalidate=300秒）では1時間に最大12回の再生成が発生し、11回は同じデータを読み直すだけで無駄。On-Demand Revalidationを導入し、ingest完了時のみ再生成をトリガーする。

## 背景

### 現状の問題

```
データ更新頻度: 1時間に1回（ingest時）
ISR revalidate: 300秒（5分）

→ 1時間の間に最大12回の再生成
→ 11回は同じデータを読み直しているだけで無駄
→ DBへの不要な負荷
```

### 比較

| 方式 | DB読み取り/時 | 鮮度 |
|------|--------------|------|
| 現状 (revalidate=300) | 最大12回 | 最大5分遅れ |
| revalidate=3600 | 最大1回 | 最大1時間遅れ |
| **On-Demand (採用)** | 1回 | ingest直後に反映 |

---

## 設計

### 方針

1. ingest完了時にNext.jsのキャッシュを明示的に無効化
2. `revalidate=3600` をフォールバックとして維持（Webhook失敗時の自己回復）
3. POST + ヘッダ署名で認証（GETはURLログ漏洩リスク）
4. pathは外部入力で受けず、scope allowlist方式

### API実装

```ts
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';

// 許可されたスコープとパスのマッピング
const SCOPES = {
  all: ['/', '/place/jp', '/place/tokyo', '/place/osaka'],
  home: ['/'],
  places: ['/place/jp', '/place/tokyo', '/place/osaka'],
} as const;

export async function POST(request: Request) {
  // ヘッダ署名検証
  const signature = request.headers.get('X-Revalidate-Signature');
  const timestamp = request.headers.get('X-Revalidate-Timestamp');

  if (!verifySignature(signature, timestamp)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // リプレイ攻撃対策: timestampが5分以内か確認
  if (!isTimestampValid(timestamp, 5 * 60 * 1000)) {
    return Response.json({ error: 'Request expired' }, { status: 401 });
  }

  const { scope } = await request.json();
  const paths = SCOPES[scope as keyof typeof SCOPES];

  if (!paths) {
    return Response.json({ error: 'Invalid scope' }, { status: 400 });
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return Response.json({ revalidated: true, paths });
}

// 署名検証（HMAC-SHA256）
function verifySignature(signature: string | null, timestamp: string | null): boolean {
  if (!signature || !timestamp) return false;

  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

function isTimestampValid(timestamp: string | null, maxAgeMs: number): boolean {
  if (!timestamp) return false;
  const ts = parseInt(timestamp, 10);
  return Date.now() - ts < maxAgeMs;
}
```

### Batch側の呼び出し

```ts
// apps/batch/src/index.ts（ingest完了後）

async function triggerRevalidate(scope: 'all' | 'home' | 'places') {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', process.env.REVALIDATE_SECRET!)
    .update(timestamp)
    .digest('hex');

  await fetch(`${process.env.WEB_URL}/api/revalidate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Revalidate-Signature': signature,
      'X-Revalidate-Timestamp': timestamp,
    },
    body: JSON.stringify({ scope }),
  });
}

// ingest結果に応じた分岐
if (result.status === 'succeeded') {
  await triggerRevalidate('all');
} else if (result.status === 'partial') {
  // 成功した地域のみ、またはhomeのみ
  await triggerRevalidate('home');
}
// failed: 再検証しない（前回の良データ維持）
```

### ページ側の設定

```ts
// app/page.tsx, app/place/[slug]/page.tsx, app/term/[termKey]/page.tsx

// フォールバック: Webhook失敗時の自己回復用
export const revalidate = 3600;
```

---

## レビュー結果

### 指摘事項と対策

| 重大度 | 問題 | 対策 | 状態 |
|--------|------|------|------|
| **High** | GET + secret query はURLログに残り漏洩リスク | POST + ヘッダ署名に変更 | ✅ 対応済み |
| **High** | `revalidate=false` は Webhook失敗時に無期限で古いページが残る | 3600を維持（フォールバック） | ✅ 対応済み |
| **High** | Cloud Run複数インスタンスではキャッシュがローカル | 共有cache handler必要 or 単一インスタンス | ⚠️ 要確認 |
| Medium | `path`を外部入力で受けるとDoSリスク | allowlist方式（scope固定）に | ✅ 対応済み |
| Medium | ingest失敗時の挙動が未定義 | succeeded/partial/failedで分岐 | ✅ 対応済み |
| Medium | `/term/[termKey]`個別列挙はスケールしない | 初期は対象外 | ✅ 対応済み |

### ingest結果別の挙動

| ingest結果 | 再検証 | 理由 |
|-----------|--------|------|
| `succeeded` | 全体（all） | 全地域のデータが更新された |
| `partial` | ホームのみ（home） | 一部地域が失敗、トップページは更新 |
| `failed` | なし | 前回の良データを維持 |

---

## Open Questions

| 項目 | 選択肢 | 影響 |
|------|--------|------|
| Web本番環境 | Vercel or Cloud Run？ | Vercelなら問題なし、Cloud Runなら下記確認必要 |
| Cloud Runインスタンス数 | 1なら問題なし | 2以上なら共有cache handler導入が必要 |
| `/term`の再検証 | 初回は対象外を推奨 | 含めると再検証対象が膨大になる |

### Cloud Run複数インスタンスの場合

Next.jsのデフォルトキャッシュはインスタンスローカル。複数インスタンスで運用する場合は、共有キャッシュハンドラーの導入が必要。

```ts
// next.config.ts
module.exports = {
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0, // メモリキャッシュ無効化
};
```

参考: https://nextjs.org/docs/app/guides/self-hosting

---

## 環境変数

| 変数名 | 用途 | 設定場所 |
|--------|------|----------|
| `REVALIDATE_SECRET` | 署名用シークレット | Web, Batch両方 |
| `WEB_URL` | WebアプリのURL | Batch |

---

## 実装優先度

| フェーズ | タスク |
|---------|--------|
| Phase 1 | `/api/revalidate` エンドポイント実装 |
| Phase 1 | Batch側の `triggerRevalidate` 実装 |
| Phase 1 | `revalidate=3600` に変更 |
| Phase 2 | Cloud Run複数インスタンス対応（必要に応じて） |
| Phase 2 | `/term` の再検証対応（必要に応じて） |

---

## 参考

- Next.js revalidatePath: https://nextjs.org/docs/app/api-reference/functions/revalidatePath
- Next.js Route Segment Config: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- Next.js Self-hosting Cache: https://nextjs.org/docs/app/guides/self-hosting
- 関連ドキュメント: 2026-02-16-002-db-optimization-design.md
