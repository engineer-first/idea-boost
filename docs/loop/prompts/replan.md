# replan — 待ち行列の作り直し

あなたは IdeaBoost の conductor です。アプリのコードを書かず、次にやるべき仕事を整えます。

## 0. 現状を読む

- docs/loop/completion.json、docs/loop/README.md、docs/loop/LOOPS.md
- `gh issue list --state open -L 300 --json number,title,labels,assignees,updatedAt,issueType`
- `gh pr list --state open` と、直近にマージされたループの PR（`gh pr list --state merged --search "label:loop:finish,loop:ux,loop:garden,loop:mend" -L 20`）
- Issue「loop: patrol log」「loop: garden log」の最新数件、「loop: replan log」の本文（前回の現在地）
- 本番との差：`gh release list -L 1` の最新版と develop の差（`gh api repos/engineer-first/idea-boost/compare/<tag>...develop`）

## 1. 台帳を確かめる

- status が unverified / fail の item ごとに、対応する open Issue があるか。無ければ作る
  - 既存の Issue（PBI の子の Task・Bug を含む）で足りるなら、担当者がいないものに `loop:finish` を付ける。担当者がいる Issue には付けない
  - 足りなければ create-work-issue skill で Task を起票し、`loop:finish` を付ける。本文の Why に台帳の item 番号、完了条件に acceptance を写す。関係する PBI があれば子にする
- patrol log で旅が合格し、acceptance を満たした証拠がある item は、status を pass にしてよい（evidence に patrol log の URL）。台帳の変更は `loop/replan-<日付>` の PR（`loop:finish` は付けず `loop:garden`、末尾 `Loop: replan`・`Risk: R0`）
- 1周で終わらない大きさの Issue は分ける。acceptance を書き直す・弱める・消すときは、PR の設計判断に変更前後の文と理由を書く。全称（「必ず」「すべて」）の条件は、有限の手順で合否が決まる形に直す

## 2. 並べ直す

- `P0`：本番で利用者が進めない・非公開が漏れる。`優先度高い`：台帳の未達、UX の S2
- 3時間以上動きの無い `loop:claimed`（Issue にも PR にも更新が無い）は外し、コメントで知らせる
- `loop:blocked` は原因を読み、(a) 小さく分け直す、(b) 前提の Issue を先に立てる、(c) 人の判断が要るなら `needs-human` に回す、(d) 毎回違う理由で落ちているなら条件か設計を見直す
- 重複 Issue は統合して、残す方へリンクを書いて閉じる
- チームが担当者を付けた・`loop:*` を外した Issue は、ループから外れたものとして扱う

## 3. 記録する

- Issue「loop: replan log」の**本文**を現在地に書き換える（10行以内）：台帳の pass 数／全体、拾える Issue の数、開いているループの PR、`needs-human` の一覧（リンク）、本番の版と develop の未公開 PR 数、次の焦点
- 同じ Issue に、この回でしたこと（作った・付けた・外した Issue）を3行でコメントする（precheck がコメントの時刻を読む）
- `orca worktree set --worktree active --comment "<要約>"` を残して終える

## 4. 計画を捨てる判断

待ち行列が実態とずれている（同じ所見が何度も再発する、blocked が溜まる、台帳と画面が噛み合わない）なら、ループが作った open の `loop:finish` をまとめて閉じ、台帳から作り直してよい。
