# idea-boost

アイデア出しに慣れていないチームが、迷わずアイデアを出し、整理し、1つに絞るための Web アプリ **Idea Boost** のリポジトリです。

ハッカソン・ビジコン・チーム制作の初期で起きる「何を作ればいいか分からない」「アイデアが出ない」「どれを選べばいいか分からない」といった課題を、発散・整理・選定の流れに沿ったブレスト体験で支援します。Miro や FigJam のような自由なホワイトボードではなく、初学者でも迷わず進められるフレームワーク型のアイデア創出支援を目指しています。

本番アプリ: **<https://ideaboost.dev>**

## ドキュメント

プロダクトの詳細（PRD、ペルソナ、競合分析、画面イメージなど）は [Idea Boost Wiki](https://github.com/engineer-first/idea-boost/wiki) にまとめています。仕様や設計の確認は Wiki を参照してください。

技術構成は **Next.js（UI）+ Cloudflare Workers（api-worker）+ Durable Objects（1ルーム = 1 権威サーバー）+ D1（ロビー）** です。採用の経緯と移行の記録は [`docs/refactor-cloudflare-do.md`](docs/refactor-cloudflare-do.md) を参照してください。

## 環境構築

### 前提

- [mise](https://mise.jdx.dev/)（Node.js のバージョン管理に使用）
- Git

Docker や外部サービスのアカウントは不要です（wrangler がローカルで D1 / Durable Objects をエミュレートします）。

### 手順

```bash
git clone git@github.com:engineer-first/idea-boost.git
cd idea-boost

# mise で Node.js LTS をインストール（初回のみ）
mise install

# 依存関係のインストール
npm ci

# 環境設定ファイルをコピー
cp .env.example .env.local                       # Next.js 側
cp workers/.dev.vars.example workers/.dev.vars   # api-worker 側の秘密（gitignore 済み）

# セッション署名用の秘密を生成
openssl rand -base64 32
# 出力された同じ値を .env.local と workers/.dev.vars の SESSION_SECRET に設定

# D1（ローカル）に migration を適用（初回のみ）
npm run db:migrate

# ターミナル1: api-worker（D1 + Durable Objects）を起動
npm run dev:api

# ターミナル2: Next.js 開発サーバーを起動
npm run dev
```

ブラウザで <http://localhost:3000> を開いて動作を確認できます。

`.env.example` と `workers/.dev.vars.example` の `SESSION_SECRET` は、コピーした
まま誤って利用されることを防ぐため、意図的に認証処理で拒否されます。生成した
値は Git にコミットせず、必ず両方のファイルで同じ値を使用してください。

### 認証のローカル開発

本番のログインは Google 認証（OIDC）のみを想定しています。ローカル開発では、固定のメール/パスワードユーザーでログインできます（`NEXT_PUBLIC_ENABLE_DEV_AUTH=true` かつ production 以外の環境でだけ表示されます）。

固定ユーザー（初回ログイン時に自動作成されるため、シードは不要です）:

| メール                | パスワード |
| --------------------- | ---------- |
| `owner@example.test`  | `password` |
| `member@example.test` | `password` |
| `viewer@example.test` | `password` |

Google ログインを確認する場合は、Google Cloud Console で OAuth クライアントを作成し、`.env.local` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定してください（リダイレクト URI は `http://localhost:3000/auth/callback`）。

### よく使うコマンド

| コマンド                                    | 説明                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                               | Next.js 開発サーバーを起動                                                                                                                                                                                                     |
| `npm run dev:api`                           | api-worker（D1 + Durable Objects）をローカル起動                                                                                                                                                                               |
| `npm run db:migrate`                        | ローカル D1 に migration を適用                                                                                                                                                                                                |
| `npm run new:room-do-migration -- 短い説明` | RoomDO migration の `.sql` スタブをタイムスタンプ付きで作成（例: `-- add-note-kind`）。コミットするのは `.sql` だけ（集約 `index.ts` は gitignore 済みの生成物で、`npm ci` / `test:workers` / `dev:api` などが自動再生成する） |
| `npm run build`                             | Next.js 本番ビルド                                                                                                                                                                                                             |
| `npm run build:cf`                          | Cloudflare Workers 向けビルド（OpenNext）                                                                                                                                                                                      |
| `npm run deploy:api`                        | api-worker をデプロイ                                                                                                                                                                                                          |
| `npm run deploy:app`                        | app-worker をビルド + デプロイ（api → app の順が必要な場合は `npm run deploy`）                                                                                                                                                |
| `npm run deploy`                            | api → app の順で両方デプロイ                                                                                                                                                                                                   |
| `npm run preview:cf`                        | Workers 向けビルドを workerd 上でローカル実行（2構成同時）                                                                                                                                                                     |
| `npm run lint`                              | Biome による静的解析 (lint + format チェック)                                                                                                                                                                                  |
| `npm run fix`                               | Biome の自動修正 (lint + format)                                                                                                                                                                                               |
| `npm run format`                            | Biome でファイルを一括フォーマット                                                                                                                                                                                             |
| `npm run test`                              | アプリ側ユニットテストを実行 (CI でも実行)                                                                                                                                                                                     |
| `npm run test:workers`                      | Worker / Durable Object のテストを workerd 上で実行                                                                                                                                                                            |
| `npm run typecheck`                         | 型検査（Worker の型生成込み）                                                                                                                                                                                                  |

### デプロイ（Cloudflare）

本番アプリは **<https://ideaboost.dev>** で利用できます。

2 Worker + D1 + RoomDO 構成です。デプロイ順は **api → app**（`npm run deploy`）。CI と同じ D1 migration → api → app をこの 1 行で実行します。

| Worker           | 設定ファイル             | 役割                                                         |
| ---------------- | ------------------------ | ------------------------------------------------------------ |
| `idea-boost-app` | `wrangler.jsonc`         | UI（Next.js / OpenNext）+ `/api/*` を service binding で転送 |
| `idea-boost-api` | `workers/wrangler.jsonc` | REST + WebSocket（D1 / RoomDO への唯一の入口）               |

**本番の更新方法:** `develop` の変更を `release` にマージ（または push）すると GitHub Actions（`deploy.yml`）が自動で D1 migrate → api → app → health を実行します。手動で出すときは `npm run deploy`（`wrangler login` 済みであること）。Actions には `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `vars.NEXT_PUBLIC_SITE_URL` の設定が必要です。

秘密・初回手順・カスタムドメイン・CI・動作確認の詳細は **[デプロイ構成図](docs/site/deploy-map/index.html)**（公開後: [GitHub Pages](https://engineer-first.github.io/idea-boost/deploy-map/)）を参照してください。

### MSW (Mock Service Worker)

- **ブラウザ (dev)** は `.env.local` の `NEXT_PUBLIC_USE_MSW` で制御します
  - 有効化: `NEXT_PUBLIC_USE_MSW=true` をセット
  - 無効化: `false` にする (または行ごと削除)

Node.js のバージョンは `mise.toml` で LTS に固定しています。CI でも同じ mise 設定を使用しています。

### MCP サーバー (Claude Code などのエージェント向け)

`.mcp.json` でプロジェクト共通の MCP サーバーを定義しています。

- **playwright** — 実ブラウザでの UI 確認・スクリーンショット取得に使用します

## スクラム運用

- [学校スクラム開発のホワイトボードと GitHub Projects 連携](docs/scrum/whiteboard-github-projects.md)

## ドキュメントのフォーマット

Markdown の整形には [remark](https://github.com/remarkjs/remark) を使用します。設定は `.remarkrc.mjs` に集約されており、VS Code 拡張 [remark](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-remark)（保存時整形）と CLI（`.claude/hooks/format-on-edit.sh` 経由のAIエージェント編集時整形、`npm run format:md`）が同じ設定・同じ実装を共有するため、人間が保存したときとAIが編集したときで整形結果が一致します。テーブルは `remark-gfm` の `stringLength` に `string-width` を渡すことで、全角文字幅を考慮した列揃えに対応しています。拡張子ごとの Biome/remark 振り分けは `scripts/format-file.sh` に一本化されており、Claude Code・opencode（`opencode.json` の `formatter`）・Codex CLI（`.codex/hooks.json` 経由の `scripts/format-changed-files.sh`）はいずれもこのスクリプトを共通で呼び出します。

リポジトリを開いたら、推奨拡張機能として案内される **remark** をインストールしてください。

## 命名規則

| 対象                 | 規則         | 例                                                    |
| -------------------- | ------------ | ----------------------------------------------------- |
| ファイル名           | `kebab-case` | `idea-card.tsx`, `use-idea-list.ts`, `format-date.ts` |
| 関数名               | `camelCase`  | `getUserName`                                         |
| スキーマ名 (型・zod) | `PascalCase` | `User`, `Idea`, `IdeaStatus`                          |
