# 段階2の PR を出す前に直すこと（このファイルは PR に含めない）

PR #1107 は段階1（巡回だけ）に縮めた。このブランチは段階2（finish・land・garden・mend・replan と、R0 のマージ）の下書きで、2026-11-24 のレビュー（Fable 2本、Opus 4本）で残った指摘をここに置く。

## マージ範囲（risk.mts）

- rename の前のパスを判定に入れる。REST の `pulls/N/files` の `previous_filename` を使い、finish は `git diff --name-only --no-renames`。
- ファイル一覧が空・取得失敗・`changedFiles` と件数が合わないときは R2。CLI は入力0行で R2 と exit 2。`rollupHealth([])` は pending。
- R0 を許可リストにする：`messages/`、`*.stories.tsx`、明示した `docs/` の md と画像だけ。それ以外の `docs/` は R2。
- 指示を縛る文書を R2 に：`docs/(development|team|adr|operations|loop)/`、`docs/(README|glossary|prd).md`、`DESIGN.md` など、全階層の `AGENTS.md` `CLAUDE.md` `SKILL.md`。
- `docs/site/` は push で GitHub Pages に公開されるので R2。`docs/adr/check.mjs` なども R2。
- テストの削除・rename・`.skip(` `.only(` `.todo(` の追加は R2。`tests/` の spec 以外は R1。garden から「未使用のテストの削除」を外す。mend の「テストを消す修理」は needs-human。
- 段階3の前に R2 へ寄せる：`features/access/`、`features/notes/logic/*share*`、`features/room/logic/board-permissions.ts`、`app/dev/`、`middleware.ts`、`public/_headers`、`instrumentation-client.ts`、`vitest.setup.ts`、`.storybook/`、`.mcp.json`。

## land

- Renovate の PR は CodeRabbit が「Bot user detected」でレビューしない。Renovate 用の条件を分ける（変更が package.json と lock だけ、コミット作者がすべて renovate[bot]）。
- Renovate の除外に `vitest` `@vitest/*` `@biomejs/biome` `typescript` `playwright` `npm`・node を足す。
- 24時間の上限はマージの直前に数え直す。数えるのは `mergedBy == ACTOR`（Renovate を含む）。
- CodeRabbit の「枠切れ」コメントを activity に数えない。印に要求の状態を書き、N時間レビューが来なければ needs-human。
- 手順6の矛盾（失敗したら何もしない／どの場合も印を残す）を直す。
- needs-human を外したときに land が見直す合図を決める（外してコメント1つ、など）。

## ループの見分け

- ループの PR は `headRefName` が `^(loop\/|feature\/\d+-loop-)` で、本文に `^Loop: ` 行があるものに限る（オーナーが人として作った PR と区別する）。
- 記録コメントは先頭行 `loop: <名前>` を必須にする。
- オーナーは自分の PR に Request changes できない。ループ専用アカウントを段階2の前提に前倒しする。

## 段階1の運用で決まってから

- finish が拾うのは、人が `loop:finish` を付けた Issue だけ（ループが起票したものは `loop:proposed`）。
- finish が completion.json を同じ PR で変えると R2 になる。台帳の更新は別の PR に分ける。
- mend：最新が実行中なら pending、メンションは1回、revert は人。
- 段階を進める条件を gh で数えられる形にする。
