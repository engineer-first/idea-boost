---
name: new-component
description: UI コンポーネントを規約一式（fixture + spec + 実装 + stories）で新規作成する
argument-hint: <component-name> [配置先ディレクトリ]
disable-model-invocation: true
---

# 新規 UI コンポーネント作成

`$ARGUMENTS` で指定された名前の UI コンポーネントを、リポジトリ規約（AGENTS.md）に準拠した一式で作成する。

## 配置先の決定

- ドメイン UI は `features/<feature>/` に置く。既存 feature のフラット / 5 箱構成に合わせ、5 箱の新規部品は `molecules/` を起点に、必要な依存に応じて上の帯へ置く。
- `app/` は予約ファイルとそのルート専用の組み立て view、`components/ui/` はドメインを知らない shadcn 汎用部品に限る。
- 配置・責務はルートの `AGENTS.md` と、そこから案内される UI 規約に従う。既存実装から判断できる配置はそのまま進める。

## 作成するファイル一式

ファイル名は kebab-case で統一する（例: `idea-card`）。

| 順序 | ファイル                | 役割                                                              |
| ---- | ----------------------- | ----------------------------------------------------------------- |
| 1    | `idea-card.fixture.ts`  | テストデータ（fixture / builder）。コンポーネント内に持ち込まない |
| 2    | `idea-card.spec.tsx`    | Vitest + Testing Library のテスト。実装より先に書く               |
| 3    | `idea-card.tsx`         | 実装                                                              |
| 4    | `idea-card.stories.tsx` | Storybook stories（全 UI コンポーネントで必須）                   |

## 手順（TDD）

1. fixture を作成する。contracts 型の builder は `contracts/*.fixture.ts`、feature 固有の fixture は実装と同居させる
2. spec を書き、`npx vitest run <spec のパス>` で **失敗を確認** する
3. 実装して同じテストが green になることを確認する
4. stories を作成する。データに依存するコンポーネントは loading / empty / success / error の各状態を story とテストの両方でカバーする
5. 外部 API に依存する場合は MSW handler を、WebSocket に依存する場合はフェイク（webSocketFactory 注入）を用意し、fixture を共有する

## チェックリスト

- Props の型を明示的に定義して export している（公開境界の明示型）
- スキーマ名（型・zod）は PascalCase
- コンポーネント内に生のテストデータをハードコードしていない
- `npm run lint` と `npm run typecheck` が通る
