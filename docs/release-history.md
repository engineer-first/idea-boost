# 本番リリースの履歴

公開履歴の正本は [GitHub Releases](https://github.com/engineer-first/idea-boost/releases) です。
本番で公開した機能・変更・修正を、公開日時・版・対象commitと結び付けます。
通常は **`$release` → 変更を見る → 必要なら `edit` → `release` → 本番health確認成功 → 自動記録** です。
[リリースの流れ（図解）](https://engineer-first.github.io/idea-boost/release-flow/) から全体像を確認できます。
PR作成、developへのマージ、タグ作成だけでは公開済みと記録しません。

## 普段は `$release`

Codexでこのリポジトリを開き、`$release` と入力します。GitHub CLIの認証が必要です。
Skillは前回の本番、developの現在の候補、関連PRとcommitの差分、現在のActions状態を読み取り、
主要変更のタイトル・利用者向け説明・注意事項・タグ候補を提示します。branch、SHA、PR番号、run ID、attempt、タグの入力は不要です。

- `edit`：「テキスト保存を『結果をテキストで保存』にして」のように自然言語で直します。説明を再提示します。
- `release` / 「これで公開して」：提示された内容で初めてPromote Releaseを起動します。
- `cancel`：書き込まず終了します。起動だけでは本番は変わりません。

機能を公開対象から外す依頼は文面の編集ではありません。公開を止め、通常の開発で公開範囲を整えます。
Skillは個別PRの除外やcherry-pickを行いません。通常会話の「リリースについて相談したい」等からは起動しません。
Codexの `allow_implicit_invocation: false` とSkill内の明示呼び出し条件の両方で入口を限定します。

承認済みの説明はPromoteが `release-plan-<対象SHA>` という不変のGit参照へ保存します。
これは公開版のタグではなく、説明を置く内部参照です。対象のdevelop/releaseのコードは変更しません。
Deployと記録回復はその参照の `.github/release-note.json` を読み、なければ従来どおり対象commit内の同名ファイルを読みます。
同じ候補の保存済み説明は上書きしません。Promoteが保存後・Deploy起動前に失敗した場合、
次のstatusで対象SHA付きの保存済みplanを復元し、Skillは同じ説明の再提示を優先します。
該当する失敗Promoteは対象SHAを含むrun-nameから結び付けます（runのhead SHAだけでは判断しません）。
保存済み説明の編集依頼は上書きせず、保存内容を確認し、
その内容で再開するか、通常の開発で新しい候補を用意します。
developが進んでいれば、古いrelease先端の保存計画は前回情報として区別し、新候補の説明へ流用しません。成功後の文面訂正は末尾の訂正手順を使います。

dispatch受付は公開成功ではありません。SkillはActionsとGitHub Releaseを再取得して結果を確認します。
公開前にdevelop・本番比較元・release先端が変われば停止し、新しい内容を提示し直します。
チャットを閉じても次回の `$release` はGitHubから状態を復元します。ローカルの `.release-history/` は下書きであり正本ではありません。

## 失敗時の判断

| 状態                                     | 次の操作                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 読み取り・説明検査・品質ゲートで失敗     | エラーを直し、候補を再取得。本番の成功履歴は作りません。                                                                                    |
| Actionsが実行・待機中                    | 同じ処理を起動せず、そのrunを待ちます。                                                                                                     |
| migration / API / App / healthの途中失敗 | 一部反映済みの可能性があります。runの失敗ジョブと実状態を確認し、担当者が部分再試行または復旧方針を判断します。自動ロールバックはしません。 |
| Deploy・health成功、記録だけ失敗         | `$release` が `retry-record / cancel` を提示。`retry-record` で記録のみ回復します。識別番号は自動取得されます。                             |
| Promoteのrelease更新後、Deploy起動に失敗 | 先にstatusを再取得。待機中のDeployがなければ保存済み説明を保って再開できます。緊急時は下記Actions入口を利用します。                         |
| API応答を受け取れなかった                | statusから確認し、待機中・成功済みの処理を二重起動しません。                                                                                |

`deployment-failed` は本番4段階の成功が揃わない状態です。runのジョブで変更前の失敗か部分反映かを区別します。
health成功済みの `retry-record` と混同しません。旧Deployに説明がない場合のみ、下記「初回導入・役割・訂正」のreceipt経路を使います。

## 本番を変えずに試す

`$release 今回の変更を確認したい` で内容提示まで進み、`edit` を試して `cancel` します。
読み取りだけを単独で試すなら `npm run release:operator -- status`。これらはGitHubへ書き込みません。
公開・回復・競合まで副作用を差し替えて確認するには次を実行します。

```bash
npm run test -- scripts/release-operator.spec.ts scripts/release-history.spec.ts scripts/promote-release.spec.ts scripts/release-automation.spec.ts scripts/deploy-production.spec.ts
```

テストはGitHub APIを差し替えます。本番や架空のGitHub Releaseは作りません。

## 対応するフロー

| 入口・状況                                                         | 下書き・確認                                                                            | 履歴が出るタイミング                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `$release`                                                         | Skillが差分を読み、説明を下書き。自然言語で編集して公開意思を確認                       | Promote → Deploy → health成功で自動記録                                     |
| 互換入口：release向けPRとPromote Release                           | `.github/release-note.json` とCIをPRでレビュー。Release Note CheckのSummaryに下書き表示 | releaseのfast-forward後、Deployのhealth成功で自動公開                       |
| releaseへの直接push、hotfix、cherry-pick                           | pushするcommitに同じJSONを含める。PRを通さない場合も説明の確認が必要                    | Deployのhealth成功後、自動公開                                              |
| ActionsのRun workflow / gh workflow run                            | Deployでbranch `release` を選ぶ。対象commit内のJSONを検査                               | 同じDeploy経路で自動公開                                                    |
| 同じcommitの再デプロイ、Re-run all jobs                            | 前回と同じcommitなら「機能・操作の変更なし」と説明を自動切替                            | 新たなAPI/App公開とhealth成功後、別の版として記録                           |
| Re-run failed jobs / 特定ジョブの再実行                            | 再実行しない成功ジョブを引き継ぎ、再実行したジョブは最新結果で判定                      | 構成全体の成功を確認後、自動公開                                            |
| 記録ジョブのみ失敗・通信断                                         | `$release` → `retry-record`。手動ではrecord-releaseだけ再実行、またはRecord Release     | 再デプロイせず記録。同じ公開事象は同じ版を再利用                            |
| ローカルの `npm run deploy`                                        | クリーンな公開commitとJSONを事前検査                                                    | migration → API → App → health後にreceiptを保存し、Record Releaseを自動起動 |
| Cloudflare画面・個別wranglerコマンド・導入前のスクリプトによる更新 | 対応PR/Issueで成功証跡を確認し、manual receiptを作成                                    | Record Releaseへreceiptを渡して記録                                         |
| 過去版へのロールバック・分岐したcommitへの復旧                     | `mode: "rollback"` と利用上の注意を必須にする                                           | 復旧後の全体の成功を確認し、同じ記録経路で公開                              |
| タグ作成、GitHub Releaseの手動作成、developへのマージ              | 本番デプロイの成功証拠にはしない                                                        | それだけでは自動記録しない                                                  |
| 途中失敗・取消し・API/App片方だけ成功                              | 公開履歴を作らず、作業記録に実状態を残す                                                | 構成全体を確認できるまで公開しない                                          |

個別のCloudflare操作をGitHubから自動観測する仕組みはありません。通常の入口は自動化し、
外部操作も成功証跡を渡して同じ履歴へ合流できるようにしています。
アプリ内の通知、配信、過去履歴の全面復元、ロールバック・データ復旧そのものの実装は対象外です。

## 説明の形式と互換入口

下書き担当は、その版で本番公開する機能・挙動ごとに1項目の説明を書き、確認担当がレビューします。
同じ機能の複数PRはまとめてリンクします。PRタイトルの一覧を本文の代わりにはしません。
本番設定や機能フラグも確認し、未公開の実装・将来構想を混ぜないでください。
内部変更だけなら `kind: "内部変更"` とし、「利用者の操作に変更はありません」と理由・関連PRを残します。
制約・利用者の対応は `notices` に入れ、不要なら空配列にします。

通常はSkillがこの形式を生成します。次は**架空の記載例**です。
従来のPR / 直接push / 手動入口では `.github/release-note.json` として対象commitに含められます。
このファイルには自分自身のcommit SHAや公開日時を埋めません。
Deployの実際のcommitとhealth完了日時を自動で付けます。

```json
{
  "title": "投票のやり直し",
  "previousCommit": "24fc6570bcf80ad641e8160a15aa23d6e31e6439",
  "mode": "release",
  "changes": [
    {
      "kind": "追加",
      "text": "付箋を残したまま、そのフェーズの投票をやり直せるようになりました。",
      "prs": [370, 371]
    }
  ],
  "notices": ["投票をやり直すと、それまでの投票数はリセットされます。"]
}
```

`previousCommit` は直前の本番Releaseの公開commit（40桁SHA）。初回だけ下記の記録開始基準です。
`mode` は通常 `release`、復旧・巻き戻しは `rollback`。同じcommitを再公開する場合は `redeploy` に
自動切替し、古い機能説明を「新規追加」として繰り返しません。
JSONの欠落・不正、古い比較元、未記録の成功したDeployは **migrationより前** に拒否します。

release向けPRのRelease Note Checkは読取権限だけで、既定ブランチのスクリプトから
PRのhead commitのJSONを読み、Summaryへ下書きを出します。対象commitに含まれる変更か、説明が平易か、
実際に公開されるかという意味の確認は人が行います。公開後の要約入力は通常不要です。

## GitHub画面からreleaseを更新する（互換・緊急入口）

1. `develop` から `release` へのPRを作成し、差分・`.github/release-note.json`・Release Note CheckとCIの結果を確認します。
2. GitHubの **Actions → Promote Release → Run workflow** を開き、branchに `develop`、`pr_number` にそのPR番号を指定して実行します。PR画面の **Merge** ボタンは使用しません。
3. Promote Releaseが成功したら、起動された **Deploy** の `gate` から `record-release` までを確認します。公開履歴はhealth成功後に記録されます。

Promote Releaseは、PRがopenで同じリポジトリの `develop → release` を指し、PRのheadが実行時の最新の
`develop` と一致し、`release` がその祖先であることを確認します。説明データの事前検査後、GitHub APIで
`release` を非強制のfast-forwardで進め、Deployを明示的に起動します。これにより両ブランチの履歴が揃い、
`release` 側だけのマージコミットを増やしません。GitHubの表示は更新直後しばらく残る場合があります。

Promote Releaseが説明データやブランチの検査で失敗した場合、`release` は更新されません。
`release` の更新後にDeploy起動だけが失敗した場合は、Actionsの **Deploy → Run workflow** でbranch
`release` を選んで起動します。先に新しいリリースを進めず、Deployと公開履歴を確認してください。
GitHub Actionsの権限設定で `GITHUB_TOKEN` の `contents: write` と `actions: write` が許可される必要があります。

公開本文の概形（架空の例）：

> **投票のやり直し**（prod-2026.09.27.1）
>
> 本番公開日時（UTC）：〈health確認の完了日時〉
>
> **追加**：付箋を残したまま、そのフェーズの投票をやり直せるようになりました。
> 関連PR：#370、#371
>
> **利用上の注意**：投票をやり直すと、それまでの投票数はリセットされます。
>
> 公開commit ／ 前回との差分 ／ 本番Deployの成功記録

実際はPR・commit・差分・実行へのリンクと、重複判定用の `release-history` HTMLコメントが付きます。
GitHubのRelease作成日時と本番公開日時は別です。healthの成功は全機能の動作保証ではありません。
全体像・操作紹介は動画やプレゼン、実装の判断は関連PR・Issueを参照します。

## 成功判定・版・同時実行

Deployの `gate`、`deploy-api`（migrationを含む）、`deploy-app`、`health-check` の最新結果を確認します。
各attemptのジョブを取得し、再実行されなかった成功段階は引き継ぎます。
一度成功していても、新しい試行で失敗・skip・進行中になった段階を成功扱いしません。
最新のデプロイより前のhealth成功も使いません。
品質ゲートを飛ばして古いAPI/Appジョブだけを再実行する場合も、各Workerの更新直前に計画を再検査します。
その後に別の版が本番公開済みなら古い比較元を拒否し、意図しない巻き戻し・構成の混在を防ぎます。

`record-release` 自身の失敗でworkflow全体がfailureになっても、本番4段階の成功は独立して判定します。
これにより記録だけを再試行できます。

- 新規版：`prod-YYYY.MM.DD.N`。本番成功日時の日本時間で日付を決め、同日の既存最大番号+1を使います。
- 同じ公開事象の記録再試行・healthだけの再確認は同じタグを再利用します。本当にAPI/Appを再公開した場合は別版です。
- 内部の `deploymentId` に従来の `prod-actions-<run ID>-<API/Appを最後にデプロイしたattempt>` /
  `prod-manual-<成功確認UTC日時>` を保存し重複を防ぎます。旧タグは改名・付け替えしません。
- 時刻はUTC秒単位（日本時間は+9時間）。通常は最後のデプロイ後の最初の成功したhealth完了時刻です。
- 通常DeployとRecord Releaseは同じ `production-release` concurrency groupで直列化し、
  `queue: max` で最大100件まで待機します。上限超過の取消しはActionsで確認します。
- 前回の本番成功が未記録なら次の事前検査を止めます。先に記録を回復してください。
- ローカルやCloudflare画面での操作はActionsのロック外です。リリース担当が同時操作を避け、
  手動操作開始後も新しいDeployを起動しないでください。ローカル入口でも実行・待機中のDeployを検査します。

タグが異なるcommitを指す、同じ版がDraft/prerelease、識別情報が欠落・不一致、日時が前後する場合は
自動上書きしません。HTTP障害を「履歴なし」とみなさず停止します。記録済み本文の訂正も保持します。

## 記録だけを再実行する

通常は `$release` → `retry-record` です。以下は緊急・旧版の手動入口です。

Actions → **Record Release** → Run workflowで、branchは既定ブランチ（現在 `develop`）を選びます。
`run_id` と `attempt` に記録対象のDeployを指定します。`note_json` は空にします。
元の `record-release` ジョブだけをRe-runする方法も使えます。
記録失敗後にRe-run all jobsを選んでも、前attemptが成功・未記録なら事前検査で止めます。

```bash
gh workflow run release-history.yml --repo engineer-first/idea-boost --ref develop \
  -f run_id=対象のDeploy実行番号 -f attempt=確認する試行番号
```

このworkflowにはmigrationやWorkerデプロイの処理がありません。
Re-run all jobsや `npm run deploy` を「記録の回復」のために使わないでください。
成功済みの古い版を再試行しても、その版のURLを返し、本文や後続版を変えません。
APIエラー・応答喪失の後も同じ入力で再試行します。

## ローカル手動デプロイ

通常は `$release` を使います。ローカルから行う場合は `gh auth login`、
Cloudflareへの認証、クリーンな作業ツリー、GitHub上に存在する対象commitと説明JSONが必要です。
公開内容は `.github/release-note.json` の関連PRと差分で確認してから実行します。

```bash
npm run deploy
```

PR/Issue URLの入力は不要です。事前検査・本番health確認・履歴依頼を自動で行います。
本番URLは `https://ideaboost.dev`。migration → API → App → healthの成功後、
`.release-history/` に成功receiptを保存し、Record Releaseを自動起動します。
**コマンドの終了は記録workflowの受付まで**です。Actionsの成功とRelease URLまで確認してください。
Cloudflareアカウント・Worker設定が本番のものであること、環境設定による公開範囲は担当者が確認します。

記録workflowの起動や記録処理だけが失敗した場合は、出力されたreceiptを再送します。
ローカルの状態や時刻からreceiptを作り直しません。

```bash
npm run release:submit -- .release-history/出力されたファイル.json
```

receiptはGit管理しません。作業の証跡として保管します。必要に応じてログやWorker version IDを関連PR/Issueに残します。
個別の `deploy:api` / `deploy:app` / `deploy:migrate` は低水準の操作で、全体成功の自動記録はしません。
それらやCloudflare画面から更新した場合は、次の外部操作の記録手順を使います。

## 外部操作・ロールバックを記録する

migration・API・App・healthの結果、API/App共通のcommit、UTCの成功確認時刻、
Worker version ID、確認者をPR/Issueに残します。秘密は載せません。
異なるcommitのAPI/Appが混在している場合は単一版として記録せず、構成を揃えてから確認します。

レビュー済み説明JSONに `commit` と次の `deployment` を加えてreceiptを作ります（以下は架空の例）。
ロールバックでは `mode: "rollback"` と、失われる機能・必要な利用者対応を `notices` に必ず書きます。
過去commitに新しい記録スクリプトがなくても、最新の作業環境からreceiptを送れます。

```json
{
  "kind": "manual",
  "completedAt": "2026-09-26T03:00:00Z",
  "evidenceUrl": "https://github.com/engineer-first/idea-boost/issues/400",
  "migration": true,
  "api": true,
  "app": true,
  "health": true
}
```

外部操作の `true` は確認担当による成功の申告です。コードはCloudflare画面や証跡本文を検証しません。
`evidenceUrl` は外部操作の確認先として付けられます。`npm run deploy` が生成するreceiptには不要です。
確認後に `npm run release:submit -- receipt.json`、またはRecord Releaseの `note_json` にJSON全文を渡します。
後者では `run_id` / `attempt` を空にします。同じ操作を通常runとmanualの両方で記録しません。
巻き戻しや分岐も記録でき、差分は前回commitから今回commitへの2点比較になります。
これは復旧結果の履歴を残す仕組みであり、ロールバックやデータ復旧を実行・保証するものではありません。

ローカルで本文を確認するだけなら `npm run release:record -- receipt.json` を使えます。
従来の `--publish` 直接記録も残していますが、Actionsのキュー外なので通常はRecord Releaseを使います。

## 初回導入・役割・訂正

この実装だけのための正式Releaseや実績を作りません。Skill / workflowは先に既定ブランチへ導入します。
通常はSkillが実際の差分から説明を作り、初回もJSONの転記は不要です。
互換入口では説明JSONが欠けたまま本番へ進む場合は事前検査で止まります。

初回の比較基準は、導入時に確認できた直近の成功した
[Deploy #35807520854 / attempt 1](https://github.com/engineer-first/idea-boost/actions/runs/35807520854/attempts/1)、
health完了 `2026-09-23T01:50:15Z` の
[commit 24fc6570bcf80ad641e8160a15aa23d6e31e6439](https://github.com/engineer-first/idea-boost/commit/24fc6570bcf80ad641e8160a15aa23d6e31e6439) です。
初回の本文に記録開始基準を明記し、基準自体のReleaseや過去の全機能一覧は作りません。
導入までにそれより後の本番更新があれば、先に順に記録して比較元を更新します。
説明JSONがない旧Deployには、レビューした説明に `commit` と
`deployment: { "kind": "actions", "runId": 実行番号, "attempt": 試行番号 }` を付けたreceiptを用意し、
Record Releaseの `note_json` へ渡します。成功をActions APIで照合して通常と同じ版に記録するため、
そのrunをmanualとして二重登録しません。外部操作のみmanual receiptを使います。

下書き担当は説明を作り、確認担当は差分・公開範囲・注意事項をレビューし、
リリース担当は公開と履歴記録の完了・失敗の回復を確認します。個人は固定しません。
小規模運用で兼任する場合も確認内容を保存した説明とActionsの記録から辿れるようにします。

文面・リンクの訂正は同じReleaseを編集し、末尾に「訂正：〈UTC日時〉／〈内容と理由〉」を追記します。
版・commit・元の本番日時・比較元・証跡・`release-history` コメントは変えません。
対象commitや成功判定自体が誤っていた場合は冒頭に誤記録を明示し、次の記録を停止して調査します。
タグの付け替え・Release削除で誤りを隠さず、修復の方針と経緯をPR/Issueに残してください。

## 検証範囲と採用理由

GitHub Releasesは版・commit・差分・PRを一箇所にまとめられ、本文を読者別に二重管理しません。
要約はCLIでレビューし、不変のGit参照（互換入口は対象commit内のJSON）へ保存し、公開日時・成功判定・重複防止を自動化します。
通常の入口を自動で処理しつつ、外部手動操作も同じ記録形式へ合流させる方式です。

Vitestで成功・途中失敗・部分再試行・記録のみの再試行・再公開・ロールバック・未記録版の検出・
ローカルの実行順と失敗時の停止を確認します。workflowの入口・権限・依存・共通キューも検査します。
実際の本番デプロイ、GitHubのwrite権限、Release/tag作成、workflow間のキュー、Cloudflare実状態との対応は
初回運用で確認します。導入検証だけのために本番更新や架空の正式Releaseを作成しません。

公式仕様：[ジョブの再実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)、
[concurrencyとqueue](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、
[Releases API](https://docs.github.com/en/rest/releases/releases)、
[2点のcommit比較](https://docs.github.com/en/pull-requests/how-tos/commit-changes/comparing-commits)。
