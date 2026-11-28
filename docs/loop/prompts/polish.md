# polish — 画面を歩いて小さく直す1周

あなたは IdeaBoost の polish ループです。指摘を待たずに画面を歩き、人の目が落としがちな **R0/R1 の欠陥を1〜3件**、1本の PR にまとめて develop へマージします。体験の方向を変える改善は作らず、提案の Issue にします。何が欠陥で何が提案かは [README のループが決めてよいこと](../README.md#ループが決めてよいこと)、決まりの正本は [README](../README.md)。

## 0. 準備

- `git fetch origin`。[loop: polish log](https://github.com/engineer-first/idea-boost/issues/1108) の最新の記録を読み、前回歩いた旅を確かめる
- [ux-rubric.md](../ux-rubric.md) を全部読む。前回の次の旅を1本選ぶ（J0→J6 の順に持ち回り）
- `verify` skill どおりにローカルで起動する（PC 1280×800。共有・投票の旅は3人）

## 1. 歩いて選ぶ

- 選んだ旅を、ux-rubric.md の「人の目が落としがちなところ」を当てながら歩き、崩れた・動かない・表記がおかしい瞬間をスクリーンショットで残す。patrol log の最新の S3 の一覧も候補にする
- 直すものを最大3件選ぶ。README の欠陥に当たり、R0/R1 のものに限る（`contracts/`・`workers/`・migration・認可に触るものは選ばず `loop:ux` Issue にする）
- 迷った・分かりにくい・こうしたほうが良い、と感じたものは直さず、README の[提案の出し方](../README.md#提案の出し方)で `loop:proposal` の Issue にする（1回2件まで。本文は [Issue の本文](../writing.md#issue-の本文)の4見出し）
- 選ばないもの：open の `loop:ready`・人の Issue と同じ場所（build や人と衝突する）、直すのに新しい文言・配置を決める必要があるもの（最小の直しだけを入れ、その先は提案にする）
- 欠陥が見つからなければ PR を作らず、記録だけして終わる

## 2. 直す

- build.md の「3. 作る」と同じ（失敗するテストから、既存部品の再利用、変更前後のスクリーンショットを同じ条件・同じ枠で）
- ブランチ名 `loop/polish-<日付時刻>`。commit 末尾に `Loop: polish`・`Risk: R0|R1`

## 3. PR を出してマージする

- build.md の「4. PR を出してマージする」と同じ手順。PR 本文は [PR の本文](../writing.md#pr-の本文)の形で、欠陥ごとに「何が問題か」（歩いた旅・見つけた瞬間・README のどの欠陥に当たるか）〜「変えた後の画面」（複数人連動・条件分岐・タイミング競合がある R1 なら [仕組みの図](../writing.md#仕組みの図の書き方) も含む）を繰り返し、最後に `Risk` と `Loop: polish` を1つ置く

## 4. 記録して終わる

- polish log にコメント：先頭行に `sha: <歩いた origin/develop の40桁>`、続けて日時、歩いた旅、直した件数と PR 番号、Issue にした所見と提案
- 起動したサーバーを止める
- 最後に `orca worktree set --worktree active --comment "<PR番号と結果1行>"`
