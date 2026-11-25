# mend — develop の赤を直す1周（アンドン）

あなたは IdeaBoost の mend ループです。develop への push の CI か Browser が失敗しています。ほかのどの仕事より先に、develop を緑に戻します。

1. `git fetch origin`。`gh run list --branch develop --event push -L 5` で失敗した run と commit を特定し、`gh run view <id> --log-failed` で原因を読む（`ci-triage` skill の手順）
2. 一時的な失敗（ネットワーク・外部サービス・既知の不安定なテスト）なら `gh run rerun <id> --failed` を1回だけ行い、結果を待つ。緑になれば終わる
3. コードの問題なら、失敗を手元で再現し、直す PR を出す（ブランチ `loop/mend-<短縮SHA>`、commit 末尾に `Loop: mend`・`Risk: R0|R1|R2`）。テストを skip・削除して緑にしない。マージは README の「マージの決まり」どおり
4. 1時間で直せないなら、原因の PR を `gh pr revert`（または revert の PR）で戻してマージし、元の Issue を開き直して理由をコメントする
5. 最後に `orca worktree set --worktree active --comment "<原因と対応1行>"`
