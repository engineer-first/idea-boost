# ホワイトボードと GitHub Projects 連携

## 目的と役割

物理ホワイトボードの話しやすさを残しながら、GitHub に作業内容と履歴を残し、チームと AI が進捗を確認できるようにします。完全な自動同期は目指さず、人が会話の結果を GitHub Issue / Project に反映します。

| 場所                     | 正として扱うもの                                         |
| ------------------------ | -------------------------------------------------------- |
| 物理ホワイトボード       | 今日の共通認識、会話中の並び替え、スプリント全体の見通し |
| GitHub Issues / Projects | Issue 内容、状態、担当者、PR との紐づき                  |
| Markdown                 | 運用ルールと参照先                                       |

Issue Type・フォーム・Project 状態の定義は[Issue と GitHub Project の運用](issues.md)を参照してください。PBI の目的・受け入れ条件・デモ確認内容、技術メモは Issue に記録し、Markdown や付箋に複製しません。

## 付箋の書き方

ホワイトボードには短い見出しと Issue 番号だけを書きます。

```text
PBI-13 開発テーマ比較
#312 ログイン画面を作る
```

原則として1枚の付箋を1つの Issue に対応させます。大きすぎる作業は Issue を分割してから付箋も分けます。詳細な作業手順・完了条件・背景は Issue 本文に書きます。

## 写真とスプリント

ホワイトボード写真は原則としてリポジトリに保存しません。証跡が必要な場合だけ Google Drive などリポジトリ外に保存します。

話し合いでは物理ボードで相談・並び替えを行い、確定した変更だけ GitHub へ反映します。重大な成果・範囲の変更は理由を一言残します。

sprint の日程・全体の成果は GitHub Milestone を正本とし、最終日に review/demo と次sprintの planning を行います。詳細は[Issue 運用](issues.md#pbiとスプリント)を参照してください。

## 日常の参照先

- [GitHub Project #3](https://github.com/orgs/engineer-first/projects/3): 状態と担当
- [Milestones](https://github.com/engineer-first/idea-boost/milestones): スプリントの期間と対象
- [Issue運用](issues.md): 種類・作成・自動化

PBI・Task・Bug・Spike・種類なし・相談の内容はGitHub Issueを正本とし、本文や受け入れ条件をMarkdownと二重管理しない。
