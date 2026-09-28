---
name: github-media
description: GitHub の PR や Issue にローカルの画像・動画を添付するときに使う。動作確認資料や画面イメージの投稿先を選び、GitHub 上で表示を確認する。
---

# GitHub に画像・動画を添付する

画像・動画はリポジトリへコミットせず、GitHub の添付ファイルとして公開する。
PR・Issue の作成や本文全体の執筆、画面の撮影そのものは、それぞれの作業手順に従う。

## 投稿先を選ぶ

- PR の動作確認、変更前後の比較、操作動画は通常 PR コメントにまとめる。PR 本文を扱う場合は、短い結果とコメントへのリンクを残す。本文への埋め込みを指定されたら、その指定に従う。
- Issue の要件を理解するための画面イメージや、主要な不具合の再現画像は Issue 本文に置く。後から得た調査結果や追加資料はコメントに置く。
- このリポジトリの Issue 作成・編集では [Issue 運用](../../../docs/issue-management.md)、PR 作成・本文更新では [write-pr](../../../.claude/skills/write-pr/SKILL.md) に従う。
- `pbi-demogoal` のスクリプトで作る Issue は、作成後に本文を取得し、既存内容を保持して `gh issue edit --attach` する。添付のために作成スクリプトを再実行しない。

## 添付して確認する

1. 対象のリポジトリと PR / Issue、投稿先、ファイルの内容を確認する。撮影した資料はリポジトリ外の一時ディレクトリに置き、意図しない秘密情報や個人情報が写っていないか見る。
2. `gh` の対象コマンドに `--attach` があること、GitHub に認証できることを確認する（GitHub CLI 2.99.0 以降）。画像・動画の種類とサイズは [GitHub の添付制限](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)に合わせる。CLI に添付機能がない、または権限が足りない場合は、利用できる GitHub の画面から添付する。
3. コメントは `gh pr comment` / `gh issue comment`、本文は `gh pr create` / `gh pr edit` / `gh issue create` / `gh issue edit` に `--attach` を付ける。作業ディレクトリから対象リポジトリを特定できない場合は `-R engineer-first/idea-boost` を指定する。複数行の文章は一時 Markdown ファイルを `--body-file` で渡す。本文中で表示位置を決めるときは、添付するファイルと同じローカルパスを Markdown に書く。`gh` がその参照をアップロード先 URL に置き換える。動画をプレーヤー表示する `![](動画のパス)` は独立した段落に置く。[GitHub CLI の公式手順](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)を参照する。
4. 既存本文を編集する前に最新の本文を取得し、人や Bot の追記を保持する。投稿後は対象ページで画像・動画の表示と説明を確認し、コメントならその URL を返す。PR 本文からリンクする場合は、そのリンクも確認する。
5. コマンドが失敗したら対象の本文・コメントを読み、添付の一部が既に投稿されていないか確認してから再試行する。表示確認まで終わる前に一時ファイルを消さない。完了できなければ停止箇所と未反映の資料を報告する。
