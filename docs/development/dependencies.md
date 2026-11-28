# 依存関係の保守

読者は依存更新PRの作成者・レビュー担当者。採用する実行環境、overrideの理由と削除条件をここで確認する。直接依存・lockfile・上流修正版を更新するときに見直す。個々の実行ログとマージ判断はPRへ残す。

## Node.jsとnpm

開発・CIは `mise.toml` の `node = "26"` で、検証対象のLTSである26系の更新に追従する。2026-11-13の検証版はNode.js 26.13.1 / npm 11.20.0。`packageManager` にnpmの版を記録し、`npm ci` でlockfile v3を再現する。別のパッケージマネージャのlockfileを追加しない。`packageManager` はnpmの版を自動的に切り替える設定ではないため、`node --version` と `npm --version` も確認する。

`engines.node: ^26.13.1` を最低条件とし、`.npmrc` の `engine-strict=true` で修正前のNodeによる依存インストールを拒否する。26.13.1は26系LTSの[2026-11-10のセキュリティ修正版](https://nodejs.org/en/blog/release/v26.13.1/)。npm依存のUndiciへのoverrideでは、Node内蔵版は修正できない。

npm 11.20は依存パッケージのinstall scriptを既定で実行せず、`allowScripts` に未登録のパッケージを `npm ci` の最後に警告する。2026-11-13の時点で対象はesbuild・workerd・@ast-grep/cli・fsevents。いずれも実行ファイルをoptional dependencyから解決し、scriptなしでlint・型検査・unit/Worker/Preview/検証用テスト・Cloudflare build・smokeが成功したため、`allowScripts` へ登録しない。依存更新でscriptが必要な部品が増えた場合は、`npm install-scripts ls` で内容を確認し、必要なものだけを版指定で許可する。

完全固定は更新のたびに設定変更が必要になり、`lts` だけでは将来のLTSメジャー切替で `engines.node` と検証対象から外れる。このため26系の範囲指定を採用する。ローカルに古い26系がある場合は `mise upgrade node` で更新し、`mise exec -- node --version` で最低条件以上を確認する。将来のLTSメジャー移行は依存のengine・peer条件とCIを確認する別の変更として扱う。[miseの版指定](https://mise.jdx.dev/lang/node.html#choosing-a-version)と[NodeのLTS方針](https://nodejs.org/en/about/previous-releases)も参照。

jsdom 31.0.1のNode要件は `^22.22.2 || ^24.15.0 || >=26.0.0`、Vitest 5.0.5は `^22.12.0 || ^24.0.0 || >=26.0.0`、Wrangler 4.168.0は `>=22.12.0`であり、採用する26系は条件内。各CI runの実解決版はmiseのセットアップログで確認する。miseは条件に合う導入済みの版を優先するため、PR・pushで動く `ci.yml`・`browser.yml`・`chromatic.yml` は `jdx/mise-action@v5` の `cache_max_age_days: 1` でtool cacheを毎日作り直す。毎回GitHubのリリースからダウンロードすると配布側の一時障害（HTTP 5xx）でジョブが落ちるため、修正版への追従を最大1日遅らせる代わりにダウンロードを減らす。デプロイ・リリース記録・`pull_request_target` / `workflow_run` のworkflowは、低信頼の実行が書いたcacheを取り込まないようcacheを使わない。tblsを使わないジョブは `install_args: node` でNodeだけを入れる。この方針は `.github/scripts/node-runtime-workflow.spec.ts` で検査する。[miseの更新仕様](https://mise.jdx.dev/dev-tools/#upgrade-tools)と[mise-actionのcache設定](https://github.com/jdx/mise-action#cache-configuration)も参照。

Node.jsはビルドと検証のホスト。公開先はworkerdであり、Nodeのバージョン指定でWorkersの互換性を保証したことにはしない。App/APIの `compatibility_date: 2026-06-01` と `nodejs_compat` を維持し、Workerテストとコンパイル済みPreviewでサービスバインディング・D1・RoomDOを検査する。[OpenNextの前提](https://opennext.js.org/cloudflare/get-started)は互換日付2024-09-23以降と `nodejs_compat`。

## Renovateによる更新PR

`renovate.json` を正本とし、方針は `.github/scripts/renovate-config.spec.ts` で検査する。Mend Renovate の GitHub App がこのリポジトリだけを対象に、日本時間9時前に更新PRを作る。npmの版は公開から3日たってから取り込み（`security:minimumReleaseAgeNpm`）、直後の取り下げや乗っ取られた版を避ける。1時間あたりのPR作成数の上限（`config:recommended` の既定は2）は外す。パッチ・マイナーをまとめたためPRの数は少なく、上限があると朝の時間帯に作られずに翌日へ持ち越されるため（2026-11-17に発生）。同時に開くPRの上限は既定の10のまま。

まとめPRの対象は `package.json` の依存（dependencies・devDependencies）、npm本体（`packageManager`）、`mise.toml` の開発ツール（tbls等）。

| 更新                               | 扱い                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0以上のパッチ                    | 1つのPRにまとめる。developの必須チェック（`ci.yml` の lint・test・build・smoke と `browser.yml` の browser）が最新headで成功した後に取り込む                                                        |
| 1.0以上のマイナー                  | パッチとは別の1つのPRにまとめ、パッチと同じく必須チェックの成功後に取り込む。CIで分からない破壊的変更・挙動変更は、本番公開時にreleaseスキルがリリースノートから確かめる                            |
| 0.xの更新                          | 部品ごとのPR。0.xはマイナーでも破壊的変更を含みうるため自動マージせず、エージェントが下の「エージェントによるレビュー」の手順で取り込む                                                             |
| メジャー                           | 承認を待たずに部品ごとのPRを作り、自動マージせずエージェントがレビューして取り込む。TypeScript 6/7だけは #738 の条件を満たすまでDependency Dashboard（Renovateが作るIssue）で承認した時だけPRを作る |
| Wrangler・Vitest plugin・Miniflare | 3つを1つのPRにまとめ、パッチ・マイナーは必須チェックの成功後に取り込む。直接のMiniflareはbetaの版にも追従する（下の「Miniflareの版」）                                                              |
| `overrides` の固定版               | Dashboard で承認した時だけPRを作る。lockfile にある別の版と比べるため、メジャーをまたぐ更新もパッチと誤判定されることがある。削除・更新は下の「限定override」の条件で判断する                       |
| 脆弱性の修正                       | Dependabotのアラートを元にRenovateが予定外でもPRを作る。Dependabot security updatesは二重PRを避けるため無効のまま                                                                                   |

依存更新PRには `dependencies` ラベルが付く。CIが失敗したPRと、自動マージしない0.x・メジャーのPRは、1時間動きが無ければbuildループが拾い、下の「エージェントによるレビュー」の手順でマージまで進める（[ループ開発の「人の判断待ちにしない PR」](../loop/README.md#人の判断待ちにしない-pr)）。Renovateのマージはdevelopへのマージ通知（Discord）から外す。developへの取り込みと本番公開は別で、本番公開は既存のリリース手順で人が行う。

1.0以上のパッチとマイナーは、GitHubのauto-mergeで必須チェックの成功を待って取り込む。マイナーは当初「代表E2Eを整えた後に広げる」としていたが、developへの取り込みは本番公開と別であり、公開前に確かめる場があるため先に広げた。導入時の最初のまとめPR #1000 では、`overrides` の誤判定・OpenNextの設定変更・optional peerの不足で必須チェックが失敗し、取り込まれずに止まった。自動マージが失敗のまま取り込んだ場合は、`automerge` を `false` に戻して原因を調べる。

まとめPRは1つの部品の失敗で全体が止まる。#1000と同じく、必要な修正をそのブランチへ足すか、developで先に直してから取り込む。すぐに直せない部品は `packageRules` で一時的にまとめから外し、外した理由と戻す条件をこの文書に書く。

### エージェントによるレビュー

依存更新は人が管理する手間をなくすための仕組みなので、PRを人が1件ずつ見て承認する前提にしない。自動マージしないPR（0.x・メジャー）は、エージェントがレビューしてマージまで進める。人はマージ通知と、止めたPRの報告だけを見る。

1. リリースノート・移行ガイドの破壊的変更を、このリポジトリでの使い方（`git grep` で探した利用箇所、workflowの入力値・イベント）と突き合わせる
2. 必要なら同じブランチで設定・コード・テストを直す。関係する部品のPRは1つにまとめてよい
3. 必須チェックと、変更範囲に応じた検証（[検証](#検証)）が成功してからマージする。`workflow_run`・`pull_request_target`・Pagesのworkflowはdefault branchの定義で動き、PRのCIでは確かめられない。マージ後の最初の実行で確認する

次の場合はマージせず、理由と再評価の条件をPRまたは関係Issueに残して人へ報告する。PRには `needs-human`（権限が無い）か `blocked`（それ以外）を付け、ループが同じPRで起き続けないようにする。これに当たらないPRを、理由を書いただけで開いたまま残さない。

- 通るようにするには、テストを広く書き換える・検査を緩める必要がある
- 開発端末やCIのツールチェーン（npm本体・Node・ランタイム）が変わり、チーム全員の手元に影響する
- 限定override・関係Issue（例: TypeScriptの #738）の条件を満たしていない
- 本番のデータ・認証・課金など、CIとPreviewでは確かめられない経路に影響する

2026-11-22にDashboardの承認待ちを処理し、GitHub Actions（#1071）と jest-dom・string-width（#1072）を取り込んだ。次の2つは止めて残している。npm 12は、取り込むと開発端末とCIのnpm本体の入れ方が変わる。TypeScript 7は #738 の条件を満たしていない。

jsdom 31（#1076）は2026-11-22に「上流の修正待ち」として残したが、2026-11-27に取り込んだ。unit 24件の失敗は不具合ではなく、新しいCSS実装がcomputed styleを仕様どおりに返すようになったことによる（`var()` は解決後の値になり、文書から外れた要素では空になる）。製品コードは変えず、Reactが渡した式を確かめるテストを `toHaveInlineStyle`（[vitest.setup.ts](../../vitest.setup.ts)）へ移し、computed styleを読むロジックのテストでは要素を文書へつないだ。「上流待ち」で残す前に、失敗が上流の不具合か、こちらのテストの前提かを切り分ける。

## 限定override

2026-11-28時点で `overrides` は無い。脆弱な推移依存を修正版へ置き換える必要が出たら、アプリ全体への強制置換はせず、親パッケージ配下だけへ適用し、採用値・理由・削除条件をこの節に書く。削除を判断するときは、そのルールだけを別worktreeで外して再解決し、`npm explain`、`npm ls --all`、全件auditと関連テストを確認する。

`@node-minify/core → glob`（10.5.0）は2026-11-27に外した（#739）。OpenNext AWS 4.2.0が使うcore 10.5.0はglobに依存しなくなり、適用先が無くなった。外す前後でlockfileの解決結果とauditは変わらない。

OpenNext 1.20.12のpeer条件はNext `>=15.5.28 <16 || >=16.4.1`、Wrangler `^4.148.0`。採用版Next 16.4.2/Wrangler 4.151.1は条件内。Cloudflare Vitest plugin 1.4.4はVitest `^4.1.0 || ^5.0.0`を要求するため、5.0.5を使う。TypeScriptは `typescript` に5.9.3、型検査用の `@typescript/native` に7.0.2を併用し（下の「TypeScript 7の併用」）、Node型も実行基準の26系を使う。Storybook内部の `vite-tsconfig-paths → tsconfck 3.1.6` はTypeScript `^5.0.0` のoptional peerを持ち、6.0.3では `npm ci` と `npm ls --depth=0` が成功しても `npm ls --all` がinvalidで失敗する。MSW 3の `>=5.9.x` も満たす5.9.3へ揃え、peer条件の書換え・検査の省略で通さない。`vite-tsconfig-paths` の最新安定版6.1.1にもtsconfckが残るため、この推移依存だけを別メジャーへ強制更新しない。tsconfckを除去する7系はalphaのため、対応する安定Storybookへ移行して全階層のpeer・型・buildを確認できたらTypeScript 6以降を再評価する。[StorybookのVite 8分岐](https://github.com/storybookjs/storybook/blob/v10.6.2/code/lib/vite-plugin-storybook-nextjs/src/index.ts#L60-L82)では旧pluginを使わないが、今回は未使用という理由だけで不整合を残さない。

Biome 2.6からMarkdownも整形・lint対象になったが、Markdownはこれまでどおり `npm run format:md`（remark）に任せ、`biome.json` の `markdown` で無効にする。2つの整形が同じファイルを別の形へ書き換え合うのを避けるため。YAML・CSSはBiomeの整形に揃える。

`diff` はアプリから直接使わないが、devDependenciesに `^9.0.0` を置く。OpenNext 1.20.16 と同梱の `@opennextjs/aws` 4.1.15 は `diff ^9.0.0` を optional peer に持ち、shadcn・Storybook が使う diff 8 がルートに置かれると `npm ls --all` がinvalidで失敗するため。peer条件の書換え・検査の省略では通さない。shadcnとStorybookがdiff 9へ移るか、OpenNextがこのpeerを外したら削除する。

## TypeScript 7の併用

2026-11-28から型検査（`npm run typecheck`）だけをTypeScript 7（Go製のネイティブ版）で回す（#738）。TypeScript 7はJSのCompiler APIを持たず、`typescript` を7にするには上のtsconfckのpeerを書き換えるしかないため、[公式の併用方法](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)にならって2つを分ける。

| パッケージ                                      | 版    | 使う所                                                                                                                                                                                           |
| ----------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@typescript/native`（`npm:typescript@^7.0.2`） | 7.0.2 | `npm run typecheck`（app・workers・scripts の3つの tsconfig）、`npm run tsc -- <引数>`、Stopフックの型検査、CIのlintジョブ                                                                       |
| `typescript`                                    | 5.9.3 | Compiler APIを読む部品（Storybook内部のtsconfck・MSW・Storybookのdocgen）、`next build` の型検査（Nextは `typescript/package.json` の `tsc` を実行する）、エディタのtsserverとNextのTSプラグイン |

- 2つとも `tsc` という実行ファイルを持つ。`node_modules/.bin/tsc` がどちらを指すかに頼らず、scriptsでは `node node_modules/@typescript/native/bin/tsc` を直接呼ぶ。
- 型検査の時間（M4・Node 26.13.1、3回の中央値）：`npm run typecheck` は初回 9.9s→2.4s、2回目 5.2s→1.4s。アプリの tsconfig は初回 6.5s→1.3s。3つの tsconfig とも診断は変わらない（エラー0、故意に入れた型エラーは3つとも検出）。
- エディタはNextのTSプラグインが動く5.9.3のtsserverのまま。TypeScript 7の言語サーバーはプラグインに対応していない。
- 撤去条件：Storybookの安定版が11になり、tsconfckのpeerがTypeScript 7を許したら、`typescript` も7へ上げて `@typescript/native` を外す（#738）。

## Miniflareの版

Miniflare配下の `sharp`（0.35.5）・`undici`（7.30.1）は2026-11-28に外した（#739）。直接採用していたMiniflare 4.20260730.0は脆弱な版（sharp 0.35.2・undici 7.28.0）を固定していたが、Miniflare 4は2026-07以降更新が無く、Wrangler・Cloudflare Vitest pluginはすでにMiniflare 5を同梱しているため、上流を待っても解けなかった。直接依存のMiniflareをWrangler 4.168.0・Vitest plugin 1.9.2が固定する版（5.20261123.1-beta）へ揃え、lockfileのMiniflareを1つにした。Miniflare 5は修正版のsharp 0.35.5・undici 7.30.2を指す。外す前後でauditはhigh 2・moderate 15のまま。

直接のMiniflareは [scripts/preview-smoke.mts](../../scripts/preview-smoke.mts) だけが使う。Miniflare 5は設定の形が変わったため、4の形の設定を `convertV4MiniflareOptions` で変換し、廃止された `createFetchMock` の代わりに `outboundService` でテストIdPの公開鍵だけに答える。直接のMiniflareは、WranglerとVitest pluginの `dependencies.miniflare` と同じ版へ揃える。Miniflare 5はnpmのbetaタグで公開されるため、[renovate.json](../../renovate.json) ではbetaへ追従させ、Wrangler・Vitest pluginと同じPRにまとめる。版のずれは [miniflare-version.spec.ts](../../.github/scripts/miniflare-version.spec.ts) で検査する。

## auditの残件と到達性

2026-11-21時点で `--omit=dev` は0件、全件auditはhigh 2・moderate 15。10月に残件だった[bracesの再帰DoS](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)は10月23日に取り下げられた。同じ日に、範囲内で直せるbody-parser 2.4.0・fast-uri 3.1.9・systeminformation 5.33.23・glob 13.0.7へlockfileを更新した。残りは次の3系統で、どれも依存元の対応を待つ。

| 対象と経路                                                                                                                           | 残る理由                                                                                                                                                                                                                                                                              | 到達性                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [zodの配列検証のメモリ枯渇](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。`@google/design.md 0.4.0 → zod 3.25.76`              | 修正は4.6.6以降だけで3系の修正版はない。上流はzod 4へ移した0.4.1をマージ済み（[#185](https://github.com/google-labs-code/design.md/pull/185)）だが、2026-11-28時点でnpmは0.4.0のまま（[#200](https://github.com/google-labs-code/design.md/issues/200)）。0.4.1が公開されたら更新する | `lint:design`・`gen:design-tokens` がリポジトリ内のDESIGN.mdだけを検証する。アプリの `contracts/` は修正済みのzod 4.6.7を使う |
| [minimatchのパターン増幅DoS](https://github.com/advisories/GHSA-g3hv-75wg-m249)。shadcn・remark-cli配下の9.0.9・10.2.6               | 修正は11.0.1以降だけで9・10系の修正版はない                                                                                                                                                                                                                                           | 影響は利用側が `optimizationLevel` 2以上で未信頼のパターンを渡した場合。CLIへ渡すのはリポジトリ内の固定パターンだけ           |
| [globの中断後の走査継続](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)。OpenNext・Storybook配下の13.0.7、remark-cli配下の10.5.0 | 13.0.7は修正コミット[d94a8c8](https://github.com/isaacs/node-glob/commit/d94a8c8d0a)を取り込み済みだが、advisoryの範囲（`<=14.0.1`）が未更新のためauditに残る。10系は修正版がない                                                                                                     | 影響は `signal` で走査を打ち切る呼出し。ビルド・整形ツールが信頼するリポジトリを走査するだけで、アプリ入力から到達しない      |

shadcnはCSSをビルド時にimportするためdevDependenciesへ分類する。`--omit=dev` の0件だけでは安全と判断しない。Miniflare/Wrangler/Storybook等も開発端末やCIでコードを実行する。auditが返さないadvisoryもあるため、上流のsecurity情報と実際のlockfileを突き合わせる。

Next.jsはReactのServer Components実装を同梱するため、`react-server-dom-*` の脆弱性はルートのreact版だけで判断しない。2026-11-10の[RSCのRCE](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3)では、Next 16.4.6の同梱版に修正版19.3.1と同じ修正が入っていることを確認した。

未信頼のglob・registryをCLIへ渡さず、信頼するリポジトリのビルド・整形に限定する。上の残件へ通常のアプリ入力から到達する呼出経路は確認されていないが、非到達を全面的に証明したものではない。修正版または依存除去を追跡し再監査する。機能破壊を伴う古いshadcn/remarkへのaudit推奨ダウングレードは採用しない。

## 検証

`npm ci` と `npm ls --all` でlockfileとpeerを確認する。CIのlintジョブも `npm ls --all` を必須の検査として実行する。`npm audit --json` と `npm audit --omit=dev --json` を両方保存する。`npm outdated` の最新タグだけでメジャー移行を決めない。公式移行ガイドと利用箇所を確認し、[テスト方針](testing.md)とCIに沿って型・lint・unit・Worker・Preview・browser・Cloudflare buildを実行する。外部Google認証と本番確認は別項目として残す。
