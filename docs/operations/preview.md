<!-- 読者: Previewを使い、設定を保守する開発者。説明なしで使ってよい語: 一般語、Issue、ADR、マージ、merge、push、PR、Preview、Cloudflare、GitHub、Google、App、API、Worker、D1、RoomDO、CI、build、artifact、SQL、migration、commit、head、SHA、run、attempt、Secret、Token、Cookie、JWT、Access、WebSocket、URL、develop、release、namespace、probe、Service Binding、Allow policy、Service Auth、variables、runner、fallback、marker、HTTP、JSON、User-Agent、Origin、IdP、Account、Account ID、UUID、hostname、wildcard、Static Assets、JWT、HttpOnly、App Launcher、WARP、Team、Client Secret、API commit、Wrangler、OpenNext、max、queue、Chromium、BrowserContext、RS256。 -->

# PRのWorkers Previewを使う・設定する

[Issue #362](https://github.com/engineer-first/idea-boost/issues/362)の実装と初期設定の手順です。**コードの追加と、Cloudflareの実設定・利用確認は別です。** 公開済みかは実行結果で確認し、別メンバーのGoogleログインと共同操作まで確認してIssueの完了を判断します。担当者・権限・契約の整備は[#360](https://github.com/engineer-first/idea-boost/issues/360)で行います。

## PR全体を反映する現在の方式

2026-10-11、利用者は画面・API・ルームの保存処理までPR版で確認する方針を選びました。PR #587の「直前のステップに戻る」は、共通APIに処理がないため初版では確認できませんでした。[画像付きの原因記録](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6106092717)を参照してください。

新方式ではAppとAPIを同じWorkerへまとめ、PR専用D1と、そのPreview内のRoomDOへ接続します。PRのD1 migrationもそのD1だけに適用します。公開先が新方式へ切り替わったことは、手元のパソコンでの検証成功だけでは判断しません。

- AppからAPI・保存先への接続確認が成功し、通常URLと固定URLの両方でAPI commitがPRのApp commitと一致した場合だけ「疎通確認済み」と表示します。
- PR終了時は該当Preview・そのRoomDOの保存先・PR専用D1を削除します。閉じたPRの検証データは残りません。migrationが同じ再公開ではD1を再利用します。migration変更時と、PRを開き直したときは保存先を作り直します。
- 旧共通API・D1・RoomDOは削除しません。新方式の通常URLから旧ルームへは入れないため、ステップ選択から新しいルームを作ってください。
- PRコメントの入口は「このPRの最新公開版を開く」の1つです。同じURLが、CIと公開後の接続確認に成功した最新のPR版へ更新されます。確認中・失敗時はリンクを表示しません。
- Cloudflareは公開ごとの固定URLも生成しますが、レビュー用コメントには表示しません。公開履歴が増えても、同じPRのD1とRoomDOの保存先を使い続けます。固定URLも保存データや適用済みmigrationを過去の状態へ戻すものではありません。
- セッション鍵はPRとD1ごと、probe鍵はPRごとにCI内で元の鍵を使って作ります。元の鍵はWorkerへ渡しません。GitHubの既存のSecret名は引き続き使います。
- 許可一覧・Google限定Access・JWT検証・Cookie・Origin・ルームで誰にどの操作を許すかの判定は、既存方式を引き継ぎます。

### コードを更新するときの保存データとmigration

通常のコード更新では、同じPRの保存先を使い続けます。D1またはRoomDOのmigrationを追加・編集・削除・名前変更した場合は、そのPRのPreviewとD1を削除して作り直します。RoomDOの保存先もPreviewの削除で消えるため、既存のルーム・付箋・呼び名はリセットされます。同じPR用URLから新しいサンプルルームを作って確認してください。

適用済みSQLを同じファイル名・IDのまま書き換えても、通常のmigration適用では再実行されません。Previewは上記の作り直しで、新しいSQLを最初から適用します。本番のmigrationや、マージ済みSQLを変更しない開発規約には影響しません。

公開処理では、GitHubに保存された対象コミットからD1とRoomDOのSQL一覧と内容を取得し、build済みartifact内の実SQLがその版と一致することを確かめてから、直前の公開版と比較します。SQLが同じならデータを残し、変わったら作り直します。直前の公開版の照合情報を確認できない場合は、削除せず停止します。旧方式で公開した版についても、そのコミットのSQLを取得して新しい版と比較するため、移行だけを理由にリセットしません。公開処理が途中で失敗し、片方の保存先だけが残った場合は、両方を作り直します。

削除の直前にはPRが開いていること、コミットとCIの成功状態が変わっていないことを再確認します。Actionsには `schema reuse` または `schema reset` と、対象PRの作成・削除の結果を記録します。Account ID・DBのUUID・認証情報・生の応答は記録しません。判断と復旧上の注意は[ADR 0013](../adr/0013-pr-preview-migration-reset.md)を参照してください。

[CloudflareのPreview保存先の仕様](https://developers.cloudflare.com/workers/previews/resources/)と[D1のmigration記録](https://developers.cloudflare.com/d1/reference/migrations/)も参照してください。

### マージ後の移行・確認

初回の基盤移行はPR #591で実施済みです。PR #587へ取り込み、App/API b75edf4dを公開しました。通常URLと新しい固定URLの両方で、本人のGoogleアカウントによるログインと前進・戻る操作を確認しました。[公開処理](https://github.com/engineer-first/idea-boost/actions/runs/38124268809)と[画像付きの実操作記録](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6107148027)を参照してください。再読み込み後も付箋12枚と編集した本文が残りました。同じGoogleアカウントの2タブ間で進行も同期しました。別アカウントでの共同操作と、PRを開き直した際の保存先の再作成は引き続き確認します。

PR #621もApp/API 9d3d1eb0で公開し、[PR #587との画像付き比較記録](https://github.com/engineer-first/idea-boost/pull/621#issuecomment-6107797495)を残しました。PRごとの機能の違い、#621内での呼び名の共通保存、編集した付箋が混ざらないことを確認しました。相手PRのルームを開くと両方向とも404になりました。#621は通常URLと固定版URLの両方で、再読み込み後の呼び名と付箋を確認済みです。PR #622のマージ後の[終了処理](https://github.com/engineer-first/idea-boost/actions/runs/38128051763)では、対象Previewと専用D1の削除が成功しました。

今後のPRでは、CI成功後に自動コメントが更新されます。そのコメントの新しいリンクから確認してください。以下の1〜2は、基盤の初回移行時に使った手順です。

1. この基盤変更をdevelopへマージし、CI成功を確認します。公開処理は信頼済みのdevelopから実行されます。
2. 検証対象のPRへ最新developを取り込み、CIを実行します。旧App-only artifactは使えません。新しいCIではApp/APIをまとめて生成し、テスト用の認証を使ってWorkerを実際に動かす基本動作の検査も実行します。
3. PRの「PR Preview」コメントが「疎通確認済み」になり、App/API両方が対象PRの版と一致することを確認します。このコメントの「このPRの最新公開版を開く」を開きます。
4. 本人のGoogleアカウントで新しいサンプルルームを作ります。PR #587では一度「次のステップへ」で進み、メニューの「直前のステップに戻る」を実行して、ステップと付箋が戻ることを確認します。
5. 別のGoogleアカウントでの共同操作、別PRとの分離、閉じる・開き直す操作を確認し、日時・版・結果を台帳へ残します。

設定・検証の正本は[後継ADR](../adr/0012-pr-preview-full-stack.md)、[設定台帳](../../out/preview-setup-log.md)です。以下の初版の記録は、共通API方式の設定履歴として残します。

## 現在の公開・更新・終了手順

PRのPreviewは、レビュー担当者がローカル起動せず、そのPRの変更を確認するための環境です。

1. PRコメントの「このPRの最新公開版を開く」を開き、利用が許可された自分のGoogleアカウントでログインします。
2. 確認したいステップを選ぶと、そのステップのサンプル入り新ルームを作ります。作成者がホストです。
3. 「招待」のURLをメンバーへ渡します。メンバーも自分のGoogleアカウントで参加します。「マイ付箋」に付箋を追加し、本文を入力して共有します。
4. 新しいcommitをpushすると、CI成功と公開後の接続確認を経て、同じPR用URLが更新されます。同じSQLならデータを残します。
5. PRを閉じるかマージすると、そのPreview・RoomDO・専用D1を削除します。開き直したPRでは新しい保存先を作ります。

同じcommitで閉じて開き直しても、GitHubの開き直し履歴を使って以前の公開と区別します。旧公開記録に開き直しの情報がなければ、公開日時と開き直した日時を比較します。日時がない場合や同じ秒で順序を判定できない場合は、削除せず停止します。削除イベントの処理前に開き直された場合も、旧データと旧セッション鍵を引き継ぎません。遅れて届いた更新イベントは現在のPRとCIを参照し、成功済みの案内を更新中へ戻しません。同じCIの成功通知が複数届いた場合も、確認済みの公開を繰り返しません。

### CIのコードとartifact

buildはPRのheadを取得します。developとの仮のmerge結果をPRのheadとして表示しません。Workerの内容、D1とRoomDOのSQL、生成したRoomDO用SQLが対象commitと一致することを、秘密を持たないCI内で検査します。公開runnerでも、artifactのWorkerとSQLを検査してからリソースを操作します。

別のリポジトリから届いたPRは自動公開しません。Secretを使う公開runnerでは、信頼済みのdevelopから取得した、Previewの公開・削除プログラムだけを実行し、PRのプログラム・build命令・構成は実行しません。

CIの失敗したジョブだけを再実行した場合、成功済みのbuildは再実行されないことがあります。その場合は、同じCI run・同じheadで生成された、現在のattempt以前の直近artifactを使います。期限切れ・別head・別run・未来のattemptは使いません。artifactの保存期限は3日です。取得できなければCIの全ジョブを再実行してください。

公開と削除は同じキューで直列化します。リソース操作前と、通常URL・固定URLの接続確認後に、PRの状態・head・開き直し履歴・CIのrunとattemptを再確認します。再実行中のCIを以前の成功として案内しません。CIや接続確認が失敗した場合はリンクを表示せず、自動処理が投稿した同じコメントに状態とログへのリンクを残します。

### 今使うGitHub設定

設定場所はリポジトリの **Settings → Secrets and variables → Actions** です。値を公開PR・図・ログへ転載しません。

| 設定名                                                      | 種別      | 用途                                                       |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| `PREVIEW_ENABLED`                                           | Variable  | `true`で自動公開を有効にする                               |
| `PREVIEW_D1_ID`                                             | Variable  | 旧共通Preview D1の保護。新しいPRの接続先には使わない       |
| `PREVIEW_ACCESS_ISSUER` / `PREVIEW_ACCESS_AUD`              | Variables | Google連携したPreview用Access applicationを検証する        |
| `PREVIEW_CLOUDFLARE_API_TOKEN`                              | Secret    | PreviewのWorkerとD1を操作する。Workerへ渡さない            |
| `CLOUDFLARE_ACCOUNT_ID`                                     | Secret    | 既存の共同管理先Accountを選ぶ                              |
| `PREVIEW_SESSION_SECRET`                                    | Secret    | PRとD1ごとのセッション鍵を作る。元の鍵はWorkerへ渡さない   |
| `PREVIEW_PROBE_TOKEN`                                       | Secret    | PRごとの接続確認用鍵を作る                                 |
| `PREVIEW_ALLOWED_EMAILS`                                    | Secret    | 本人ログインを許すメール一覧。AccessのAllow policyと揃える |
| `PREVIEW_ACCESS_CLIENT_ID` / `PREVIEW_ACCESS_CLIENT_SECRET` | Secrets   | CIの接続確認だけに使うAccess Service Token                 |

旧共通APIは既存ルームのために保持し、専用自動処理でdevelopの成功版を更新します。新方式のPRからは接続しません。旧共通D1・本番D1・他PRは、対象PRのリセットや終了処理で削除しません。

Access applicationはPreview全体で共通です。Appのセッション鍵と保存先はPRごとに分離しますが、同じAccess application向けのJWT自体は別PRでも有効です。この方式は、同じリポジトリに書き込み権限を持つ人のコードを信頼する運用です。別のリポジトリなどから届く未信頼のPRにも公開する方式へ変える場合は、Accessの認証範囲も改めて設計します。

### 保持・費用・復旧

保存先は開いているPRごとに1つずつです。commitの数だけD1を増やしません。固定URLの公開履歴も同じPRのD1とRoomDOを共有します。SQL変更、PRの終了・開き直しでデータが消えます。長期の保存場所として使いません。

契約・費用・使用量の確認と管理者交代は[#360](https://github.com/engineer-first/idea-boost/issues/360)の担当範囲です。[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[D1料金](https://developers.cloudflare.com/d1/platform/pricing/)、[Zero Trustプラン](https://www.cloudflare.com/zero-trust/plans/)と管理先の契約を照合します。今回、既存の契約は変更していません。

更新に失敗したらPRコメントからActionsを開き、失敗ステップと日時・対象PR・結果を確認します。設定を修正し、CIまたは失敗したPreview 自動処理を再実行します。artifact期限切れではCI全体を再実行します。削除の途中で片方の保存先だけが残った場合は、次の公開で両方を作り直します。消したデータは戻せません。本番や他PRへ接続して復旧しません。

接続確認でHTTP 5xxまたは通信失敗が出た場合は、1秒、次に2秒空けて再試行し、初回を含め最大3回確認します。HTTP 4xx、不正な応答、版の不一致は成功にしません。Token、Cookie、転送先URL、生のコマンドの応答はログへ出しません。接続確認に失敗しても実画面が後で回復する場合がありますが、原因を確認せず成功へ書き換えません。

CI用Tokenの期限は2027年3月31日です。期限が切れると新しい公開・更新・削除が失敗します。公開済みWorkerが期限当日に自動停止する設定ではありません。更新する場所と画像は[PR #587の手順](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6105281887)を参照してください。

## これまでの実環境確認

[PR #627の画像と操作ログ](https://github.com/engineer-first/idea-boost/pull/627#issuecomment-6109478541)で、同じSQLの再公開では付箋が残り、SQL編集時には旧ルームが404、新しいサンプルが作れることを確認しました。[検証用PR #626の終了記録](https://github.com/engineer-first/idea-boost/pull/626#issuecomment-6109490122)でPreviewと専用D1の削除も確認しました。別PRの保存データは残りました。

PR #587と#621では、[PRごとの機能・保存データの違い](https://github.com/engineer-first/idea-boost/pull/621#issuecomment-6109281672)と、[戻るボタンの動作](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6109282058)を確認しました。本人のGoogleログインは成功しています。同じGoogleアカウントの2タブの同期は、別Googleユーザー2名の確認として扱いません。異なるGoogleアカウントを使う2名による、公開Previewでの共同操作は、Issue #362で残る確認として追跡します。

<details>
<summary>初版の共通API方式の設定・操作履歴（現在の操作手順ではありません）</summary>

## 初版をレビューする

1. PRの「PR Preview」コメントが「疎通確認済み」であることと、App commitが現在のPRに一致することを確認します。
2. リンクを開き、許可したGoogleアカウントでCloudflare Accessにログインします。「確認するステップを選ぶ」で1-1〜3-5から選びます。
3. サンプル入りの新しいルームが開きます。本人がホストです。ボードの「招待」からURLを別メンバーへ渡します。
4. 別メンバーも本人としてログインして参加します。参加者のマイ付箋は空なので、自分で追加・入力・共有します。再入室で既存付箋は消えません。
5. 最初から通す場合は、ステップ選択画面の「最初から作成・参加する」を使います。

選び直すと別のルームが作られます。他PRや他ブラウザの検証先は切り替わりません。今回の初版に、役割切り替え・全体リセット・障害サンプル・翌日の再開保証はありません。Previewのアプリセッションは最大1時間で、入室時に期限が残っていることを確認します。本番の入室条件（残り5時間以上）は維持します。

## 初版で使うコード・データ

| 対象        | 更新するコード          | 接続先                                        |
| ----------- | ----------------------- | --------------------------------------------- |
| PRごとのApp | CI成功した最新PR commit | `idea-boost-preview-api`だけへService Binding |
| 共通API     | CI成功した最新develop   | Preview専用D1、PreviewRoomDO namespace        |
| 各ルーム    | RoomDOが共有状態を保持  | ルームごとに独立                              |
| 本番        | 既存release経路         | 上記とは別Worker・D1・RoomDO・Secret          |

PRのAPI・RoomDO・migration・通信契約の変更は、このPreviewに反映しません。App/APIの互換性を確認する場所であり、PR版バックエンドの検証はWorkerテストやローカル環境を使います。構成図は[編集可能なdraw.io](../../out/architecture.drawio)、当日の設定・操作・検証記録は[台帳](../../out/preview-setup-log.md)、視覚的な説明は[用語辞典付きのHTML報告](../site/pr-preview/index.html)を参照します。

## 2026-10-10の設定状況

Preview専用D1の作成と既存9migrationの適用、GitHubのD1 ID variableとPreview専用Secret3つの登録を実施しました。Workersの既存契約は変更していません。Zero Trustは、必要な新規登録と最終条件へのユーザー承認を受けて登録を完了し、管理画面へ到達しました。実Team表示は改名していません。契約詳細・実Team domain・Account識別子はチーム限定記録へ残します。

Google IdPは保存・接続テストに成功し、Google限定・指定2名のAllow policyを持つhostname-based Access applicationを作成しました。同じapplicationへhealth専用Token1つのService Auth policyを設定し、Access issuer／aud variablesとService Token用SecretsをGitHubへ登録済みです。別画面からの再読込でHttpOnly=true／App Launcher=falseと、利用者Allow・CI Service Authの両policyを確認済みです。Google認証情報の本人操作待ちは解消しました。

`PREVIEW_ENABLED`は未設定で、API／App／RoomDOは未公開です。共通APIはこのPRをdevelopへ取り込み、CIが成功してから公開します。CI用Cloudflare tokenの実権限、実health、通常／固定URL、PreviewでのGoogle本人ログイン・実WS・2人操作は未検証です。本番・他Workers・Account Protect Allは変更していません。IdPの接続テスト成功を、Previewアプリの利用成功として扱いません。詳細と実行結果は[台帳](../../out/preview-setup-log.md)を参照します。

### Google連携・Access設定の確認内容

Google IdP一覧で保存を確認し、TestのGoogle通常ログインからYour connection works!を確認しました。取得した本人name／emailとClient Secretは公開記録へ載せず、Client Secretの変更・再発行は行っていません。新project作成・API有効化・既存client変更・課金変更も行っていません。

利用者policyは指定2名のEmailsだけをIncludeし、Login MethodはGoogle必須です。AppもAccept all IdPs Off／Googleのみ、instant auth On、WARP auth Off、session24h。CIのService Authはhealth専用Token1つだけをIncludeし、AnyToken／Everyoneは使いません。Token期限は1yearです。Secret入り一時ファイルは直後に削除し、Token ID・実Team domain・Account識別子・契約詳細は公開記録へ残しません。

Policy Testerの一括試験は起動しましたが、画面で判定結果を確認できていません。成功確認はGoogle IdP Testと設定保存・再読込までであり、Previewの実認証やhealth・WSは別途検証します。

## 2026-10-11の公開後確認

PR #588をユーザーがマージし、追加の応答解析修正PR #589はCI成功後のユーザー承認に従ってエージェントがマージしました。最新develop `808960ba` のCI全5検査と共通API公開が成功し、PR #587のApp `dc659f36` から通常・固定URLで最新API・保存先を確認しました。両healthは200、[自動コメント](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6105045152)に「疎通確認済み」とリンクが表示されています。

Googleログイン、付箋の保存・再入室・同じアカウントの2タブ間の同期・共有・投票、ログアウト・Google再認証・再入室は実画面で確認しました。実操作はAPI更新前に確認しました。最新API更新後の実操作と画面撮り直しはブラウザ接続の問題で未実施です。別Googleユーザーの共同操作、PR #587の戻る処理は未確認です。

PR #588終了と診断用Previewの削除は成功しました。#589の終了workflowは失敗していますが、対象Previewが404/10025で存在しないことを確認しました。未公開のPR終了・開き直しの確認は残します。詳細は[台帳](../../out/preview-setup-log.md#2026-10-11最新apiでの自動確認成功)へ記録しました。

## 初版の初期設定

**今回の実Cloudflare操作は台帳で確認してください。以下の手順の記載は実施済みの証拠ではありません。** 既存契約、必要な権限、費用と上限、許可メールを担当者が確認してから設定します。本番Tokenの権限を広げたり、本番Secretをコピーしたりしません。

1. 対象Accountを`npx wrangler whoami`で確認し、`CLOUDFLARE_ACCOUNT_ID`を対象Accountに指定します。追加の契約・権限が必要なら、その部分は#360の担当者が判断します。
2. `npx wrangler d1 create idea-boost-preview-lobby --config workers/wrangler.preview.jsonc`で本番とは別のD1を作り、そのIDをGitHub Repository variable `PREVIEW_D1_ID`へ登録します。コードのplaceholderは実IDとして使えず、本番D1 IDは検査で拒否します。
3. Cloudflare Zero Trustでhostname-basedのself-hosted Access applicationを作ります。Google IdPだけを認証方法として許可し、実際のメンバーのメール一覧でAllow policyを設定します。メールOTPや別IdPを同じapplicationに加えません。署名済みAccess identityをアプリ内本人へ対応付けるためです。
4. 実際のAccountのworkers.dev subdomainを確認し、`*-idea-boost-preview-app.<subdomain>.workers.dev`だけを対象にします。Cloudflare Accessはsubdomainの先頭に置く部分wildcardをサポートし、これで通常Preview URLと固定deployment URLをまとめて保護します。Account全体や他Workerを対象にしません。Worker単位のAccessはWebSocket非対応なので、`preview_worker` destinationやWorkerの「Previews only」は使いません。別入口でもApp WorkerがJWTを検証し、Static AssetsもWorkerを通ります。APIはworkers.dev・version URL・custom routeを公開しません。
5. 疎通確認用Access Service Tokenを作り、同じPreview applicationにService Auth policyを追加します。Service Tokenだけでは本人メールのJWTにならないため、Appは通常画面・API・WSを許可しません。疎通はさらに独立したprobe tokenを`/api/health`だけで検証します。これはGoogle利用者のログインとは別です。Appは独立したprobe tokenを正しいhealth経路だけで受け、共通APIのD1とRoomDOへ到達できることを確認します。
6. 以下のGitHub Secrets/variablesを登録します。秘密値はGit、図、操作台帳、PR本文へ書きません。Secretファイルは公開処理が権限0600で一時生成し、終了時に削除します。

| GitHubの設定名                                              | 設定種別・用途                                                                        | Cloudflareへの設定先                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `PREVIEW_CLOUDFLARE_API_TOKEN`                              | 必須Secret。PreviewのWorkers ScriptsとD1操作用。未設定時は停止し、本番Tokenを使わない | CIだけで使用                                            |
| `CLOUDFLARE_ACCOUNT_ID`                                     | 既存Secret。対象Accountの選択                                                         | CIだけで使用                                            |
| `PREVIEW_D1_ID`                                             | Variable。本番と異なるPreview D1 ID                                                   | 共通APIの生成済み構成                                   |
| `PREVIEW_SESSION_SECRET`                                    | Secret。本番と別の十分にランダムな32バイト以上の秘密                                  | 各App Previewと共通APIの`SESSION_SECRET`                |
| `PREVIEW_ALLOWED_EMAILS`                                    | Secret。メンバーの確認済みメールをカンマ区切り                                        | 各App Previewと共通API。Access policyにも同じ一覧を設定 |
| `PREVIEW_ACCESS_ISSUER`                                     | Variable。`https://<team>.cloudflareaccess.com`                                       | 各App Preview・共通API                                  |
| `PREVIEW_ACCESS_AUD`                                        | Variable。Access applicationのAUD                                                     | 各App Preview・共通API                                  |
| `PREVIEW_PROBE_TOKEN`                                       | Secret。ランダムな32文字以上のhealth専用秘密                                          | 各App Previewと共通API                                  |
| `PREVIEW_ACCESS_CLIENT_ID` / `PREVIEW_ACCESS_CLIENT_SECRET` | Secrets。health用Access Service Token                                                 | CIのHTTP probeだけで使用                                |
| `PREVIEW_ENABLED`                                           | Variable。上記設定と契約確認後に`true`                                                | workflowの有効化。Worker側の同名flagは専用構成に固定    |

APIは[専用構成](../../workers/wrangler.preview.jsonc)、Appは[専用構成](../../wrangler.preview.jsonc)を使います。Workers PreviewsにはWrangler 4.135以上が必要で、今回4.149を使用します。OpenNext 1.20.1で`npm run build:preview`を検証します。Previews Baseから本番設定やSecretを継承せず、毎回信頼済みのdevelopの構成とPreview用Secretだけを指定します。

## 更新・終了と確認

ログアウトはアプリCookieを削除して同じhostの`/cdn-cgi/access/logout`へ移動し、Accessのログインも終了します。

- `develop`へのpushでCIを実行し、成功するとShared Preview API workflowが最新developか再確認してPreview D1 migrationとAPIを更新します。初回はマージ後のCI成功を待ちます。手動workflowも最新developのCI成功が必要です。
- PR作成・更新・開き直しでは同一repoのみ対象にします。PRコードのbuildとartifact保存はSecretなしの通常`pull_request` CIで行います。`workflow_run`ではPRコードを実行せず、成功したCIの同じrun/attemptのartifactだけを取得します。公開runnerは信頼済みdefault branchのoperatorとWranglerだけを実行し、PRのbuild.commandや設定を実行しません。
- CIのSHA・run ID・attempt・現在の成功状態とPRのopen状態を公開直前に検査します。API更新・App公開・終了は同じキューで直列化します。公開後に再確認し、通常URLと応答に含まれる固定URLの疎通成功後だけコメントを利用可能に更新します。コメントは同じmarkerを持つBotコメント1件を更新します。
- CI失敗・build失敗・設定不足・health失敗では失敗/更新中を表示します。古い成功URLを最新成功版として案内しません。実Googleログイン成功はhealthとは別に確認します。
- PR終了では`pr-<番号>`のApp Previewとそのdeploymentだけを削除します。API・D1・namespace・他PRを削除しません。開き直すと新しいApp Previewを作ります。

初回は、許可/許可外Googleアカウント、JWT偽造・期限切れ・設定欠落、通常/固定/別入口、未所属ルーム・ホスト操作、別OriginのWSを確認します。別のGoogleユーザー2ブラウザで、ステップ選択→招待→付箋→投票→通常進行まで操作した記録を残します。自動テストだけで、この初回利用確認を済ませたとは扱いません。

## 初版の保持・費用・失敗時

PR終了ではレビュー中のルーム・ユーザー・招待コードを残します。成果と進行記録には既存の30日保持と期限処理を継承します。Preview全体のユーザー・ルーム入口の整理周期と担当、契約・費用・利用上限は#360のチーム限定運用情報で決め、実確認の有無を台帳へ記録します。料金や上限は[Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[D1](https://developers.cloudflare.com/d1/platform/pricing/)、[Zero Trust](https://www.cloudflare.com/zero-trust/plans/)の現行仕様とAccountの契約を照合します。

失敗時はPRコメントのログURLとActionsの失敗ステップを確認します。UTC日時・操作・対象・開始／成功／失敗をJSONで記録し、Secretを含み得る生のCLI出力は表示しません。SecretやCookieを含み得る生ログはPRへ転載しません。設定を直し、対象SHAのCIまたはPreview workflowを再実行します。API更新失敗では現在の成功版を確認し、PR版のAPIを手動で上書きしません。Secret・allowlist変更は共通APIと使用中の各Appへ反映し、旧版deploymentの公開継続も確認します。全体D1削除や本番へのfallbackで復旧しません。

### アップロード成功後、healthの開始ログが出ない場合

Wrangler 4.149.0は`--json`指定でも、画面素材の進捗メッセージをJSONの前へ出力します。公開処理はJSON本体を切り出してから、通常・固定URLの形を検証します。末尾に余計な文字がある場合や、URLが欠ける場合は失敗とします。生のCLI出力は秘密を含み得るため、ログやPRへ転載しません。

### 自動確認が1010で拒否される場合

CIのhealthは`idea-boost-preview-probe/1.0`をUser-Agentに指定します。既定のクライアント名がCloudflareに拒否される場合があるためです。Access・probe tokenの照合とredirect拒否は維持します。

healthのJSONログは通常URLを`normal`、固定版URLを`fixed`と記録します。失敗理由は`http`（HTTP拒否）、`transport`（通信・redirect・timeoutなど）、`response`（応答の形が不正）です。HTTP statusと、本文が`error code: 4桁の番号`に一致する場合の番号だけを記録します。認証ヘッダー、Cookie、Location、生の応答・例外をログへ追加しません。

HTTP 5xxまたは通信失敗の場合は、1秒、2秒の間隔を空けて、最初の確認を含め最大3回まで接続を確認します。ログの`attempt`で回数を、`retrying`で再試行することを記録します。認証拒否を含むHTTP 4xxや不正な応答は再試行せず失敗とします。回復しても、通常URL・固定版URLの両方でAPIの版がPRの版と一致するまで成功リンクは表示しません。

2026年10月11日の[PR #622の公開処理](https://github.com/engineer-first/idea-boost/actions/runs/38126758120)では、初回はアップロード後の通常URLへの接続確認がHTTP 500で失敗しました。同じコードで公開処理を再実行すると、通常URL・固定版URLの両方が成功しました。最初の500の原因は特定していません。この事例を受けて、自動の再試行を追加しました。

2026-10-11の実設定と手動操作は[台帳](../../out/preview-setup-log.md#2026-10-11マージ後の初回公開と実操作)、Tokenの2027年3月31日までの期限と更新画像は[PRコメント](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6105281887)を参照してください。

</details>

## releaseとの関係

PRのPreviewは、そのPRのCI成功と公開後の接続確認を経て更新します。公開・削除を行うプログラムは、信頼済みのdevelopから取得し、Preview専用設定を使います。**Previewを使い始めるために、本番releaseへ載せる必要はありません。** 本番アプリにも変更を公開するときは、PRレビュー・developへのマージ後に[通常のrelease手順](release.md)で候補を確認して公開します。PR作成やdevelopへのマージを、本番公開済みとして記録しません。

公式仕様：[hostname-based AccessとWorker方式のWebSocket制約](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[部分wildcard](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)、[ログアウト](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)、[Workers Previews](https://developers.cloudflare.com/workers/previews/)、[共有リソースの制約](https://developers.cloudflare.com/workers/previews/resources/)、[Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Google IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)。
