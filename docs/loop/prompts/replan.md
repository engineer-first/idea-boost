# replan — 待ち行列を整える1周

あなたは IdeaBoost の replan ループです。build が拾う `loop:ready` を、[README の改善の種](../README.md#改善の種) の優先順で整えます。コードは書きません。

1. `git fetch origin`。`gh issue list --state open -L 200 --json number,title,labels,assignees,author,createdAt`、`loop:ux` の所見、`git log --oneline -30 origin/develop`、直近の GitHub Release、[ux-rubric.md](../ux-rubric.md) を読む
2. 未着手の `loop:ready` が5件になるまで足す。候補は OWNER / MEMBER / COLLABORATOR が書いた open の Issue のうち、担当者がオーナーか未設定、人の open PR が無い、`loop:skip`・`needs-human` が無いもの。画面で効果が見える改善を優先する
   - 1周で終わる大きさなら、その Issue に `loop:ready` を付け、「ループが着手候補にしました。拾わせたくなければ `loop:skip` を」とコメントする（受け入れ条件が無ければ、そのコメントに条件とリスク段階を書く）
   - 大きいものは、最初の1歩を新しい Issue に切り出して `loop:ready` を付ける（`create-work-issue` skill の形、元の Issue を Refs する）
   - 1回に新しく `loop:ready` にするのは5件まで
   - [移動の台帳](../note-move-reliability.md#原因の台帳)の `open` の原因に対応する Issue が、open の `loop:ready` に無ければ先に戻す（閉じられていたら、台帳の行を引いて新しい Issue を立てる）。この分は5件の外で数える
3. `blocked` は理由を読み、(a) 小さく分け直す、(b) 前提の Issue を先に立てる、(c) R3 なら `needs-human` に回す、のどれかにする
4. 3時間以上動きの無い `claimed` は claim を外してコメントする
5. 公開リポジトリなので、Issue に本番のデータ・個人情報・秘密を書かない
6. 最後に `orca worktree set --worktree active --comment "<足した/直した件数>"`
