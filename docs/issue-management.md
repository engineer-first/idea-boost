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
| `DemoGoal`   | PBI に紐づく、スプリントレビューで確認する成果           |

Issue 作成時は `.github/ISSUE_TEMPLATE/` の Issue Forms または空の Issue を使う。フォームの必須欄は分類に必要な最小限に留め、背景・受け入れ条件・関連 Issue などは分かる範囲の任意記入とする。Issue Type はフォームから設定される。空の Issue は自由に記述し、Type は作成時または後から設定する。フォームに Project を埋め込まず、Project の自動追加を使う。

組織には既存の `Feature` Type もあるが、idea-boost の標準運用では上表の6 Typeを使う。既存 Type は他リポジトリへの影響を避けるため変更・削除しない。Type の追加は組織全体で有効になるため、今後も他リポジトリへの影響を確認してから行う。

PBI と DemoGoal をまとめて作る場合は [PBI DemoGoal スキル](../.agents/skills/pbi-demogoal/SKILL.md)を使う。スクリプトが PBI ID を作成された Issue 番号から確定し（例: Issue #340 → `PBI-340`）、両 Issue を作成して Project に追加する。スプリントの割当ては作成後に GitHub Milestone で行う。

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
| Issue の Status → 完了                                  | Issue をクローズ        | 人が成果を確認した後に操作。Project の標準 automation を使う                                    |

他人への担当者割当て、割当て解除、Assign to Agent、Milestone・Priority・Type・Relationships の変更、ブランチ作成、通常 PR 作成・マージ、承認・変更要求だけでは状態を動かさない。
PBI / DemoGoal の担当者は成果全体の責任者を表すため、アサインから開始とみなさない。Issue の close / reopen から状態を推測しない。

## Project の刷新

2026-09-20 の刷新で旧分類3種類（PBI分類・DemoGoal分類・Todo）と未使用の `Board Column` フィールドを廃止した。旧分類の open Issue 18件を `未整理` に移し、7状態を作業の流れ順に並べ直した。
これはユーザーが依頼した一度限りの移行で、旧分類から作業開始・完了を推測したものではない。既存の `作業中` 2件・`完了` 74件は維持し、Issue 本文・担当者・Milestone は変更していない。
以後、旧分類の互換値・二重の状態フィールドは作らない。

## Pull Request とレビュー状態

PR 本文の `<!-- issue-ref:番号 -->` が、その PR が直接対応する Issue の機械判定用マーカー。PR 作成時、`feature/293-description` や `feature/#293-description` のようにブランチ名の最初の区切りが Issue 番号なら、ワークフローが `Refs #293` とマーカーを追記する。これは Issue への参照であり、Issue を閉じない。`codex/` や日付形式（`2026-09-20`）のブランチ名、任意箇所に数字を含む名前からは Issue を推測しない。無関係な PR は、番号を含むブランチ名にしない。

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

Project の分類刷新は反映済み。自己アサイン・Draft PR・レビュー依頼・Draft 復帰の新しい連携は、PR #339 を既定ブランチ `develop` にマージした後のイベントから有効になる。

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
- `完了` を明示的に選んだ場合に Issue を閉じる自動化は維持する。
- Issue の close/reopen、PR のリンク/merge、レビュー承認/変更要求から状態を推測する既定 automation は無効にする。
- 状態は7種類だけを使う。分類は Issue Type、進捗は Status に統一する。

Project の作業・状態を変えるときは、Issue本文と Milestone は保ち、対象の状態フィールドのみを必要に応じて更新する。

## 今後の改善案

未実装の候補と導入順は [Issue 操作と自動化の改善案](issue-automation-proposals.md)にまとめる。現行の状態遷移ルールはこの文書を正本とする。
