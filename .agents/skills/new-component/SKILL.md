---
name: new-component
description: UI 部品を新しく作るときに、配置・stories・検証・見た目（DESIGN.md）の規約に沿って作る。features/・app/・components/ に新しい .tsx 部品を追加するときに使う。
argument-hint: <component-name> [配置先ディレクトリ]
---

# 新規 UI コンポーネント作成

`$ARGUMENTS`（指定がなければ依頼内容）の UI 部品を作る。規約の本文はここに書き写さず、次を読んでから作る。

- 配置・命名は[コード配置と命名](../../../docs/development/conventions.md#コード配置と命名)、container / view・stories・fixture・モックは[UI](../../../docs/development/conventions.md#ui)
- 検証の選び方は[テスト方針](../../../docs/development/testing.md)
- 色・文字・余白・角丸・影・状態表現は [DESIGN.md](../../../DESIGN.md)

既存実装から判断できる配置はそのまま進める。

## 手順

1. 配置先を決める。ドメイン UI は `features/<feature>/`（5 箱なら `molecules/` を起点）、汎用部品は `components/ui/`、1 ルート専用の組み立てだけ `app/`。
2. 検知したい不具合と検証先をテスト方針から選ぶ。親の DOM テストや既存 spec で検知できるなら、専用 spec は作らず既存を拡張する。
3. 振る舞いを追加するなら、AGENTS.md のとおり失敗するテストを先に確認する。
4. fixture（`<name>.fixture.ts`）、実装（`<name>.tsx`）、stories（`<name>.stories.tsx`）を同居させて作る。外部 API は MSW、WS は `webSocketFactory` のフェイクで、fixture を共有する。
5. 見た目は DESIGN.md のトークン名と既存の正本部品（付箋・ボタン・ダイアログ等）に合わせる。値を直接書かない。
6. 変更範囲の検証（`npm run lint`・`npm run typecheck`・選んだテスト）を実行し、[ui-review](../ui-review/SKILL.md) の観点で見直す。
