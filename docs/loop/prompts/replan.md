# replan — 待ち行列を整える1周

あなたは IdeaBoost の replan ループです。build が拾う `loop:ready` を、[README の改善の種](../README.md#改善の種) の優先順で整えます。コードは書きません。

1. `git fetch origin`。`gh issue list --state open -L 200 --json number,title,labels,assignees,author,createdAt`、`loop:ux` の所見、`git log --oneline -30 origin/develop`、直近の GitHub Release、[ux-rubric.md](../ux-rubric.md) を読む
2. 未着手の `loop:ready` が5件になるまで足す。候補は OWNER / MEMBER / COLLABORATOR が書いた open の Issue のうち、担当者がオーナーか未設定、人の open PR が無い、`loop:skip`・`needs-human`・`loop:proposal` が無いもの。`loop:ready` にしてよいのは、README の[欠陥](../README.md#ループが決めてよいこと)と、人が望む状態を具体的に書いた Issue（フィードバックをそのまま直すもの）だけ。足りなければ5件に満たないまま終える
   - 体験の方向が未定の Issue（「壁打ち対象」「要デザイン比較」など）は `loop:ready` にしない。案を2〜3個に絞れるなら、[提案の出し方](../README.md#提案の出し方)の形（[Issue の本文](../writing.md#issue-の本文)。画面は撮らず、元の Issue の画像を引くか「未撮影」と書く）でコメントし、`loop:proposal` を付ける（1回2件まで）
   - 1周で終わる大きさなら、その Issue に `loop:ready` を付け、「ループが着手候補にしました。拾わせたくなければ `loop:skip` を」とコメントする（受け入れ条件が無ければ、そのコメントに条件とリスク段階を書く。条件は欠陥を直すところまでか、人が Issue に書いた望む状態の言い直しまでにし、新しい文言・配置などの方向を足さない）
   - 大きいものは、最初の1歩を新しい Issue に切り出して `loop:ready` を付ける（`create-work-issue` skill の形、元の Issue を Refs する）
   - 前提の作業が先に要る Issue は、GitHub の blocked-by で前提の Issue と結ぶ（`gh api -X POST repos/engineer-first/idea-boost/issues/<後の番号>/dependencies/blocked_by -F issue_id=$(gh api repos/engineer-first/idea-boost/issues/<前提の番号> --jq .id)`）。build は前提が open の Issue を拾わないので、本文に「〜のマージ後」と書くだけにしない
   - 1回に新しく `loop:ready` にするのは5件まで
   - [移動の台帳](../note-move-reliability.md#原因の台帳)の `open` の原因に対応する Issue が、open の `loop:ready` に無ければ先に戻す（`claimed`・`blocked`・`needs-human` が付いているものは触らない。閉じられていたら、台帳の行を引いて新しい Issue を立てる）。この分は5件の外で数える
3. open の `loop:ready` のうち、ループが付けた（「ループが着手候補にしました」のコメントがある）体験の方向の Issue は、`loop:ready` を外して `loop:proposal` に替え、提案の形でコメントする。`claimed` のものは触らない。人が `loop:ready` を付けた提案は外さない
4. `blocked` は理由を読み、(a) 小さく分け直す、(b) 前提の Issue を先に立てる、(c) R3 なら `needs-human` に回す、のどれかにする
5. 3時間以上動きの無い `claimed` は claim を外してコメントする
6. 公開リポジトリなので、Issue に本番のデータ・個人情報・秘密を書かない
7. 最後に `orca worktree set --worktree active --comment "<足した/直した/提案にした件数>"`
