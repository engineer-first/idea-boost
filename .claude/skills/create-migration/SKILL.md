---
name: create-migration
description: D1 migration を規約（連番採番・戻せる意図・最小スコープ）に沿って作成し、ローカル適用と worker テストまで検証する
argument-hint: <変更内容の説明>
disable-model-invocation: true
---

# D1 migration 作成

`$ARGUMENTS` で指定された変更内容の D1 migration を作成し、ローカル適用まで検証する。

## 前提の確認（作業前）

- この変更は本当に D1 に属するか。ルームの中の真実（メンバー・付箋）は RoomDO が
  持つ。D1 の rooms 行は「招待コード -> ルーム解決」のディレクトリにすぎない。
  RoomDO 側に属するデータなら `workers/room-do-migrations/` の SQL migration を使う。
  この D1 用手順の採番・適用は使わず、ルート `AGENTS.md` が案内する RoomDO migration 手順に従う。
- スキーマ変更が API 境界に現れるなら、`/contract-change` の手順に従う。
  失敗するテストを確認してから、実装層より先に `contracts/` を変更する。

## 変更前のテスト

新しい SQL を書く前に、D1 に触れる Vitest spec に期待する振る舞いのテストを追加し、
`npm run test:workers -- <spec のパス>` で失敗を確認する。

## ファイル作成

- 配置先: `workers/migrations/`
- 命名: `NNNN_snake_case_name.sql`（既存の最大番号 + 1、4 桁ゼロ埋め。
  例: `0002_add_room_expiry.sql`）
- 1 migration = 1 意図。無関係な変更を同じファイルに入れない。

## 書き方（戻せる意図で）

- additive な変更（`CREATE TABLE` / `ADD COLUMN`）を優先する。
- 破壊的変更（`DROP` / データ変換）は additive な migration と分離し、
  適用前にユーザーへ確認する。
- `IF NOT EXISTS` に頼って冪等に見せかけない。順序どおり一度だけ適用される
  前提で、意図が読める SQL を書く。

## 適用と検証

1. `npm run check:migrations` で番号重複がないことを確認する
   （同じ番号のファイルが存在すると exit 1 になる。CI の lint job でも実行される）
2. `npm run db:migrate` でローカルに適用する
3. `npx wrangler d1 execute DB --local --config workers/wrangler.jsonc --command "SELECT sql FROM sqlite_master WHERE type='table'"` でスキーマを確認する
4. 変更前に失敗した同じ spec が green になることを確認し、`npm run test:workers` で関連する回帰を検証する

## チェックリスト

- `npm run check:migrations` が通る（番号が既存と重複していない）
- 1 ファイル 1 意図になっている
- 破壊的変更が分離され、ユーザー確認を経ている
- `npm run test:workers` が通る
