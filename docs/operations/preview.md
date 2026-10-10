# PRのWorkers Previewを使う・設定する

[Issue #362](https://github.com/engineer-first/idea-boost/issues/362)の実装と初期設定の手順です。**コードの追加と、Cloudflareの実設定・利用確認は別です。** 初期設定と別メンバーのGoogleログイン確認が済むまで、Issueの完了・Preview公開済みとは扱いません。担当者・権限・契約の整備は[#360](https://github.com/engineer-first/idea-boost/issues/360)で行います。

## レビューする

1. PRの「PR Preview」コメントが「疎通確認済み」であることと、App commitが現在のPRに一致することを確認します。
2. リンクを開き、許可したGoogleアカウントでCloudflare Accessにログインします。「確認するステップを選ぶ」で1-1〜3-5から選びます。
3. サンプル入りの新しいルームが開きます。本人がホストです。ボードの「招待」からURLを別メンバーへ渡します。
4. 別メンバーも本人としてログインして参加します。参加者のマイ付箋は空なので、自分で追加・入力・共有します。再入室で既存付箋は消えません。
5. 最初から通す場合は、ステップ選択画面の「最初から作成・参加する」を使います。

選び直すと別のルームが作られます。他PRや他ブラウザの検証先は切り替わりません。今回の初版に、役割切り替え・全体リセット・障害サンプル・翌日の再開保証はありません。

## どのコード・データを使うか

| 対象        | 更新するコード          | 接続先                                        |
| ----------- | ----------------------- | --------------------------------------------- |
| PRごとのApp | CI成功した最新PR commit | `idea-boost-preview-api`だけへService Binding |
| 共通API     | CI成功した最新develop   | Preview専用D1、PreviewRoomDO namespace        |
| 各ルーム    | RoomDOが共有状態を保持  | ルームごとに独立                              |
| 本番        | 既存release経路         | 上記とは別Worker・D1・RoomDO・Secret          |

PRのAPI・RoomDO・migration・通信契約の変更は、このPreviewに反映しません。App/APIの互換性を確認する場所であり、PR版バックエンドの検証はWorkerテストやローカル環境を使います。構成図は[編集可能なdraw.io](../../out/architecture.drawio)、当日の設定・操作・検証記録は[台帳](../../out/preview-setup-log.md)、視覚的な説明は[HTML報告](../../out/preview-report.html)を参照します。

## 2026-10-10の設定状況

Preview専用D1の作成と既存9migrationの適用、GitHubのD1 ID variableとPreview専用Secret3つの登録を実施しました。Workersの既存契約を確認し、契約変更はしていません。Zero Trustは未利用で、Freeプランの新規選択画面まで確認しましたが、プランは選択していません。

Accessの利用開始、Google IdP、URL保護、疎通用Service Tokenは未設定です。`PREVIEW_ENABLED`は有効にしておらず、App/APIの公開も実施していません。共通APIはこのPRをdevelopへ取り込み、CIが成功してから公開します。本番の設定・Secret・デプロイは変更していません。詳細と実行結果は[台帳](../../out/preview-setup-log.md)を参照します。

## 初期設定

**今回の実Cloudflare操作は台帳で確認してください。以下の手順の記載は実施済みの証拠ではありません。** 既存契約、必要な権限、費用と上限、許可メールを担当者が確認してから設定します。本番Tokenの権限を広げたり、本番Secretをコピーしたりしません。

1. 対象Accountを`npx wrangler whoami`で確認し、`CLOUDFLARE_ACCOUNT_ID`を対象Accountに指定します。追加の契約・権限が必要なら、その部分は#360の担当者が判断します。
2. `npx wrangler d1 create idea-boost-preview-lobby --config workers/wrangler.preview.jsonc`で本番とは別のD1を作り、そのIDをGitHub Repository variable `PREVIEW_D1_ID`へ登録します。コードのplaceholderは実IDとして使えず、本番D1 IDは検査で拒否します。
3. Cloudflare Zero Trustでhostname-basedのself-hosted Access applicationを作ります。Google IdPだけを認証方法として許可し、実際のメンバーのメール一覧でAllow policyを設定します。メールOTPや別IdPを同じapplicationに加えません。署名済みAccess identityをアプリ内本人へ対応付けるためです。
4. 実際のAccountのworkers.dev subdomainを確認し、`*-idea-boost-preview-app.<subdomain>.workers.dev`だけを対象にします。Cloudflare Accessはsubdomainの先頭に置く部分wildcardをサポートし、これで通常Preview URLと固定deployment URLをまとめて保護します。Account全体や他Workerを対象にしません。Worker単位のAccessはWebSocket非対応なので、`preview_worker` destinationやWorkerの「Previews only」は使いません。別入口でもApp WorkerがJWTを検証し、Static AssetsもWorkerを通ります。APIはworkers.dev・version URL・custom routeを公開しません。
5. 疎通確認用Access Service Tokenを作り、同じPreview applicationにService Auth policyを追加します。Service Tokenだけでは本人メールのJWTにならないため、Appは通常画面・API・WSを許可しません。疎通はさらに独立したprobe tokenを`/api/health`だけで検証します。これはGoogle利用者のログインとは別です。Appは独立したprobe tokenを正しいhealth経路だけで受け、共通APIのD1とRoomDOへ到達できることを確認します。
6. 以下のGitHub Secrets/variablesを登録します。秘密値はGit、図、操作台帳、PR本文へ書きません。Secretファイルは公開処理が権限0600で一時生成し、終了時に削除します。

| GitHubの設定名                                              | 設定種別・用途                                                                                         | Cloudflareへの設定先                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `PREVIEW_CLOUDFLARE_API_TOKEN`                              | 任意Secret。PreviewのWorkers ScriptsとD1操作用。未設定時は既存`CLOUDFLARE_API_TOKEN`を権限拡張せず継続 | CIだけで使用                                            |
| `CLOUDFLARE_ACCOUNT_ID`                                     | 既存Secret。対象Accountの選択                                                                          | CIだけで使用                                            |
| `PREVIEW_D1_ID`                                             | Variable。本番と異なるPreview D1 ID                                                                    | 共通APIの生成済み構成                                   |
| `PREVIEW_SESSION_SECRET`                                    | Secret。本番と別の十分にランダムな32バイト以上の秘密                                                   | 各App Previewと共通APIの`SESSION_SECRET`                |
| `PREVIEW_ALLOWED_EMAILS`                                    | Secret。メンバーの確認済みメールをカンマ区切り                                                         | 各App Previewと共通API。Access policyにも同じ一覧を設定 |
| `PREVIEW_ACCESS_ISSUER`                                     | Variable。`https://<team>.cloudflareaccess.com`                                                        | 各App Preview・共通API                                  |
| `PREVIEW_ACCESS_AUD`                                        | Variable。Access applicationのAUD                                                                      | 各App Preview・共通API                                  |
| `PREVIEW_PROBE_TOKEN`                                       | Secret。ランダムな32文字以上のhealth専用秘密                                                           | 各App Previewと共通API                                  |
| `PREVIEW_ACCESS_CLIENT_ID` / `PREVIEW_ACCESS_CLIENT_SECRET` | Secrets。health用Access Service Token                                                                  | CIのHTTP probeだけで使用                                |
| `PREVIEW_ENABLED`                                           | Variable。上記設定と契約確認後に`true`                                                                 | workflowの有効化。Worker側の同名flagは専用構成に固定    |

APIは[専用構成](../../workers/wrangler.preview.jsonc)、Appは[専用構成](../../wrangler.preview.jsonc)を使います。Workers PreviewsにはWrangler 4.135以上が必要で、今回4.149を使用します。OpenNext 1.20.1で`npm run build:preview`を検証します。Previews Baseから本番設定やSecretを継承せず、毎回信頼済みdevelopの構成とPreview用Secretだけを指定します。

## 更新・終了と確認

ログアウトはアプリCookieを削除して同じhostの`/cdn-cgi/access/logout`へ移動し、Accessのログインも終了します。

- `develop`へのpushでCIを実行し、成功するとShared Preview API workflowが最新developか再確認してPreview D1 migrationとAPIを更新します。初回はマージ後のCI成功を待ちます。手動workflowも最新developのCI成功が必要です。
- PR作成・更新・開き直しでは同一repoのみ対象にします。PRコードのbuildとartifact保存はSecretなしの通常`pull_request` CIで行います。`workflow_run`ではPRコードを実行せず、成功したCIの同じrun/attemptのartifactだけを取得します。公開runnerは信頼済みdefault branchのoperatorとWranglerだけを実行し、PRのbuild.commandや設定を実行しません。
- CIのSHA・run ID・attempt・現在の成功状態とPRのopen状態を公開直前に検査します。API更新・App公開・終了は同じキューで直列化します。公開後に再確認し、通常URLと応答に含まれる固定URLの疎通成功後だけコメントを利用可能に更新します。コメントは同じmarkerを持つBotコメント1件を更新します。
- CI失敗・build失敗・設定不足・health失敗では失敗/更新中を表示します。古い成功URLを最新成功版として案内しません。実Googleログイン成功はhealthとは別に確認します。
- PR終了では`pr-<番号>`のApp Previewとそのdeploymentだけを削除します。API・D1・namespace・他PRを削除しません。開き直すと新しいApp Previewを作ります。

初回は、許可/許可外Googleアカウント、JWT偽造・期限切れ・設定欠落、通常/固定/別入口、未所属ルーム・ホスト操作、別OriginのWSを確認します。別のGoogleユーザー2ブラウザで、ステップ選択→招待→付箋→投票→通常進行まで操作した記録を残します。自動テストだけで、この初回利用確認を済ませたとは扱いません。

## 保持・費用・失敗時

PR終了ではレビュー中のルーム・ユーザー・招待コードを残します。成果と進行記録には既存の30日保持と期限処理を継承します。Preview全体のユーザー・ルーム入口の整理周期と担当、契約・費用・利用上限は#360のチーム限定運用情報で決め、実確認の有無を台帳へ記録します。料金や上限は[Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[D1](https://developers.cloudflare.com/d1/platform/pricing/)、[Zero Trust](https://www.cloudflare.com/zero-trust/plans/)の現行仕様とAccountの契約を照合します。

失敗時はPRコメントのログURLとActionsの失敗ステップを確認します。UTC日時・操作・対象・開始／成功／失敗をJSONで記録し、Secretを含み得る生のCLI出力は表示しません。SecretやCookieを含み得る生ログはPRへ転載しません。設定を直し、対象SHAのCIまたはPreview workflowを再実行します。API更新失敗では現在の成功版を確認し、PR版のAPIを手動で上書きしません。Secret・allowlist変更は共通APIと使用中の各Appへ反映し、旧版deploymentの公開継続も確認します。全体D1削除や本番へのfallbackで復旧しません。

## releaseとの関係

PreviewはdevelopのCIと専用設定で更新します。**Previewを使い始めるために、本番releaseへ載せる必要はありません。** 本番アプリにも変更を公開するときは、PRレビュー・developへのマージ後に[通常のrelease手順](release.md)で候補を確認して公開します。PR作成やdevelopへのマージを、本番公開済みとして記録しません。

公式仕様：[hostname-based AccessとWorker方式のWebSocket制約](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[部分wildcard](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)、[ログアウト](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)、[Workers Previews](https://developers.cloudflare.com/workers/previews/)、[共有リソースの制約](https://developers.cloudflare.com/workers/previews/resources/)、[Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Google IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)。
