# 依存関係の保守

読者は依存更新PRの作成者・レビュー担当者。採用する実行環境、overrideの理由と削除条件をここで確認する。直接依存・lockfile・上流修正版を更新するときに見直す。個々の実行ログとマージ判断はPRへ残す。

## Node.jsとnpm

開発・CIは `mise.toml` の `node = "24"` で、検証対象のLTSである24系の更新に追従する。2026-10-23の検証版はNode.js 24.22.1 / npm 11.19.1。`packageManager` にnpmの版を記録し、`npm ci` でlockfile v3を再現する。別のパッケージマネージャのlockfileを追加しない。`packageManager` はnpmの版を自動的に切り替える設定ではないため、`node --version` と `npm --version` も確認する。

`engines.node: ^24.22.1` を最低条件とし、`.npmrc` の `engine-strict=true` で修正前のNodeによる依存インストールを拒否する。24.22.1は[2026-10-21のセキュリティ修正版](https://nodejs.org/en/blog/release/v24.22.1/)で、Node内蔵Undiciも7.30.1へ更新される。npm依存のUndiciへのoverrideでは、Node内蔵版は修正できない。

完全固定は更新のたびに設定変更が必要になり、`lts` だけでは将来のLTSメジャー切替で `engines.node` と検証対象から外れる。このため24系の範囲指定を採用する。ローカルに古い24系がある場合は `mise upgrade node` で更新し、`mise exec -- node --version` で最低条件以上を確認する。将来のLTSメジャー移行は依存のengine・peer条件とCIを確認する別の変更として扱う。[miseの版指定](https://mise.jdx.dev/lang/node.html#choosing-a-version)と[NodeのLTS方針](https://nodejs.org/en/about/previous-releases)も参照。

jsdom 30.1.3のNode要件は `^22.22.2 || ^24.15.0 || >=26.0.0`、Vitest 5.0.5は `^22.12.0 || ^24.0.0 || >=26.0.0`、Wrangler 4.151.1は22以上であり、採用する24系は条件内。各CI runの実解決版はmiseのセットアップログで確認する。miseは条件に合う導入済みの版を優先するため、GitHub Actionsのmise tool cacheは無効にする。ホストが新しいGitHub-hosted runnerで毎回24系を解決し、設定hashが同じでも古いNodeを復元し続けない。追加のダウンロード時間は発生する。[miseの更新仕様](https://mise.jdx.dev/dev-tools/#upgrade-tools)も参照。

Node.jsはビルドと検証のホスト。公開先はworkerdであり、Nodeのバージョン指定でWorkersの互換性を保証したことにはしない。App/APIの `compatibility_date: 2026-06-01` と `nodejs_compat` を維持し、Workerテストとコンパイル済みPreviewでサービスバインディング・D1・RoomDOを検査する。[OpenNextの前提](https://opennext.js.org/cloudflare/get-started)は互換日付2024-09-23以降と `nodejs_compat`。

## 限定override

アプリ全体への強制置換はせず、次の親パッケージ配下だけへ適用する。削除を判断するときは、そのルールだけを別worktreeで外して再解決し、`npm explain`、`npm ls --all`、全件auditと関連テストを確認する。

| 親と対象                   | 採用値・理由                                                                                                                                                                                             | 上流と削除条件                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `miniflare → sharp`        | `0.35.5`。直接採用のMiniflare 4.20260730.0は0.35.2を固定し、[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)・[librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)の修正を含まない。 | Wrangler/plugin内のMiniflare 5.20261012.1-betaはすでに0.35.5。Miniflare 4を含む全経路が修正版へ移り、画像処理・Preview検証が通ったら削除。                                                                                                                                                    |
| `miniflare → undici`       | `7.30.1`。Miniflare 4は7.28.0、Wrangler/plugin内のMiniflare 5は7.29.1を固定する。同じ7系の修正版へ揃える。                                                                                               | Miniflare 5の7.29.1も10月15日の[共有cache/redirect](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26)・[decompress](https://github.com/nodejs/undici/security/advisories/GHSA-55wc-3pg8-jfw6)の対象。全経路が7.30.1以上へ移り、Worker・Preview・smokeが通ったら削除。 |
| `@node-minify/core → glob` | `10.5.0`。OpenNext AWS内部のcore 9.0.2は10.3.3を固定し、[CLIのcommand injection](https://github.com/advisories/GHSA-5j98-mcp5-4vw2)の対象。同じ10系の修正版へ揃える。                                    | core 11はglobを除去しているが、推移依存だけを別メジャーへ置換しない。OpenNext側が修正版/依存除去版へ移り、Cloudflare buildが通ったら削除。10系のdeprecated警告は残り、全脆弱性を示す判定とは区別する。                                                                                        |

Miniflareのルールは親名に限定する。版別の2ルールを同時に追加した再解決ではnpm 11.19.1が4側のoverrideを落としたため、4/5双方の実際の解決結果を確認する。現時点の直接Miniflareは最新安定版4.20260730.0であり、5 betaを直接採用しない。Wrangler/pluginが内部固定するbetaはその上流構成として検査する。

OpenNext 1.20.12のpeer条件はNext `>=15.5.28 <16 || >=16.4.1`、Wrangler `^4.148.0`。採用版Next 16.4.2/Wrangler 4.151.1は条件内。Cloudflare Vitest plugin 1.4.4はVitest `^4.1.0 || ^5.0.0`を要求するため、5.0.5を使う。TypeScriptは5.9.3を採用し、Node型も実行基準の24系を使う。Storybook内部の `vite-tsconfig-paths → tsconfck 3.1.6` はTypeScript `^5.0.0` のoptional peerを持ち、6.0.3では `npm ci` と `npm ls --depth=0` が成功しても `npm ls --all` がinvalidで失敗する。MSW 3の `>=5.9.x` も満たす5.9.3へ揃え、peer条件の書換え・検査の省略で通さない。`vite-tsconfig-paths` の最新安定版6.1.1にもtsconfckが残るため、この推移依存だけを別メジャーへ強制更新しない。tsconfckを除去する7系はalphaのため、対応する安定Storybookへ移行して全階層のpeer・型・buildを確認できたらTypeScript 6以降を再評価する。[StorybookのVite 8分岐](https://github.com/storybookjs/storybook/blob/v10.6.2/code/lib/vite-plugin-storybook-nextjs/src/index.ts#L60-L82)では旧pluginを使わないが、今回は未使用という理由だけで不整合を残さない。

## auditの残件と到達性

2026-10-18時点で全件auditのhigh 10件は[bracesの再帰DoS](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)と依存元への波及集計。braces 3.0.3も対象で修正版はない。`shadcn → @shadcn/registry / fast-glob / ts-morph → micromatch → braces` と `remark-cli → unified-args → chokidar → braces` に残る。

shadcnはCSSをビルド時にimportするためdevDependenciesへ分類する。`--omit=dev` の0件だけでは安全と判断しない。Miniflare/Wrangler/Storybook等も開発端末やCIでコードを実行する。auditが返さないadvisoryもあるため、上流のsecurity情報と実際のlockfileを突き合わせる。

未信頼のglob・registryをCLIへ渡さず、信頼するリポジトリのビルド・整形に限定する。通常のアプリ入力からbracesへ到達する呼出経路は確認されていないが、非到達を全面的に証明したものではない。修正版または依存除去を追跡し再監査する。機能破壊を伴う古いshadcn/remarkへのaudit推奨ダウングレードは採用しない。

## 検証

`npm ci` と `npm ls --all` でlockfileとpeerを確認する。CIのlintジョブも `npm ls --all` を必須の検査として実行する。`npm audit --json` と `npm audit --omit=dev --json` を両方保存する。`npm outdated` の最新タグだけでメジャー移行を決めない。公式移行ガイドと利用箇所を確認し、[テスト方針](testing.md)とCIに沿って型・lint・unit・Worker・Preview・browser・Cloudflare buildを実行する。外部Google認証と本番確認は別項目として残す。
