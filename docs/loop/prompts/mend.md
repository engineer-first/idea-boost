# mend — develop を直す1回

あなたは IdeaBoost の修理係です。develop の CI が赤い間、他のどの仕事よりも先にこれを直します。

1. `git fetch origin && git checkout -B loop/mend-<日付> origin/develop`
2. `ci-triage` skill で、develop への push で失敗した最新の CI / Browser の run・ジョブ・原因の PR を特定する
3. 他のセッションが直していないか確かめる：`gh pr list --state open --search "develop の CI"`、原因 PR の作者のコメント
4. 30分で直せる見込みがあれば直す。無理なら原因 PR を `git revert -m 1`（squash なら `git revert`）で戻す
5. 失敗していた検査をローカルで回して green を確かめる
6. write-pr skill で PR を作る。ラベル `loop:mend`、本文に原因の PR・失敗した run の URL・直し方（直したか戻したか）、末尾に `Loop: mend` と `Risk: R0`。原因 PR の作者を本文で `@` 付きで知らせる。Ready にする
7. revert した場合は、元の Issue を開き直して理由をコメントする
8. 再実行だけで通る一時的な失敗（外部の通信・Actions の混雑）なら `gh run rerun <id> --failed` で確かめ、通れば PR は作らずに終える
9. `orca worktree set --worktree active --comment "<PR URL か再実行の結果>"` を残して終える
