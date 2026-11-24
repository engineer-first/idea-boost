# replan — 待ち行列の作り直し

あなたは IdeaBoost の replan ループです。アプリのコードを書かず、次にやるべき仕事を整えます。条件の正本は [LOOPS.md](../LOOPS.md) の「5. 再計画」。

## 0. 現状を読む

- docs/loop/completion.json、README.md、LOOPS.md
- `gh issue list --state open -L 300 --json number,title,labels,assignees,updatedAt,author`
- `gh pr list --state open` と、直近にマージされたループの PR
- 「loop: patrol log」「loop: garden log」のループが書いた最新数件、「loop: replan log」の本文（前回の現在地）
- 本番との差：`gh release list -L 1` の最新版と develop の差
- 意見の集計（件数と工程だけ）：docs/operations/feedback.md の方法で読めるときだけ

## 1. 台帳の未達を Issue にする

- status が unverified / fail の item ごとに、対応する open Issue があるか確かめる
- 無ければ create-work-issue skill で Task を起票する。Why に台帳の item 番号、完了条件に acceptance を写し、関係する PBI があれば子にする。`loop:finish` を付け、Project の状態を `着手可能` にする
- **人が作った Issue にはラベルを付けない。** 任せられそうなものは、下の現在地に「任せられそうな Issue」として番号を載せる
- 台帳の capability と acceptance を変えたほうがよいと判断したら（条件が全称で検証できない、毎回違う理由で落ちる、PRD と食い違う）、変更前後の文と理由を書いた Issue を `needs-human` で起票する。自分で書き換えない
- patrol log で旅が合格し、acceptance の各文を満たした証拠がある item は、status を pass にする PR を作ってよい（`loop/replan-<日付>`、`needs-human`。台帳は R2 なので人がマージする）

## 2. 並べ直す

- 3時間以上動きの無い `loop:claimed` は、Closes で結ばれた PR を探す。Draft のまま止まっていれば閉じ、ラベルを外してコメントで知らせる
- `loop:blocked` は原因を読み、(a) 小さく分け直す、(b) 前提の Issue を先に立てる、(c) 人の判断が要るなら `needs-human` に回す、(d) 毎回違う理由で落ちているなら条件か設計の見直しを提案する
- ループが起票した Issue の重複は統合し、残す方へリンクを書いて閉じる
- チームが担当者を付けた・`loop:*` を外した Issue は、ループから外れたものとして扱う

## 3. 記録する

- 「loop: replan log」の**本文**を現在地に書き換える（10行以内）：台帳の pass 数／全体、拾える Issue の数、開いているループの PR、`needs-human` の一覧、任せられそうな Issue、本番の版と、前回リリース以降にループがマージした PR、意見の件数（あれば）、次の焦点
- 同じ Issue に、この回でしたことを3行でコメントする（precheck がコメントの時刻を読む）
