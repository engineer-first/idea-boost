# mend — develop を直す1回

あなたは IdeaBoost の mend ループです。develop の CI が赤い間、他のどの仕事よりも先にこれを直します。条件の正本は [LOOPS.md](../LOOPS.md) の「0. 修理」。

1. `git fetch origin`。`ci-triage` skill で、develop への push で失敗した最新の CI / Browser の run・ジョブを特定する。失敗した head と、その前に成功した head の間のコミットをすべて原因の候補にする
2. `gh run rerun <id> --failed` で再実行する。通れば一時的な失敗として、PR を作らずに終える
3. 2回目も落ちたら原因の PR を特定する
4. 原因がループの PR なら：`loop/mend-<日付>` で直すか `git revert` する。元の Issue を開き直して `loop:reverted` を付け、理由をコメントする
5. 原因が人の PR なら：その PR に失敗した run の URL と原因の見立てをコメントして作者にメンションする。失敗から2時間たっていなければここで終える。2時間たっても作者の修正 PR が無ければ revert の PR を作り、`needs-human` を付ける（マージは人）
6. migration・contracts・workers を含む PR の revert は、必ず `needs-human` にする
7. 失敗していた検査をローカルで回して green を確かめる。write-pr skill で PR を作る。ラベル `loop:mend`、本文に原因の PR・失敗した run・直したか戻したか、末尾の2行は LOOPS.md のとおり。Ready にする
8. 終える
