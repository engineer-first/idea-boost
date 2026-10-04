# Issue と GitHub Project の運用

この文書を Issue の種類・作成・状態・自動化に関する正本とする。対象は `engineer-first/idea-boost` と、組織 Project [idea-flow-app (#3)](https://github.com/orgs/engineer-first/projects/3)。Project 名は旧来のままだが、運用対象リポジトリは `idea-boost`。

## Issue Type

Issue は GitHub の Issue Type で分類する。タイトル接頭辞やラベルで代用しない。

| Type         | 用途                                                     |
| ------------ | -------------------------------------------------------- |
| `相談・要望` | 方針・要件・優先度の相談、改善や機能の要望               |
| `PBI`        | ユーザー価値と受け入れ条件を示すプロダクトバックログ項目 |
| `Task`       | 実装など具体的な作業                                     |
| `Bug`        | 不具合・想定外の挙動                                     |
| `Spike`      | 不確実な点を調査して判断材料を得る作業                   |

Issue 作成時は `.github/ISSUE_TEMPLATE/` の Issue Forms または空の Issue を使う。フォームの必須欄は分類に必要な最小限に留め、背景・受け入れ条件・関連 Issue などは分かる範囲の任意記入とする。Issue Type はフォームから設定される。空の Issue は自由に記述し、Type は作成時または後から設定する。フォームに Project を埋め込まず、Project の自動追加を使う。

ユーザー操作を伴う PBI・作業 Issue では、受け入れ条件・デモ確認内容・完了条件に、分かる範囲で「誰が、どの画面で何をすると、画面で何が起きるか」を1行で書く。操作のない作業に手順を求めない。画面名やボタン名が未確定なら仮の表現と明記し、確定した仕様として扱わない。

PBI では、入口から結果の画面までの流れや画面図が必要な場合、任意の「利用の流れ・画面イメージ」欄にまとめる。受け入れ条件には確認できる結果を残す。
Issue の要件や不具合を理解するために必要な画面イメージは本文へ、後から得た再現画像・動画はコメントへ添付する。`gh issue create` / `gh issue edit` / `gh issue comment` の `--attach` を使い、画像・動画はリポジトリ外に保存する。本文の指定欄に置く場合は、`--body-file` に渡す本文のその欄へローカルファイルへの Markdown 参照を記載し、同じファイルを `--attach` に指定する。参照がない添付は本文末尾に追加される。投稿後は GitHub 上の表示を確認する。`pbi` のスクリプトで作った Issue に添付するときは、既存本文を取得して追記を保持した本文ファイルを作り、`gh issue edit --body-file` と `--attach` を併用する。添付のために作成スクリプトを再実行しない。

Issue Type の追加・変更・削除は組織全体に影響するため、他リポジトリへの影響を確認してから行う。

PBI を作成する場合は [PBI スキル](../../.agents/skills/pbi/SKILL.md)も使える。目的・受け入れ条件・デモ確認内容を1件にまとめ、ID を作成された Issue 番号から確定する（例: #340 → `PBI-340`）。受け入れ条件でデモ確認も伝わるなら、同じ内容を別欄へ複製しない。

## PBIとスプリント

- 思いつきは小さな Issue で起票してよい。Task / Bug / Spike / 種類なしなどの作業 Issue は、原則最終的に PBI へ親子関係で紐付ける。親 PBI は起票・着手時の必須条件ではなく、開発中・完了後に整理してよい。Blank issue は起票方法であり、Issue Type ではない。
- Milestone は定期自動割当に任せる。開発者・エージェントは着手前に確認・設定する必要はなく、反映待ち・対象期間外・現在sprint未確定でも作業を進めてよい。
- sprint 内の Issue は完了済みも含めて Milestone から確認し、後で PBI へまとめられる。open Issue は次の sprint へ移るため、過去の割当は GitHub の Milestone 変更履歴から確認する。PBI が別 sprint・未割当でも、作業 Issue 自身の Milestone を集計の起点にする。
- 成果は開始時に大まかに決め、後から追加・変更してよい。作業の完了見込みと残り時間に余裕があれば追加でき、代わりに何かを外す確認は必須ではない。厳しいときだけ範囲・優先順位を再検討する。
- PBI に目的と受け入れ条件・デモ確認内容をまとめる。sprint 全体の成果は Milestone 説明に短く書き、PBI 本文を複製しない。重大な変更には理由を一言残す。

sprint の日程・全体の成果は GitHub Milestone を正本とする。Milestone の最終日（due date）に review/demo と次sprintの planning を行う。

## 現在sprintへの自動割当

[Assign Current Sprint](../../.github/workflows/assign-current-sprint.yml)は毎時23分に、**未着手を含む全open Issue**を現在の sprint の Milestone へ割り当てる。Type・親・Project の Status を条件にしない。REST Issue API に混在する PR は除外する。

既存割当が以前・将来の sprint や非sprint Milestone でも、現在の sprint へ付け替える。次の sprint でも open なら繰り越し、closed Issue は最後の Milestone を保持する。繰越しは GitHub 標準の Milestone 変更履歴に残し、コメントや別台帳は追加しない。割当は着手・完了の判断ではなく、実作業の状態は Status で区別する。

自動割当は Milestone の説明内の `idea-boost-sprint:v2` JSON コメントに記録した `schema_version: 2`・`timezone: Asia/Tokyo`・`assignment_start_date` と、Milestone の `due_on` を使う。割当開始はJST 00:00、終了はdue日のJST 00:00未満とし、終了日は説明へ複製しない。次Milestoneの割当開始を前Milestoneのdue日へ登録すると、review/demoとplanning当日のJST 00:00から、新しいIssueと未完了のopen Issueを次期として扱う。実際の付け替えは定期実行時に反映される。

`assignment_start_date` は `YYYY-MM-DD` 形式で登録する。

```html
<!-- idea-boost-sprint:v2
{"schema_version":2,"timezone":"Asia/Tokyo","assignment_start_date":"YYYY-MM-DD"}
-->
```

次Milestoneが未登録なら作らず、該当なし・不正／旧schema・期間重複・対象がclosedの場合は自動割当だけを保留し、Actions Summaryに理由を残す。明示登録した開始日があれば、due未確定（null）のMilestoneは期限を捏造せず使える。後続を登録する際は前期のdueと次期の割当開始を揃え、期間を重ねない。titleや番号から日程を推測しない。

手動実行は default branch の `workflow_dispatch` から行い、`dry_run` は既定で true。更新前に Milestone と Issue を再取得し、現在割当と同じ・closed化・PRの場合は保持する。API 失敗は実行失敗として報告する。最終読取と更新の間に起きる手動操作との競合は、GitHub API の制約上完全には排除できない。

この workflow だけに `GITHUB_TOKEN` の `contents: read` と `issues: write` を指定する。既存 Project 用 App の権限変更・新しい PAT・secret は不要。default branch のコードだけを実行し、PR ブランチでは実行しない。定期実行は default branch へマージした後に有効になる。権限の根拠は [Issue更新API](https://docs.github.com/en/rest/issues/issues#update-an-issue)。

## Project 状態

Project の組み込み単一選択フィールド名は GitHub の仕様上 `Status`（画面によって英語表示）で、値は次の通り。会話・文書では「状態」と呼ぶ。

| 状態         | 意味と設定基準                                       |
| ------------ | ---------------------------------------------------- |
| `未整理`     | 作成直後。背景や優先度の確認がまだ必要               |
| `壁打ち中`   | 方針・要件・優先度を相談・整理している               |
| `着手可能`   | 作業内容と完了条件が明確で、開始できる               |
| `作業中`     | 担当者が実作業を開始した                             |
| `レビュー中` | 直接紐づく単一 PR に対して、実際にレビューを依頼した |
| `完了`       | 成果を確認し、完了と判断した                         |
| `見送り`     | 今回は対応しないと判断した。完了とは区別する         |

すべての新規 Issue は `未整理` から始める。内容・完了条件を確認して `着手可能` にした後、次の GitHub 操作に状態更新を連動させる。

| GitHub の操作                                           | 状態の更新              | 対象・条件                                                                                      |
| ------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| Assignees → Assign yourself                             | `着手可能` → `作業中`   | open で子 Issue のない Task / Bug / Spike。実行者と追加された担当者が一致し、現在も担当している |
| 対応する Draft PR を作成                                | `着手可能` → `作業中`   | 同じ3 Type、直接対応する PR が1件、現在も open / Draft                                          |
| PR の Reviewers から依頼、または依頼が残る Draft の解除 | `作業中` → `レビュー中` | 下記のレビュー条件を満たす                                                                      |
| PR を Convert to draft                                  | `レビュー中` → `作業中` | 同じ単一 PR による自動更新の記録と、現在の状態更新時刻が一致する                                |
| `Closes #番号` のある PR を `develop` へマージ          | 現在の状態 → `完了`     | GitHub の closing reference が対象 Issue と一致する。Issue は GitHub 標準機能で閉じる           |
| Issue の Status → 完了                                  | Issue をクローズ        | 人が成果を確認した後に操作。Project の標準 automation を使う                                    |

他人への担当者割当て、割当て解除、Assign to Agent、Milestone・Priority・Type・Relationships の変更、ブランチ作成、通常 PR 作成、closing reference のないマージ、承認・変更要求だけでは状態を動かさない。
PBI の担当者は成果全体の責任者を表すため、アサインから開始とみなさない。Issue の close / reopen から状態を推測しない。

## Pull Request とレビュー状態

PR 本文の `<!-- issue-ref:番号 -->` が、その PR が直接対応する Issue の機械判定用マーカー。PR 作成時、`feature/293-description` や `feature/#293-description` のようにブランチ名の最初の区切りが Issue 番号なら、ワークフローが `Closes #293` とマーカーを追記する。`develop` へのマージ時に GitHub が Issue を閉じ、状態同期が Project を `完了` にする。`codex/` や日付形式（`2026-09-20`）のブランチ名、任意箇所に数字を含む名前からは Issue を推測しない。無関係な PR や、マージだけで Issue 全体を完了しない PR は、番号を含むブランチ名にしない。

リンク追記と状態同期は並行して始まるため、マーカーがまだない場合だけ、同一リポジトリの番号付きブランチを直接参照として扱う。fork のブランチ名、不正・複数のマーカーでは補完しない。

次の条件をすべて満たすときだけ、レビュー依頼または Draft 解除時に直接紐づく Issue を `レビュー中` にする。

- イベント実行者に対象リポジトリの write / maintain / admin 権限がある。権限照会に失敗したら更新しない。
- PR が open かつ Draft ではなく、レビュー依頼が現在も残っている。
- 有効な単一マーカー、または上記の同一リポジトリのブランチにより対象 Issue が確定する。イベント時と最新の参照が違う場合は更新しない。
- Issue が open で子 Issue を持たず、Type が `Task` / `Bug` / `Spike` / `PBI`。
- Issue が Project #3 に未アーカイブ状態で登録され、現在の状態が `作業中`。
- 同じ Issue に直接対応する PR がこの1件だけである。

一般的な `#番号` の記述、Issue の親子関係、他の Issue の状態は推測に使わない。条件が不明・複数 PR・Project 権限エラーの場合は状態を変更せず、ワークフローを失敗またはスキップとして記録する。レビュー依頼取消し・承認・変更要求は Issue 状態を自動変更しない。

### 自動更新と手動変更の扱い

- 通常は実行者の write / maintain / admin 権限を確認する。同一リポジトリの Issue 番号付き実装ブランチから作成された Draft PR に限り、信頼できるブランチ情報を開始の根拠にできる。これにより Agent の Draft PR も扱う。外部 fork の場合やレビュー更新では、この例外を使わない。
- Project のテキストフィールド `自動レビュー元` にリポジトリ・PR 番号・Status の更新時刻を記録する。通常は人が編集しない。手動で状態を変更した後は、元の状態へ戻しても時刻が違うため Draft 復帰では上書きしない。
- `.github/workflows/issue-project-status.yml` は Project 更新をキューで直列化し、進行中の処理をキャンセルしない。最大100件の待機を超えた場合は GitHub がキャンセルする。
- 変更直前にも PR・Issue・Project を再取得し、状態や記録が変わっていたらスキップする。GitHub API は手動操作との原子的な条件付き更新を提供しないため、最終読取と更新の間の競合までは完全に排除できない。
- Actions Summary に操作、対象 Issue、変更前後、スキップ理由を記録する。API 失敗は失敗として報告する。状態更新後の記録保存に失敗した場合は、自動復帰せず手動で確認する。

### 状態同期の初期設定

自己アサイン・Draft PR・レビュー依頼・Draft復帰の連携はPR #339で導入済み。必要な設定と、未設定時の動作は以下の通り。

GitHub Actions の `GITHUB_TOKEN` は組織 Project を更新できないため、次の権限に絞った GitHub App が必要。App は `idea-boost` リポジトリにのみインストールする。

- 組織権限: Projects read/write
- リポジトリ権限: Issues read、Pull requests read、Metadata read（実行者の権限照会）
- Project のテキストフィールド: `自動レビュー元`
- Repository variable: `ISSUE_PROJECT_APP_CLIENT_ID`
- Repository secret: `ISSUE_PROJECT_APP_PRIVATE_KEY`

ワークフローは実行時に `actions/create-github-app-token` で `idea-boost` に限定した短命 token を発行する。個人 PAT は使わない。実行コードは PR イベントなら base SHA、Issue イベントなら default branch のイベント SHA から取得し、PR 側の変更コードを実行しない。`client-id` は [v3 の公式入力定義](https://github.com/actions/create-github-app-token/blob/v3/action.yml)に準拠する（`app-id` は非推奨）。App の作成・インストール・権限付与と秘密鍵の登録は組織管理者が明示的に承認した後に行う。未設定の間は警告を出して状態同期をスキップする。

## Project automation と既存項目

- Project の auto-add は `idea-boost` の open Issue 全種を対象とする。GitHub の自動追加は新規作成・更新時に適用され、既存 Issue の一括追加には使わない。
- `Item added to project` の既定状態を `未整理` にする。CLI 作成スクリプトも同じ初期値を1回だけ設定する。
- `完了` を明示的に選んだ場合に Issue を閉じる自動化は維持する。逆方向は一般の close イベントではなく、`Closes` を含む PR の `develop` へのマージだけを Actions で `完了` にする。
- Issue の close/reopen、PR のリンク/merge、レビュー承認/変更要求から状態を推測する既定 automation は無効にする。
- 状態は7種類だけを使う。分類は Issue Type、進捗は Status に統一する。

Project の作業・状態を変えるときは、Issue本文と Milestone は保ち、対象の状態フィールドのみを必要に応じて更新する。

## 日常のビュー

| ビュー                                                                       | 読む目的                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| [ホワイトボード](https://github.com/orgs/engineer-first/projects/3/views/2)  | 完了・見送りを除いた全体の状態                        |
| [今回の作業](https://github.com/orgs/engineer-first/projects/3/views/3)      | 確定した sprint の全open Issue・Draft item・関連 PR   |
| [PBI階層](https://github.com/orgs/engineer-first/projects/3/views/4)         | PBI の受け入れ条件と子 Issue の進捗（Show hierarchy） |
| [自分の作業](https://github.com/orgs/engineer-first/projects/3/views/6)      | ログインした本人が担当する未完了の作業                |
| [レビュー待ち](https://github.com/orgs/engineer-first/projects/3/views/7)    | Status がレビュー中の項目                             |
| [PBI未紐づけ](https://github.com/orgs/engineer-first/projects/3/views/8)     | 完了済みも含めて、親のない作業を PBI へ整理する候補   |
| [今回やったこと](https://github.com/orgs/engineer-first/projects/3/views/11) | その sprint で完了した Issue と現在残っている Issue   |

「今回の作業」は未着手のバックログも含むため、実作業は Status で区別する。「今回やったこと」はその sprint の完了分と現在の残件を読む。繰り越した open Issue は次の sprint へ移り、過去の全所属一覧にはならない。

各ビューは `repo:engineer-first/idea-boost` を対象にする。自分の作業は `assignee:@me` で絞る。
「今回の作業」は `milestone:"<対象Milestone名>" is:open,draft,pr`、「今回やったこと」は `is:issue milestone:"<対象Milestone名>"`。切り替え時に対象Milestoneの値へ更新する。Iteration 用の `@current` は Milestone に使わない。

「PBI階層」は `is:issue type:PBI` で Show hierarchy を使う。「PBI未紐づけ」は作業 Issue を `no:parent-issue` で絞る。親がない根の Issue を拾うため、PBI 以外の親を持つ子を直接表示しない。根とその子 Issue を確認して PBI へ整理する（例: #394/#395 → #365、#455 → #418 は根の #365/#418 から確認する）。Bug・種類なしも対象で、open だけに絞らない。

新規 Issue は通常の作成画面から作り、`未整理` を初期状態にする。絞り込んだ Project ビューから項目を作るとフィルター値が適用されるため、作成後の状態・担当者を確認する。[GitHub のフィルター仕様](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects)

## 今後の改善

未実装のIssue操作・自動化候補は[Issue #393](https://github.com/engineer-first/idea-boost/issues/393)で背景・判断・完了条件を整理する。進捗は文書へ複製しない。
