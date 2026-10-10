# Issue #362：Preview環境の設定・確認台帳

対象：[Issue #362](https://github.com/engineer-first/idea-boost/issues/362)。実環境の権限・Secret・契約の担当範囲は [#360](https://github.com/engineer-first/idea-boost/issues/360)。この台帳は今回の調査・操作の証拠であり、現行手順の正本は `docs/operations/preview.md` に置く。

記録更新：2026-10-10 07:41:39 UTC（16:41:39 JST）。過去の操作で時刻を採取していないものは日付のみを記載する。

## 現在の到達点

| 対象                        | 状態     | 確認できたこと                                                                |
| --------------------------- | -------- | ----------------------------------------------------------------------------- |
| リポジトリの本番設定        | 読取済み | App、API、D1、RoomDOの設定・公開経路                                          |
| GitHubの既存設定            | 読取済み | 本番Cloudflare用Secret名と本番URL variableが存在                              |
| Cloudflare認証              | 読取済み | Wrangler OAuth認証。Workersの既存契約を確認・契約変更なし。Zero Trust未利用   |
| ローカル依存                | 変更済み | Wrangler 4.107.0 → 4.149.0。OpenNext 1.20.1は継続                             |
| ローカル実装                | 検証済み | Preview24件、unit2710件＋追加5件を個別成功。Worker913件、verification32件成功 |
| Preview用Cloudflareリソース | 一部作成 | Preview D1作成・既存9migration適用済み。Access、API、RoomDO未公開             |
| GitHub Preview設定          | 設定済み | `PREVIEW_D1_ID`とSecret3つを登録。`PREVIEW_ENABLED`未設定で自動公開は無効     |
| Previewデプロイ／実利用     | 未実施   | Google本人ログイン、別メンバー参加、実WSは未検証                              |
| 本番公開                    | 未実施   | PR作成・developへのマージと本番releaseは別                                    |

「設定ファイルに接続先がある」「CLIで認証できる」と「実環境で設定・疎通を確認した」は区別する。既存本番設定の読取りは、今回の本番リソース変更を意味しない。

## 操作記録

| No. | 日時                       | 操作・対象                                          | 結果・証拠                                                                                                                                                                                                                                                                                                        | Cloudflare実環境への変更                      |
| --- | -------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 01  | 2026-10-10（時刻未採取）   | `gh issue view`：#362、#360                         | #362はPRごとのAppと共通Preview API／D1／RoomDOを採用。実環境の権限・Secret・契約は#360で扱う                                                                                                                                                                                                                      | なし・読取のみ                                |
| 02  | 2026-10-10（時刻未採取）   | `gh secret list`：GitHub repository Secretの名前    | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`は既存。Preview専用Secretは未設定。値は取得・保存しない                                                                                                                                                                                                            | なし・読取のみ                                |
| 03  | 2026-10-10（時刻未採取）   | `gh variable list`：GitHub repository variable      | `NEXT_PUBLIC_SITE_URL`は本番用のみ                                                                                                                                                                                                                                                                                | なし・読取のみ                                |
| 04  | 2026-10-10（時刻未採取）   | `wrangler whoami`：CLI認証の確認                    | OAuth認証に成功。所属アカウントは2件。表示scopeにAccess管理scopeは列挙されない。Access操作可否は未確定                                                                                                                                                                                                            | なし・読取のみ                                |
| 05  | 2026-10-10（時刻未採取）   | Wrangler依存を更新：作業ブランチ `codex/pr-preview` | 4.107.0 → 4.149.0。Workers Previewsの必要版4.135.0以上を満たす。OpenNextは1.20.1を継続。ローカルインストール完了                                                                                                                                                                                                  | なし・ローカル変更のみ                        |
| 06  | 2026-10-10（時刻未採取）   | 本番設定・CI・運用資料の読取                        | `wrangler.jsonc`、`workers/wrangler.jsonc`、`.github/workflows/ci.yml`／`deploy.yml`、`docs/operations/release.md`／`access.md`                                                                                                                                                                                   | なし・読取のみ                                |
| 07  | 2026-10-10 06:12:50 UTC    | 台帳・構成図の制作開始                              | 図は「現行のリポジトリ設定」と「未デプロイのPreview計画」を別ページにする                                                                                                                                                                                                                                         | なし・ローカル成果物のみ                      |
| 08  | 2026-10-10（時刻未採取）   | Preview専用Wrangler設定を追加                       | App `idea-boost-preview-app`、API `idea-boost-preview-api`、D1 `idea-boost-preview-lobby`、`PreviewRoomDO`。App/APIの `workers_dev`／`preview_urls` はfalse。D1 IDはplaceholder                                                                                                                                   | なし・ローカル設定のみ                        |
| 09  | 2026-10-10（時刻未採取）   | ローカル実装・Preview Worker poolを検証             | strictな14step contract、APIのdev assertion拒否、Access JWTのRS256署名／issuer／audience／期限／メール許可、Preview専用Cookie・本番Cookie無視、全14step本人seed・他参加者0付箋を確認。20件成功                                                                                                                    | なし・ローカルテストのみ                      |
| 10  | 2026-10-10（時刻未採取）   | 認可レビューの指摘を再現・修正                      | WS same-origin検査の欠落を否定系テストで再現（期待403に対し200）。Origin検査を追加し、同テストがgreen                                                                                                                                                                                                             | なし・ローカル修正のみ                        |
| 11  | 2026-10-10（時刻未採取）   | CI設計レビューを反映                                | build／publishを別runner・jobへ分離。公開直前にCI runのattempt／status／conclusionを再検査する実装へ変更                                                                                                                                                                                                          | なし・workflow実行は未確認                    |
| 12  | 2026-10-10（時刻未採取）   | rootのtypecheckと隔離検証                           | rootでは今回と無関係なignored `akapen/preview-use-cases.spec.ts` の型エラー。`/tmp/idea-boost-preview-verify` に `59bfcff`＋今回差分を移して検証・ビルド中（node\_modulesはsymlink）                                                                                                                              | なし・本番更新なし                            |
| 13  | 2026-10-10（時刻未採取）   | HTML報告と公式draw\.io viewerでの実描画             | `preview-report.html`にXMLを埋込み。desktop 1280px／mobile 390pxでスクリーンショット確認。図の線ラベル重なりを修正して再生成。JavaScriptエラー0件、ページの横はみ出しなし                                                                                                                                         | なし・ローカル成果物のみ                      |
| 14  | 2026-10-10（時刻未採取）   | Preview・unit・Workerのテスト                       | Preview：2 suite／21件成功。unit：193 files／2710件成功。Worker：35 files／913件成功                                                                                                                                                                                                                              | なし・ローカルテストのみ                      |
| 15  | 2026-10-10（時刻未採取）   | 実WebSocket通信を追加検証                           | ownerのprivate付箋12枚がmemberには0枚として配信。member本人が付箋を1枚作成し、再参加して1枚保持することを確認                                                                                                                                                                                                     | なし・ローカルWorker通信のみ                  |
| 16  | 2026-10-10（時刻未採取）   | AppのPreview URL設定を修正                          | Wrangler sourceでApp `preview_urls: false`だとWorkers PreviewsのURLも生成されないことを確認。config testをredで確認してAppだけtrueへ修正。APIはfalseを維持、App `workers_dev`もfalse。全Preview URLはgatewayで認証                                                                                                | なし・ローカル設定のみ                        |
| 17  | 2026-10-10（時刻未採取）   | 隔離worktreeの型・lint・ビルド                      | `npm run typecheck`成功（cf-typegen、Next／Worker／scriptsの3つのtsc）。`npm run lint`成功（772 files、0 errors）。`npm run build:preview`成功（Next16.2.9、OpenNext1.20.1、Wrangler4.149）                                                                                                                       | なし・ローカル検証のみ                        |
| 18  | 2026-10-10（時刻未採取）   | 隔離ビルド環境を修正                                | 初回は外向きnode\_modules symlinkをTurbopackが拒否。隔離worktreeで `npm ci` を実行して解消し、ビルドが成功。プロダクト実装の不具合ではなくローカル環境原因                                                                                                                                                        | なし・ローカル環境のみ                        |
| 19  | 2026-10-10（時刻未採取）   | ローカルUIを実ブラウザで検証                        | 1440×1000／390×844で14個のstep button、横はみ出しなし、失敗時alertと再試行可能を確認。step IDとlabelの重複表示を修正                                                                                                                                                                                              | なし・ローカルUIのみ                          |
| 20  | 2026-10-10（時刻未採取）   | CIレビューのキャッシュ指摘を修正                    | build／publishのjob・runner分離に加え、Previewの全jobでmise `cache: false`。未信頼buildが使ったcacheをSecret使用jobへ持ち込まない構成                                                                                                                                                                             | なし・workflow実行は未確認                    |
| 21  | 2026-10-10 15:32〜34 JST頃 | ユーザーから実環境設定の明示許可                    | 既存契約内でPreview実環境を設定する許可と、許可するGoogleメール2名を確認。メールはSecretの許可一覧へ保存し、台帳へ値を複製しない                                                                                                                                                                                  | 許可確認のみ                                  |
| 22  | 2026-10-10 15:32〜34 JST頃 | 既存AccountのD1一覧を読取                           | Wrangler OAuthで一覧を確認。Preview D1は未存在で、本番と別の既存DBのみ                                                                                                                                                                                                                                            | なし・読取のみ                                |
| 23  | 2026-10-10 15:32〜34 JST頃 | Preview D1を新規作成                                | `npx wrangler d1 create idea-boost-preview-lobby --config workers/wrangler.jsonc` 成功。新規Preview D1だけ作成。本番D1は変更していない                                                                                                                                                                            | Preview D1新規作成                            |
| 24  | 2026-10-10 15:32〜34 JST頃 | GitHub Repository variableを設定                    | `PREVIEW_D1_ID` を新規D1のIDで設定成功。不要なIDは図・台帳へ複製しない                                                                                                                                                                                                                                            | Cloudflareへの追加変更なし・GitHub設定        |
| 25  | 2026-10-10 15:32〜34 JST頃 | GitHub Repository Secretsを設定                     | 独立ランダム値の `PREVIEW_SESSION_SECRET`／`PREVIEW_PROBE_TOKEN` と、ユーザー指定2名の `PREVIEW_ALLOWED_EMAILS` を設定成功。値は非表示。Workerへの登録・反映は未実施                                                                                                                                              | Cloudflareへの追加変更なし・GitHub Secret設定 |
| 26  | 2026-10-10（時刻未採取）   | Access・契約の読取調査                              | 既存ブラウザのCloudflareログインから読取中。Access設定はまだ行っていない。既存契約情報はチーム限定で確認中                                                                                                                                                                                                        | なし・読取のみ                                |
| 27  | 2026-10-10（時刻未採取）   | CIの信頼境界を最終変更                              | 通常の `pull_request` CIでPR buildとartifact保存を行い、`workflow_run` は成果物取得だけに変更。未信頼buildによるdefault branch scopeのcache汚染を避ける                                                                                                                                                           | なし・workflow実行は未確認                    |
| 28  | 2026-10-10（時刻未採取）   | Preview D1へ既存migrationを適用                     | developの既存9migration（0001〜0009）をPreview D1へremote適用成功。SQL差分はなく、新スキーマ追加や本番への適用は行っていない                                                                                                                                                                                      | Preview D1への既存migration適用               |
| 29  | 2026-10-10（時刻未採取）   | 自動公開の有効化状態を確認                          | GitHubはD1 ID variableとSecret3つの登録まで。`PREVIEW_ENABLED` は未設定のため自動公開を無効のまま維持                                                                                                                                                                                                             | GitHub登録のみ・Worker公開なし                |
| 30  | 2026-10-10（時刻未採取）   | CI tokenの暫定経路を実装                            | workflowは既存CIの `CLOUDFLARE_API_TOKEN` をfallbackとして再利用。権限拡張なし、新token発行なし。所有形態・実CI権限は未照合                                                                                                                                                                                       | なし・ローカルworkflowのみ                    |
| 31  | 2026-10-10（時刻未採取）   | Cloudflare Workers契約を管理画面で確認              | Workersの既存契約を確認。契約変更なし。対象Accountの契約名・実料金はチーム限定記録へ分離                                                                                                                                                                                                                          | なし・読取のみ                                |
| 32  | 2026-10-10（時刻未採取）   | Zero Trust導入状態とplan画面を確認                  | Zero Trustは未利用。Get started → Choose a planでFreeを含む製品plan一覧を表示。どのplanもSelectしていない                                                                                                                                                                                                         | なし・未登録                                  |
| 33  | 2026-10-10（時刻未採取）   | Access設定前で停止                                  | 新規Zero Trust登録が必要で、ユーザー許可の「既存契約内」を超えるため登録前に停止。Google IdP／Service Token／Access policyは作成0件                                                                                                                                                                               | なし・新規契約・Access変更なし                |
| 34  | 2026-10-10（時刻未採取）   | 公開条件を確認                                      | 共通APIは品質確認済みdevelopからのみ公開する要件。PR merge後にdeployする。今回mergeは未依頼なので実施せず、API／App／RoomDOも未公開                                                                                                                                                                               | なし・公開なし                                |
| 35  | 2026-10-10（時刻未採取）   | 追加ローカル検証                                    | verification32件成功。Preview21件と既存allUnit2710件成功。新CI gateテスト1件は後続で成功確認。App Worker bundle dry-run成功（8.7MB／gzip1.8MB）                                                                                                                                                                   | なし・ローカルテスト・bundleのみ              |
| 36  | 2026-10-10（時刻未採取）   | Preview本人同期の期限上限をTDDで修正                | 本人同期が45秒遅延してもsession期限が元のAccess JWTを超えないこと、75秒遅延で期限切れを拒否することを否定系redで確認。絶対期限の上限を修正してgreen。Preview23件成功                                                                                                                                              | なし・ローカル実装・テストのみ                |
| 37  | 2026-10-10（時刻未採取）   | 関連テスト・型・lint・buildを再確認                 | 既存auth／token47件再実行成功。新CI gate1件、PreviewConsoleの作成・二重操作防止・timeout後の日本語案内と再試行2件が個別成功。既存unit2710件全体成功と区別する。最新隔離typecheck／lint775 files／build／bundle dry-runも成功                                                                                      | なし・ローカル検証のみ                        |
| 38  | 2026-10-10（時刻未採取）   | Preview D1をread-onlyで確認                         | migration\_count=9、user\_count=0を確認                                                                                                                                                                                                                                                                           | なし・読取のみ                                |
| 39  | 2026-10-10（時刻未採取）   | 自動操作ログを整備                                  | Cloudflare操作のログはUTC日時・対象・開始／成功／失敗だけをJSONで記録。Secretが混じり得る生stdout／errorを出力しない。PR案内へActionsログURLを追加する実装                                                                                                                                                        | なし・ローカルworkflow実装のみ                |
| 40  | 2026-10-10（時刻未採取）   | 公開記録のprivacy確認                               | 対象Accountの実契約名・実料金を公開台帳／HTML／PNGから除去し、チーム限定のリポジトリ外記録へ分離。公開記録は既存Workers契約確認・契約変更なし、Zero Trust未利用・plan未選択まで                                                                                                                                   | なし・公開成果物の整理のみ                    |
| 41  | 2026-10-10（時刻未採取）   | ログアウトの否定系とUI関連を追加検証                | Secure属性付きCookieを削除し、自動再発行しないテストを追加。Preview24件成功、既存auth／Preview UI対象53件成功。unit2710件全体に加えCI1件／UI2件／signout2件を個別成功。一括2715件の再実行結果とは記録しない                                                                                                       | なし・ローカル実装・テストのみ                |
| 42  | 2026-10-10（時刻未採取）   | ログアウトの実装                                    | Accessの `/cdn-cgi/access/logout` へ移動してSSOを終了する経路を実装。公開実環境でのSSO終了は未検証                                                                                                                                                                                                                | なし・ローカル実装のみ                        |
| 43  | 2026-10-10 07:10 UTC頃     | Access公式仕様を照合                                | 単一WorkerのPreview限定保護は `preview_worker`／Previews onlyで設定可能。ただし同じ公式資料にWorker-level AccessはWebSocket非対応、upgradeが403になりhostname-based保護を推奨と明記。後続No.46でhostname-based方式の公式仕様を照合                                                                                | なし・公式資料の読取のみ                      |
| 44  | 2026-10-10（時刻未採取）   | 初期公開順を最終整理                                | hostname-based方式ではWorker IDが不要なのでApp親Workerの事前deployは不要。既存Account subdomainを確認して先にAccessを設定し、aud等を登録。品質確認済みdevelopからAPIdeploy後にPR Previewを公開する。Preview CLIは初回に親Workerを自動作成。Account全体のProtect Allは使わない                                     | なし・まだ実公開なし                          |
| 45  | 2026-10-10（時刻未採取）   | 構成図の境界配置を修正                              | 本番のApp／API／D1／RoomDOをCloudflare Network内の別リソースへ移動。Previewとは接続線なし。Browser／GoogleはNetwork外を維持                                                                                                                                                                                       | なし・構成図のみ                              |
| 46  | 2026-10-10 07:21 UTC頃     | hostname-based方式の公式仕様を照合                  | Accessのsubdomain先頭／末尾partial wildcard対応と、Workersのworkers.dev保護・WebSocket向けhostname-based方式を公式資料で確認。`*-idea-boost-preview-app.<account-subdomain>.workers.dev` を1つのself\_hosted applicationで保護する最終案。通常PR prefixと固定deployment prefixを対象にし、実際の両URL／WSは未検証 | なし・公式仕様の読取のみ                      |
| 47  | 2026-10-10（時刻未採取）   | CI healthと本人ログインを分離                       | 同じAccess applicationにServiceAuth policyを追加する案。gatewayはprobe tokenを `/api/health` だけで受ける。通常API／WSはsubとemailを持つGoogle JWTが必要で、service identityだけでは本人としてログイン不可                                                                                                        | なし・まだAccess設定なし                      |

先行操作とNo.09〜12・14〜42・44・47の結果は主担当からの報告を収集した。台帳担当が直接読んだ設定・資料はNo.06・08・43・46、制作はNo.07・45。新しい実操作は結果を取得してから追記する。

### 検証の種類と限界

| 種類                 | 結果                                                                                                                                                                                                                | 確認していないこと                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 設定の読取・静的実装 | Preview専用設定と本番分離をローカルで確認。CIを通常pull\_request build／workflow\_run artifact取得に分離。最新CI再検査・全Preview jobでmise cache falseを実装                                                       | GitHub Actions上での公開・close／reopen・競合の実動作                                   |
| ローカルWorker pool  | Preview24件、verification32件、unit2710件全体＋CI gate1件／console2件／signout2件を個別成功、auth／Preview UI対象53件再実行成功、Worker913件成功。署名・期限・許可メール・Cookie分離・14step seed・参加者の付箋分離 | Cloudflare実環境・Google実ログイン・別の人の2ブラウザ操作                               |
| 否定系テスト         | WS Origin欠落をredで再現し、修正後green                                                                                                                                                                             | 公開Preview URL・固定版URL・他入口すべての実認証                                        |
| 型・ビルド           | 隔離worktreeでtypecheck、lint（最新775 files／0 errors）、build:previewとbundle dry-runがすべて成功。rootの既存ignored資料は変更していない                                                                          | GitHub Actions上の実行・Cloudflare公開ビルドは未確認                                    |
| 実WebSocket通信      | ローカルWorkerでprivate付箋のowner12枚／member0枚、member本人作成、再参加後1枚保持を確認                                                                                                                            | 実環境の複数人通信                                                                      |
| ローカルUI実ブラウザ | 1440×1000／390×844で14ボタン・横はみ出しなし・失敗alert後の再試行を確認                                                                                                                                             | 実Googleログイン・公開Previewでの操作                                                   |
| 本番／Preview実環境  | 新規Preview D1作成・既存9migration適用。GitHub variable／Secret3つ登録。自動公開無効。本番変更なし                                                                                                                  | Zero Trust新規登録の許可、Access、WorkerへのSecret反映、API／PR App公開・実CI token権限 |

## 現行の本番設定

| 項目            | 設定・意味                                                                                | 確認元                                                    |
| --------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| App Worker      | `idea-flow-app`。Next.js / OpenNext。custom domainは `ideaboost.dev`。`workers_dev: true` | `wrangler.jsonc`                                          |
| APIへの接続     | `API_WORKER` → `idea-flow-api`。`/api/*`とWebSocketをAppから転送                          | `wrangler.jsonc`、`workers/app-worker.ts`                 |
| API Worker      | `idea-flow-api`。D1とRoomDOへの入口                                                       | `workers/wrangler.jsonc`                                  |
| D1              | `DB` → `idea-flow-lobby`。ユーザー・権限・招待・横断投影                                  | `workers/wrangler.jsonc`、`docs/architecture/overview.md` |
| Durable Objects | `ROOM_DO` → `RoomDO`。1ルームごとの共有状態                                               | 同上                                                      |
| 定期処理        | APIのcronは `0 * * * *`                                                                   | `workers/wrangler.jsonc`                                  |
| 認証            | Google OIDC、HS256のセッションCookie。App／APIの保護境界で検証                            | `docs/architecture/overview.md`                           |

## 新しいPreview構成：計画と実状態

D1は作成・既存9migration適用済み（read-only確認でmigration\_count=9／user\_count=0）、GitHubの専用設定も登録済み。Access・Worker・公開経路はまだ実環境へ反映していない。各行の状態を区別する。

| 項目                | 計画する設定                                                                                                                      | 実環境の確認状況                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| PR App              | PRごとのWorkers Preview。AppコードだけがPR版                                                                                      | 未デプロイ                                                                                  |
| Preview API         | `idea-boost-preview-api`。品質確認済みdevelopから通常デプロイし、PRで上書きしない                                                 | 未作成                                                                                      |
| D1                  | `idea-boost-preview-lobby`。本番D1とは別                                                                                          | 作成済み。IDはGitHub `PREVIEW_D1_ID`へ設定。既存9migration（0001〜0009）適用済み            |
| Durable Objects     | `PreviewRoomDO` namespace。本番と別。ルームごとの状態を保持                                                                       | 未作成                                                                                      |
| Service Binding     | PR Appの `API_WORKER` をPreview APIへ向ける。本番APIの名前を流用しない                                                            | 実設定・接続は未確認                                                                        |
| 認証入口            | Cloudflare AccessでGoogle本人ログインとメール許可。App gatewayで署名・issuer・audience・期限を検証                                | 許可メール2名は確定・GitHub登録済み。Zero Trust未導入のため新規登録の確認待ち。Access未設定 |
| App/APIの本人・許可 | Preview用 `SESSION_SECRET` でgoogle kindのlogin assertionを作り、APIが本人UUIDを同期。App/API双方が許可メールを検証               | ローカル否定系成功・実環境は未検証                                                          |
| Cookie              | `__Host-idea_boost_preview_session`。Appで内部既存Cookieへ変換。ホストごとに本番と分離                                            | ローカル本番Cookie無視を確認。別PR／別入口は未検証                                          |
| App/APIの公開入口   | App：`workers_dev: false`／`preview_urls: true`でPR Preview URLを生成しgatewayで認証。API：両方falseでService Bindingだけから呼ぶ | ローカル設定済み・実環境へ未反映                                                            |
| サンプル            | 全14ステップから新規ルームを作成。作成者が本人host。他の参加者の未共有付箋は空                                                    | ローカル14step・他参加者0付箋を確認。別人実操作は未検証                                     |
| 片付け              | PRを閉じたら該当Appだけ終了。共通API／D1／他PR・他ルームは残す                                                                    | 手順・実動作は未確認                                                                        |

GitHub repositoryには `PREVIEW_D1_ID` variable、`PREVIEW_SESSION_SECRET`／`PREVIEW_PROBE_TOKEN`／`PREVIEW_ALLOWED_EMAILS` Secretsを設定済み。Secret値は記録しない。Workerへの反映は未実施。秘密値入りの一時ファイルは台帳担当が読まない。

Secret値、API token、認証Cookie、不要なアカウントIDは記録しない。新しいSecretの登録時は、名前・設定先・登録結果だけを追記する。

## Access設定を止めた理由と再開条件

Workersの既存契約を確認し、契約変更は行っていない。対象Accountの契約名・実料金はチーム限定記録に残す。一方、Zero Trustは未導入で、Accessには新規登録が必要。ユーザーの許可は「既存契約内」であるため、新規Zero Trust登録前で停止した。Freeも含めどのplanもSelectしていない。

一般公開のZero Trust Free製品情報は$0/seat/month、50 seats、24h log。今回Freeを契約済みという意味ではなく、どのplanも未選択。24h logはZero Trustのログ表示であり、D1やルームデータの保持期限ではない。

再開にはZero Trust登録・選択planの確認が必要。その後にGoogle IdP、指定2名の許可policy、CI用Service Tokenを設定し、WorkerへSecretを反映する。共通APIの公開はこのPRが品質確認後developへmergeされてから行う。`PREVIEW_ENABLED` は未設定のまま、自動公開は無効。

既存CI tokenは権限を拡張せずfallbackとして暫定再利用する設定。新tokenを発行していない。所有形態と実CIの必要権限を照合してから公開を確認する。

### Worker単位のAccessとWebSocket

Worker単位の `preview_worker` はWS非対応なので採用しない。hostname-based方式とsubdomain先頭のpartial wildcard対応は公式仕様を照合済み。対象は `*-idea-boost-preview-app.<account-subdomain>.workers.dev` のself\_hosted application1件で、通常PR prefixと固定deployment prefixを保護する。実Account subdomainは公開記録へ書かない。実設定・両URL・WSは未検証。[WorkersとAccess](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[partial wildcard](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)

Worker IDは不要なので、親Workerの事前deployも不要。先にAccessを設定でき、Preview CLIが初回の親Workerを自動作成する。Account全体のProtect Allは使わない。health用ServiceAuthは同じapplicationへ追加し、gatewayのprobe tokenは `/api/health` 限定。通常API／WSではsub・emailを持つGoogle JWTを要求し、service identityだけでは本人ログインできない。

ログアウトは `/cdn-cgi/access/logout` へ移動する実装。実環境でのSSO終了は未検証。最終追加分を含む型・lint・Preview buildが隔離worktreeで成功。

## PRの後にreleaseが必要か

`docs/operations/release.md` の運用では、開発PRのbaseは `develop`。PR作成・マージだけでは本番アプリは変わらない。本番更新は `Promote Release` → `release` → `Deploy` → health成功 → GitHub Releases記録で扱う。

\#362のPreviewは本番と独立した基盤・公開経路を用意するため、Previewを利用開始するための本番releaseは不要。本番アプリにも反映する変更を含む場合は、developへ取り込んだ後で通常のreleaseを別途行う。公開実績は成功を確認してから記録する。

## 図と検証

- [編集可能な構成図](architecture.drawio)：開始時の本番リポジトリ設定／準備中・未公開のPreview構成の2ページ。
- [HTML報告](preview-report.html)：実環境の状態・ローカル検証・未確認事項・releaseとの関係をまとめた報告。図はXMLを埋込み、公式draw\.io viewerで描画する。図の表示にはインターネット接続が必要。
- 図とHTMLのPNGはPR添付用に `/tmp/idea-boost-preview-media/` へ保存し、Gitには含めない。公式viewerの実描画スクリーンショットで、PNGに編集XMLは埋めていない。
- [再生成スクリプト](generate-preview-diagram.py)：Python標準ライブラリでXMLを作り、指定スキルでアイコン埋込みとXML検証を実行する。
- Cloudflare Networkはサービスの論理境界であり、全データの配置地域や全edgeでの実行を保証する表現ではない。
- Accessの配置は計画。実設定・認証成功・別入口の保護が確認済みという意味ではない。
- アイコン10個を埋込み、XML検証に成功した（2ページ、38セル）。ID・参照・geometry・未展開マーカーを検査した。サービスの意味や実際の認証・疎通を保証する検証ではない。
- 生成スクリプトは `python3 -m py_compile` に成功した。
- draw\.io Desktopは既定macOSパス／PATHに見つからないため、DesktopによるPNG出力は未実施。代わりに公式viewerの実描画を確認し、desktop／mobileと図2ページを画像で検査した。
- HTML報告の独立仕上げレビューは `ship`、重大指摘なし。紙色・墨・オレンジ・日本語sansを既存Cloudflare解説から継承し、既存のvisual systemやdocs/siteは変更していない。
- HTML報告はJavaScriptエラー0件、1280px／390pxでページ全体の横はみ出しなし。機械的なデザイン検査はborder-rightの余白警告3件を表示した。実際の該当summary欄に左右24pxのpaddingがあり、画像で文字の圧迫は見られなかった。

再生成：

```sh
python3 out/generate-preview-diagram.py --skill-dir /Users/junhat6/ghq/github.com/junhat6/agent-skills/cloudflare-drawio-diagram
```

Icons: Cloudflare Docs (Cloudflare), CC BY 4.0. Source: <https://github.com/cloudflare/cloudflare-docs/tree/0017e51a284d1be4341ada9f9005850a7b47dc7b/src/icons>. Icons embedded without modification.

## PR作成と資料の公開

2026-10-10に[Draft PR #583](https://github.com/engineer-first/idea-boost/pull/583)をbase developで作成。[画面と構成図の確認資料](https://github.com/engineer-first/idea-boost/pull/583#issuecomment-6095200985)に4枚を添付し、GitHubの実ブラウザで全画像の描画を確認した。Secret値は添付していない。Storybook公開は成功。ChromaticのUI Testsはプラン更新が必要との表示により保留であり、画面差分検査は未実施。契約は変更していない。
