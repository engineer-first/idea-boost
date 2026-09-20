# Issue と GitHub Project の運用

この文書を Issue の種類・作成・状態・自動化に関する正本とする。対象は `engineer-first/idea-boost` と、組織 Project [idea-flow-app (#3)](https://github.com/orgs/engineer-first/projects/3)。Project 名は旧来のままだが、運用対象リポジトリは `idea-boost`。

## Issue Type

Issue は GitHub の Issue Type で分類する。タイトル接頭辞やラベルで代用しない。

| Type       | 用途                                                     |
| ---------- | -------------------------------------------------------- |
| `相談`     | 方針・要件・優先度を人と整理する相談                     |
| `PBI`      | ユーザー価値と受け入れ条件を示すプロダクトバックログ項目 |
| `Task`     | 実装など具体的な作業                                     |
| `Bug`      | 不具合・想定外の挙動                                     |
| `Spike`    | 不確実な点を調査して判断材料を得る作業                   |
| `DemoGoal` | PBI に紐づく、スプリントレビューで確認する成果           |

Issue 作成時は `.github/ISSUE_TEMPLATE/` の Issue Forms を使う。必須欄は分類に必要な最小限に留め、背景・受け入れ条件・関連 Issue などは分かる範囲の任意記入とする。Issue Type はフォームから設定される。フォームに Project を埋め込まず、Project の自動追加を使う。

組織には既存の `Feature` Type もあるが、idea-boost の標準運用では上表の6 Typeを使う。既存 Type は他リポジトリへの影響を避けるため変更・削除しない。Type の追加は組織全体で有効になるため、今後も他リポジトリへの影響を確認してから行う。

PBI と DemoGoal をまとめて作る場合は [PBI DemoGoal スキル](../.agents/skills/pbi-demogoal/SKILL.md)を使う。スクリプトが PBI ID を既存 Issue から自動採番し、両 Issue を作成して Project に追加する。スプリントの割当ては作成後に GitHub Milestone で行う。

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

すべての新規 Issue は `未整理` から始める。Issue の作成・クローズ・再オープン・PR の作成やマージだけでは、作業開始・完了とみなさない。状態は人が判断して変更する。ただし、レビュー依頼の条件をすべて満たす場合の `レビュー中` と、`完了` を選んだ後の Issue クローズだけは Project automation が行う。

`旧・PBI分類` / `旧・DemoGoal分類` / `旧・Todo` は旧運用の状態値を引き継いだもの。過去の項目を一括で再分類せず、次に扱う際に内容を確認して適切な状態へ移す。未確認の既存 Issue を `未整理` や `着手可能` と推測して書き換えない。

## Pull Request とレビュー状態

PR 本文の `<!-- issue-ref:番号 -->` が、その PR が直接対応する Issue の機械判定用マーカー。PR 作成時、`feature/293-description` や `feature/#293-description` のようにブランチ名の最初の区切りが Issue 番号なら、ワークフローが `Refs #293` とマーカーを追記する。これは Issue への参照であり、Issue を閉じない。`codex/` や日付形式（`2026-09-20`）のブランチ名、任意箇所に数字を含む名前からは Issue を推測しない。無関係な PR は、番号を含むブランチ名にしない。

次の条件をすべて満たすときだけ、レビュー依頼または Draft 解除時に直接紐づく Issue を `レビュー中` にする。

- PR が open かつ Draft ではなく、レビュー依頼が現在も残っている。
- PR 本文の有効な `issue-ref` マーカーが1つで、Issue 番号と一致する。
- Issue が open で子 Issue を持たず、Type が `Task` / `Bug` / `PBI`。
- Issue が Project #3 に未アーカイブ状態で登録され、現在の状態が `作業中`。
- 同じ Issue に直接対応する PR がこの1件だけである。

一般的な `#番号` の記述、Issue の親子関係、他の Issue の状態は推測に使わない。条件が不明・複数 PR・Project 権限エラーの場合は状態を変更せず、ワークフローを失敗またはスキップとして記録する。担当者割当て・レビュー依頼取消し・承認・変更要求は Issue 状態を自動変更しない。

### レビュー同期の初期設定

GitHub Actions の `GITHUB_TOKEN` は組織 Project を更新できないため、次の権限に絞った GitHub App が必要。App は `idea-boost` リポジトリにのみインストールする。

- 組織権限: Projects read/write
- リポジトリ権限: Issues read、Pull requests read
- Repository variable: `ISSUE_PROJECT_APP_CLIENT_ID`
- Repository secret: `ISSUE_PROJECT_APP_PRIVATE_KEY`

ワークフローは実行時に `actions/create-github-app-token` で `idea-boost` に限定した短命 token を発行する。個人 PAT は使わない。App の作成・インストール・権限付与と秘密鍵の登録は組織管理者が明示的に承認した後に行う。未設定の間は警告を出してレビュー状態同期をスキップする。

## Project automation と既存項目

- Project の auto-add は `idea-boost` の open Issue 全種を対象とする。GitHub の自動追加は新規作成・更新時に適用され、既存 Issue の一括追加には使わない。
- `Item added to project` の既定状態を `未整理` にする。CLI 作成スクリプトも同じ初期値を1回だけ設定する。
- `完了` を明示的に選んだ場合に Issue を閉じる自動化は維持する。
- Issue の close/reopen、PR のリンク/merge、レビュー承認/変更要求から状態を推測する既定 automation は無効にする。
- 現在の状態値を持つ既存 Issue は一括変更しない。`Doing` は `作業中`、`Done` は `完了` に選択値を保ったまま名称変更し、`PBI` / `Demo Goal` / `Todo` はそれぞれ `旧・PBI分類` / `旧・DemoGoal分類` / `旧・Todo` と明示して残す。

Project の作業・状態を変えるときは、Issue本文と Milestone は保ち、対象の状態フィールドのみを必要に応じて更新する。
