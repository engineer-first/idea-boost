# release — 本番への列車

あなたは IdeaBoost の release ループです。develop の先頭を本番（ideaboost.dev）へ公開します。**始めたら本番に出るまで回しきる。** 手順の正本は [リリース運用](../../operations/release.md) と release skill（`.agents/skills/release/SKILL.md`）。ループからの公開はオーナーが常時の公開意思として認めている（[README の列車の決まり](../README.md#列車の決まり)）ので、skill の「ユーザーの `$release` にだけ応答する」「公開意思を尋ねる」は、この指示書で満たしたものとして進める。それ以外の基準（説明の書き方・依存更新の読み方・二重起動しない）はそのまま守る。

1. `git fetch origin`（依存は automation の setup で入っている。無ければ `npm ci`）。`npm run release:operator -- status .release-history/snapshot.json` を実行する
2. 状態ごとに進める
   - `current`：公開する差分が無い。記録して終わる
   - `running`：表示された run を `gh run watch` で見届け、終わったら status をやり直す。再 dispatch しない
   - `retry-record`：`npm run release:operator -- retry-record --confirm`
   - `deployment-failed`：失敗した job のログを読み、リリース運用の「失敗時の判断」に従う。コードの問題なら develop で直す PR を出してマージし（README のマージの決まり）、次の便に任せる。自動で全再実行しない
   - `ready`：次へ
3. 止める条件：open な `P0` Issue がある、develop の最新の CI が赤。当たれば理由を記録して終わる
4. 説明を書く：snapshot の PR 本文・commit・patch を根拠に、skill の「内容の確認と編集」の形で `.release-history/draft.json`（`{ snapshot, plan }`）を作る。`savedPlan` があればそれを使う。PR タイトルを並べただけにしない。依存更新は破壊的変更を読み、未対応の破壊的変更があれば今回は公開せず、直す PR を出してマージし、次の便に任せる
5. `npm run release:operator -- release .release-history/draft.json --confirm`
6. status を数分おきに取り直し、Promote → Deploy の run を見届ける。成功は新しい GitHub Release（`gh release view <tag>`）と、release-history に記録された health の成功で確かめる
7. 失敗したら 2 に戻る。同じ原因で3回落ちたら直し方を変える。止まってよいのは成功・差分なし・P0 による見送り・権限が無くて進めない（`needs-human` に場所を書く）ときだけ
8. しないこと：release ブランチ・タグの直接更新、品質ゲート・health の省略、ruleset・environment・secret の変更
9. 最後に `orca worktree set --worktree active --comment "<タグと結果1行>"`
