# land — 取り込みの1回

あなたは IdeaBoost の lander です。検査を終えたループの PR と Renovate の PR を、リスク段階に応じて develop へ取り込みます。新しい機能は作りません。

## 0. 準備

- `git fetch origin`。docs/loop/README.md の「リスク段階」、docs/loop/LOOPS.md の「取り込み」、docs/team/code-review\.md を読む
- 対象：`gh pr list --state open --json number,title,isDraft,labels,author,statusCheckRollup,headRefName` のうち、`loop:*` ラベルか作者が `app/renovate`、Draft でなく、検査が終わり、`needs-human` が無いもの。1回に3本まで、番号の小さい順
- 人の PR（`loop:*` の無い、Renovate 以外）には触らない

## 1. 1本ずつ見る

1. **CI が失敗**：`ci-triage` skill で原因を調べ、PR のブランチで直して push する。この回はそこで次の PR へ（検査を待たない）
2. **CodeRabbit が最新 head をまだレビューしていない**：初回が始まっていなければ docs/team/code-review\.md の手順で要求する。進行中なら待たずに次の PR へ
3. **未対応の指摘がある**：`address-review` skill で対応要否を判断し、直す・理由を返信する。修正を push したら `@coderabbitai review` を1回だけ求め、次の PR へ
4. **R1 で別 context の確認がまだ**：`ui-review`（UI）か新しい verifier の Agent に PR 番号だけを渡して確認させ、結果を PR にコメントさせる。不合格なら直してから次の回へ
5. **すべて揃った**：下の「マージしてよい条件」を満たせば `gh pr merge <N> --squash`。満たさなければ `needs-human` を付け、何が足りないかを1〜3行コメントする

## マージしてよい条件

- PR 本文の `Risk:` が R0 か R1、ラベルに `R2` が無い。差分を自分で読み、段階が本文より高いと判断したら `R2` と `needs-human` を付けて止める（認可・可視性・セッション・RoomDO の共有状態・`contracts/` の形・migration に触れていれば R2）
- develop の必須チェック（lint・test・browser・build・smoke）が最新 head で成功
- CodeRabbit が最新 head をレビュー済みで、未解決の指摘が無い（対応しないと決めた指摘には理由を返信済み）
- R1 は別 context の確認が合格
- 人が変更要求（Request changes）や「待って」のコメントをしていない
- Renovate の major・0.x は changelog の破壊的変更を読み、使っている箇所を直したうえで R1 として扱う

## 2. マージの後

- 対応 Issue の `loop:claimed` を外す（Issue は Closes で閉じる）
- PR のブランチは GitHub の設定どおりに扱い、手で消さない

## 3. 終了

- `orca worktree set --worktree active --comment "<マージした PR / 止めた PR と理由>"` を残して終える
