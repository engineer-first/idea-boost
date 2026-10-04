---
name: verify
description: このリポジトリの変更をローカルで起動して実際に動かして検証する手順。dev サーバー起動、ログイン、ルーム作成、付箋操作の検証レシピ。
---

# 検証手順

## 前提

- `.env.local` が必要。`.env.example` をコピーすればそのまま動く
  （`SESSION_SECRET` は workers/wrangler.jsonc の vars と一致していること、
  `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` を忘れない）。
- 初回のみ `npm run db:migrate`（ローカル D1 に migration を適用）。
- 開発用ユーザーはログイン時に自動作成される（`owner@example.test` / password）。

## 起動と導線

1. `npm run dev:api`（バックグラウンド、ログをファイルへ）— api-worker (localhost:8787)。
2. `npm run dev`（バックグラウンド、ログをファイルへ）。**ポート注意**: 別 worktree の dev サーバーが 3000 を掴んでいると起動を拒否する（Next 16 の dev ロック）。ログの `Local:` を必ず確認。
3. `/login` → 「開発用ユーザーでログイン」→ `/` → 「ルームを作成」→ `/rooms/{id}`。
4. 「付箋を追加」で付箋を作成。

## 検証の観測点

- api-worker への到達は `dev:api` のログに出る（`POST /api/rooms 200` など）。
- リアルタイム同期の対向クライアントは、ページ内から2本目の WebSocket を張って観測できる:
  `new WebSocket("ws://localhost:8787/api/rooms/<id>/ws")`（Cookie は自動で流れる）。
  受信メッセージは `contracts/room-protocol.ts` の ServerMessage。
- 付箋の状態は data 属性で観測できる: `[data-testid="note-card"]` の `data-selected` / `data-editing`。
- 選択・ドラッグ・キー操作のサーフェスはカード内の `button[aria-label="付箋"]`（編集中はアンマウントされる）。
- 認可の否定系（非メンバー 404 等）は curl で直接確認できる:
  `curl -H "Cookie: idea_boost_session=<token>" http://localhost:8787/api/rooms/<id>`。

## 落とし穴

- Playwright MCP（Orca 埋め込みブラウザ）ではネイティブ入力注入（`.click()` / `page.mouse`）がページに届かないことがある。その場合は合成イベントで代替:
  - `PointerEvent` を `dispatchEvent`（`bubbles: true, pointerId: 1` で clientX/clientY 指定）
  - 事前に `HTMLElement.prototype.setPointerCapture = function(){}` で no-op 化（実ポインターが無いと NotFoundError になるため）
  - React 制御の textarea への入力は native setter + `input` イベント dispatch
- Server Action の form 送信も同様に `.click()` が効かないことがある → `form.requestSubmit()` を evaluate で呼ぶ。
- D1 をリセットしたのにブラウザの Cookie が残っている場合でも、ルーム作成時に
  ユーザー行が自己修復される（ensureUser）。挙動が不審なら Cookie を消して再ログイン。
