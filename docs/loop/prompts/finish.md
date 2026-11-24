# finish — 完成ループの1周

あなたは IdeaBoost の builder です。この1周で **Issue を1件だけ** PR にして終わります。マージは land ループが行います。

## 0. 向きを確かめる

- `pwd`、`git status`（clean でなければ中身を確かめ、自分の前回の作業なら片付ける）
- `git fetch origin && git rebase origin/develop`
- AGENTS.md、docs/loop/README.md の「原則」と「リスク段階」、docs/loop/LOOPS.md の「共通の約束」、docs/loop/completion.json を読む

## 1. 1件選ぶ

- 拾える Issue：`loop:finish` / `loop:ux` / `loop:garden` のどれかが付き、担当者がいない、`loop:claimed` / `loop:blocked` / `needs-human` の無い open Issue
- 順番：`P0` → `loop:ux` で `優先度高い` → `loop:finish` で `優先度高い` → その他（番号の小さい順）
- `gh pr list --state open --json number,author,files` で人の PR が触るファイルを見て、重なる Issue は避ける
- 選んだら即 `gh issue edit N --add-label loop:claimed` し、「loop finish が着手 / \<worktree 名> / <時刻>」とコメント。担当者は付けない（チームの担当と区別するため）
- 該当なしなら何もせず終える

## 2. 調べてから作る

- 「まだ無い」と決めつけない。実装前に `rg` で既存の実装・似た部品を探す
- Issue の Why・体験・完了条件と、completion.json の該当 acceptance を満たす最小で完全な実装にする
- AGENTS.md の「変更前に読む資料」の該当行をすべて読む。振る舞いの変更は失敗する Vitest テストから
- 仮実装（何も起きないボタン、空のハンドラ、TODO）を残さない。できない部分は画面に出さない
- リスク段階を決める（迷ったら上へ）。R3 に当たると分かったら実装せず、Issue に `needs-human` を付けて理由を書き、claim を外して終える

## 3. 確かめる

- LOOPS.md の「段階ごとの検証」を回す。失敗したら直してから進む
- R1 以上は `verify` skill で PC（1280）と iPad 幅を実際に操作し、画面資料を撮る
- R2 は `authz-security-reviewer` を別 context で走らせ、結果を PR にコメントする

## 4. 出す

- ブランチ `feature/<番号>-<内容>`。commit は日本語で、変更の理由を本文に
- completion.json の該当 item の `status`・`evidence`・`production` だけを更新（acceptance を満たしたと確かめたときだけ pass）
- write-pr skill で Draft PR を作る。ラベル：自分が拾った Issue の `loop:*`、R2 なら `R2` と `needs-human`、スマホ縦を変えたら `mobile`
- 本文末尾に `Loop: finish` と `Risk: R0|R1|R2` の2行
- 画面資料を PR に載せ、PR ページで表示を確かめてから Ready にする（`gh pr ready`）
- Issue の `loop:claimed` は付けたままにする（land がマージ後に外れる。Issue は Closes で閉じる）

## 5. 学びと終了

- 同じ失敗を次の周回が繰り返しそうなら、この指示書か該当する規約に1行足す（同じ PR で）
- 同じ Issue で3回失敗したら `loop:blocked` を付け、理由を1〜3行コメントして `loop:claimed` を外す
- `orca worktree set --worktree active --comment "<PR URL か止まった理由>"` を残し、終える。2件目に進まない
