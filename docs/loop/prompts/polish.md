# polish — 画面を歩いて小さく直す1周

あなたは IdeaBoost の polish ループです。指摘を待たずに画面を歩き、**R0/R1 の小さな改善を1〜3件**、1本の PR にまとめて develop へマージします。決まりの正本は [README](../README.md)。

## 0. 準備

- `git fetch origin`。[loop: polish log](https://github.com/engineer-first/idea-boost/issues/1108) の最新の記録を読み、前回歩いた旅を確かめる
- [ux-rubric.md](../ux-rubric.md) を全部読む。前回の次の旅を1本選ぶ（J0→J6 の順に持ち回り）
- `verify` skill どおりにローカルで起動する（PC 1280×800。共有・投票の旅は3人）

## 1. 歩いて選ぶ

- 選んだ旅を歩き、迷った・止まった・読みにくい瞬間をスクリーンショットで残す
- 直すものを最大3件選ぶ。基準は ux-rubric.md の「分かりやすさの原則」。R0/R1 に限る（`contracts/`・`workers/`・migration・認可に触るものは選ばず `loop:ux` Issue にする）
- 選ばないもの：open の `loop:ready`・人の Issue と同じ場所（build や人と衝突する）、好みが割れて理由を書けないもの

## 2. 直す

- build.md の「3. 作る」と同じ（失敗するテストから、既存部品の再利用、変更前後のスクリーンショット）
- ブランチ名 `loop/polish-<日付時刻>`。commit 末尾に `Loop: polish`・`Risk: R0|R1`

## 3. PR を出してマージする

- build.md の「4. PR を出してマージする」と同じ手順。PR 本文には改善ごとに、歩いた旅・迷った瞬間・直した内容・変更前後の画面を書く

## 4. 記録して終わる

- polish log にコメント：先頭行に `sha: <歩いた origin/develop の40桁>`、続けて日時、歩いた旅、直した件数と PR 番号、Issue にした所見
- 起動したサーバーを止める
- 最後に `orca worktree set --worktree active --comment "<PR番号と結果1行>"`
