# AgentDump Mobile

転職エージェント向け業務管理アプリ（スマホ版 / LINE LIFF）。

## 機能

- LINE風チャットUI（タスク・気づき・音声入力）
- 採用企業・転職者管理
- Google Drive 連携（気づき CSV・PDF）
- B2B マルチテナント（BrainDump 基盤）

## セットアップ

```bash
npm install
npx vercel dev
```

ブラウザ: `http://localhost:3000/app/`

## 環境変数

`.env.example` を参照。Vercel に以下を設定:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` / `LINE_CHANNEL_ID` / `LIFF_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `PLATFORM_ADMIN_SECRET`

## Supabase SQL

リポジトリ外の `02_app/SQL/` に以下を順に実行:

1. `phase1_multi_tenant.sql`
2. `phase2_org_hierarchy.sql`
3. `agentdump_domain.sql`

## デプロイ

Vercel に本リポジトリを連携。LIFF エンドポイント URL を `/app/` に設定。

**Vercel プロジェクト設定（重要）**

| 項目 | 設定値 |
|------|--------|
| Framework Preset | **Other**（Next.js ではない） |
| Root Directory | （空欄） |
| Build Command | （空欄） |
| Output Directory | （空欄） |

`app/` フォルダがあるため Next.js と誤検出される場合があります。`package.json` の `vercel-build` スクリプトで回避しますが、上記設定も確認してください。
