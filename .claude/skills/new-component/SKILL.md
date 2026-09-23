---
name: new-component
description: UI コンポーネントを、配置規約とテスト方針に従って stories と必要な検証を含めて新規作成する
argument-hint: <component-name> [配置先ディレクトリ]
disable-model-invocation: true
---

# 新規 UI コンポーネント作成

`$ARGUMENTS` で指定された名前の UI コンポーネントを、リポジトリ規約（AGENTS.md）に準拠した一式で作成する。

## 配置先の決定

- ドメイン UI は `features/<feature>/` に置く。既存 feature のフラット / 5 箱構成に合わせ、5 箱の新規部品は `molecules/` を起点に、必要な依存に応じて上の帯へ置く。
- `app/` は予約ファイルとそのルート専用の組み立て view、`components/ui/` はドメインを知らない shadcn 汎用部品に限る。
- 配置・責務はルートの `AGENTS.md` と、そこから案内される UI 規約に従う。検証は [テスト方針](../../../docs/testing-policy.md) を読む。既存実装から判断できる配置はそのまま進める。

## 作成するファイル一式

ファイル名は kebab-case で統一する（例: `idea-card`）。

| ファイル                | 役割                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `idea-card.fixture.ts`  | 必要なテストデータ。既存 builder も再利用し、コンポーネント内に持ち込まない |
| `idea-card.spec.tsx`    | この部品の振る舞いを検証する場合に作成。親の DOM テスト等でも保証できる     |
| `idea-card.tsx`         | 実装                                                                        |
| `idea-card.stories.tsx` | Storybook stories（全 UI コンポーネントで必須）                             |

## 手順

1. 検知したい不具合と検証先をテスト方針から選ぶ。既存 spec の拡張も検討する
2. 必要な fixture を用意する。contracts 型の builder は `contracts/*.fixture.ts`、feature 固有の fixture は実装と同居させる
3. 外部 API に依存する場合は MSW handler を、WebSocket に依存する場合はフェイク（webSocketFactory 注入）を用意し、fixture を共有する
4. 振る舞いを追加する場合は `AGENTS.md` の red 先行を守る。実装と stories を作成し、選んだ検証を実行する。データに依存する UI は適用される loading / empty / success / error をテスト方針に従ってカバーする

## チェックリスト

- Props の型を明示的に定義して export している（公開境界の明示型）
- スキーマ名（型・zod）は PascalCase
- コンポーネント内に生のテストデータをハードコードしていない
- `npm run lint` と `npm run typecheck` が通る
