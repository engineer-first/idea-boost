# スクラム運用ドキュメント

このディレクトリは、学校スクラム開発で使うホワイトボード、GitHub Issues / Projects、AI向け文脈の参照先を迷わず確認するための場所です。

アプリ仕様や設計資料は`docs/`直下または別の仕様用ディレクトリに置き、このディレクトリにはスクラム運用に関する文書だけを置きます。

PBI、デモゴール、実装タスク、進捗状態の正本はGitHub Issues / Projectsです。物理ホワイトボードはチームで話すための場として使い、MarkdownにPBI本文やデモゴール本文を二重管理しません。

## ドキュメント一覧

| ファイル                                                       | 役割                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [whiteboard-github-projects.md](whiteboard-github-projects.md) | 物理ホワイトボードとGitHub Projectsの連携ルール |
| [sprints.md](sprints.md)                                       | スプリント期間と管理理由                        |

## 正本

| 対象           | 正本                          |
| -------------- | ----------------------------- |
| PBI            | `type:PBI`のGitHub Issue      |
| デモゴール     | `type:DemoGoal`のGitHub Issue |
| 実装タスク     | GitHub Issue                  |
| 進捗状態       | GitHub Projectの`Status`      |
| スプリント対象 | GitHub Milestone              |
| ホワイトボード | チームで話すための短い見出し  |

PBI、デモゴール、スプリントタスク、バグを作るときは、GitHub Issue作成画面のテンプレートを使います。分類は`title`、`type`、`assignees`で揃えます。

スプリント対象は、Issue作成後にGitHub Milestoneで管理します。

## よく使うリンク

| 用途                                    | URL                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Project                          | [idea-boost Project](https://github.com/orgs/engineer-first/projects/3)                                                                              |
| openの実装タスクだけを見る              | [open task issues](https://github.com/engineer-first/idea-boost/issues?q=is%3Aissue%20state%3Aopen%20type%3ATask)                                    |
| PBIとデモゴールを除いたopen Issueを見る | [open issues without PBI/DemoGoal](https://github.com/engineer-first/idea-boost/issues?q=is%3Aissue%20state%3Aopen%20-type%3APBI%20-type%3ADemoGoal) |

標準のIssues一覧にはPBIやデモゴールも表示されます。実装中の作業を見るときは、上の`openの実装タスクだけを見る`リンクを使います。

## スプリント期間

スプリント期間は[sprints.md](sprints.md)にまとめます。

## ホワイトボードの書き方

ホワイトボードには短い表記だけを書きます。

```text
PBI-08 ログイン体験
DEMO-08 ログイン体験
#12 Googleログインボタン
```

長い説明、受け入れ条件、技術メモはIssue本文に書きます。

`Todo`、`Doing`、`Done`は、スプリントタスクとバグの付箋を動かす場所です。独立した「スプリントタスク」列は作りません。

## ホワイトボード写真

ホワイトボード写真は、原則としてリポジトリでは管理しません。

IssueとProjectを正にして、人がIssue状態に合わせて物理付箋を動かす運用なら、写真を毎日残す必要は薄いです。証跡として残したい日だけ、Google Driveなどリポジトリ外に保存します。

## スプリント識別

スプリント対象かどうかは、GitHub Milestoneで管理します。

Projectフィールドやラベルを増やさず、`Sprint 1`、`Sprint 2`、`Sprint 3`、`Sprint 4`のmilestoneを使います。

## AIに依頼しやすい問い

- `GitHub ProjectとPBI Issue、デモゴールIssueを見て、レビュー前の確認事項を整理してください`
- `PBI IssueとデモゴールIssueを見て、まだIssue化されていないタスクを洗い出してください`
- `DoingのIssueを見て、今日確認すべきことを短くまとめてください`
- `DoneのIssueから、スプリントレビューで話す順番を提案してください`
