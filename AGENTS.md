# エージェント指示

このファイルをエージェント運用ルールの入口・正本とする。
`CLAUDE.md` はこのファイルへの symlink を維持する。
プロダクト要求の正本は [docs/prd.md](docs/prd.md)。

## 常に守ること

- コードレビューのコメント、説明、提案、要約は日本語で書く。
- 公開境界では明示的な型を優先する。
- コンパイラ・lint・テスト設定を緩めて検査を通さない。
- ブラウザコードにセッション秘密鍵や特権的なデータアクセスを含めない。
- 境界を流れるデータの形は `contracts/`、ルーム内の共有状態の真実は RoomDO が持つ。
  UI / Server Actions / api-worker / RoomDO の境界を保ち、実装層は再生成可能にする。

## 変更前に読む資料

該当する行をすべて読む。リンク先の作業別ルールも本指示の一部とする。
ルートから作業する場合も、下位の指示ファイルの自動読込には依存しない。

| 作業                                               | 読む資料                                                     |
| -------------------------------------------------- | ------------------------------------------------------------ |
| コードの追加・変更・移動                           | [コード配置と命名](docs/agent-workflows.md#コード配置と命名) |
| Next.js の実装                                     | `node_modules/next/dist/docs/` の関連ガイド                  |
| UI・クライアント状態・stories・モック              | [UI](docs/agent-workflows.md#ui)                             |
| API・Server Action・Route Handler・データアクセス  | [API](docs/agent-workflows.md#api)                           |
| 共有状態・WS・可視性・認可（クライアント側を含む） | [共有状態と認可](docs/agent-workflows.md#共有状態と認可)     |
| D1 / RoomDO のスキーマ・migration                  | [Migration](docs/agent-workflows.md#migration)               |
| Issue の作成・編集・振り分け・調査・状態判断       | [Issue 運用](docs/issue-management.md)                       |
| PR 作成・本文更新                                  | [write-pr](.claude/skills/write-pr/SKILL.md)                 |
| エージェント指示・ハーネスの保守                   | [保守記録](docs/agent-guidance-maintenance.md)               |

## 開発と検証

- 振る舞いの変更は、小さくても観測可能な振る舞いの失敗する Vitest テストから始める。
  **失敗を確認する前に本番コードを変更しない**。
  境界の形を変える場合も、失敗確認後に `contracts/`、次に実装の順で変更する。
  同じテストが green になったことを確認し、その後にリファクタリングする。
- Worker / Durable Object は `@cloudflare/vitest-pool-workers`
  （`npm run test:workers`）でテストする。
- 完了前に変更範囲に必要なテスト・型・lint を実行する。
  コマンドの正本は [package.json](package.json)、CI の検査は
  [.github/workflows/ci.yml](.github/workflows/ci.yml)。
  文書のみの変更はリンク・記載内容・整形を検証する。
- 完了報告には変更内容、実行した検証と結果、未検証事項や残る問題を短く示す。

## 指示の保守

指示は短く、最新に保ち、重複させない。静的検査で強制できるルールは
Biome / [ast-grep](rules/ast-grep/) 等へ追加し、指示には判断に必要な意図と参照を残す。
