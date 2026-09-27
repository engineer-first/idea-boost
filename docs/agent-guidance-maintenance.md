# エージェント指示の保守記録

通常の実装では読む必要はない。指示・skill・hook を変更するときの根拠と回帰確認をまとめる。
運用の入口は [AGENTS.md](../AGENTS.md)、作業別規範は [agent-workflows.md](agent-workflows.md)。

## 公式資料と採用判断

2026-09-15 に以下の OpenAI 公式資料を参照した。
以下は公式指針をこのリポジトリへ適用した判断であり、TDD・レイヤー構成・RoomDO 権威等は
リポジトリ独自の規範として維持する。

| 資料                                                                                                                              | 採用した考え方と変更                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | 常時必要な指示と必要時に読む知識を分ける。作業別ルールを明示リンクへ移し、重複する TDD 手順を一本化。          |
| [Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)                                                  | 曖昧な指示を監査し、タスクに応じて検証する。TDD と schema 先行の順序を明確化し、完了時に検証結果を報告。       |
| [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)                                                         | ルートから作業ディレクトリへの読込を踏まえ、子ディレクトリの AGENTS 自動発見に依存せずルートで読む条件を示す。 |
| [Best practices](https://learn.chatgpt.com/guides/best-practices)                                                                 | 短い常設指示と作業別資料を使う。正本を指し、機械検査の細則や変動する一覧を繰り返さない。                       |

モデル名に依存する設定や新しい hook は必要性を確認せずに追加しない。

## 旧規範の対応表

| 旧 AGENTS の内容                                                    | 維持先・整理内容                                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 正本・symlink・日本語・公開型・検査を緩めない・PR / Next / PRD 参照 | AGENTS の常設判断と作業別参照表。                                                                                                             |
| TDD の繰り返し・Vitest・Worker pool                                 | AGENTS の開発と検証へ一本化。小さな振る舞い変更も red を確認し、contracts → 実装 → green → リファクタの順を保持。検証先の選択はテスト方針へ。 |
| 構成・依存・命名・5 箱・同居・ステム                                | workflows のコード配置と命名。許可エッジ・帯・配置の詳細は既存 ast-grep と配置チェッカーへ参照。変動する feature 一覧は削除。                 |
| container / view・hook・状態・stories・モック・固定データ・4 状態   | workflows の UI に集約。グローバルストア禁止を含め維持。4 状態の適用と検証責務はテスト方針へ。                                                |
| API 入力検証・毎回の認証認可・最小レスポンス・唯一のデータ入口      | workflows の API とコード配置へ集約。                                                                                                         |
| RoomDO 権威・visibleTo・全員配信の限定・否定系・書換不可フィールド  | workflows の共有状態と認可。サーバーから返すデータまで禁止と読めないよう、クライアント送信メッセージの規範であることを明確化。                |
| D1 可逆性・RoomDO 不変性 / 未マージ編集・生成物・ER 図・構造 lint   | workflows の Migration。具体コマンドと既存検査への参照を保持。                                                                                |
| 秘密情報・境界・contracts 正本                                      | AGENTS の常設判断と開発順序へ統合。                                                                                                           |

機械検査への委譲は意図の削除を意味しない。現状を確認する正本は
[package.json](../package.json)、[CI](../.github/workflows/ci.yml)、
[ast-grep](../rules/ast-grep/)、[feature 配置検査](../scripts/check-feature-layout.mts)、
[DB lint](../.tbls/) とする。機械化されていない判断規範は workflows に残す。

## テスト方針の整理（2026-09-23、Issue #338）

- [テスト方針](testing-policy.md) を判断の正本として追加し、AGENTS・UI 規約・
  `new-component` から案内する。テスト件数や query API ではなく、検知する不具合で検証先を選ぶ。
- 振る舞いの red 先行、全 UI の stories、データに依存する UI の適用される 4 状態の検証を維持する。
  固定文言・装飾だけの専用 DOM spec と、すべての部品への 4 状態の強制を避ける。
  `new-component` の専用 spec 必須という案内を、この判断に揃える。
- DOM の接続・表示データ・表示条件、Worker の認可、browser の寸法・操作、
  Chromatic の表示差分、人による文章レビューの責務を区別する。
  Vitest 設定・CI・Chromatic workflow を照合し、テスト設定は変更しない。

## Issue の操作記述（2026-09-26）

赤ペン回答に従い、PBI・DemoGoal とユーザー操作を伴う Task では、既存の条件欄に「誰が・どの画面で・何をすると・何が見えるか」を1行で書く方針にした。新しい必須欄は設けず、Issue Forms の説明と例文、PBI/DemoGoal 作成スキルの記述例、Issue 運用の正本を揃えた。フォームの構造と YAML 構文、文書の整形、差分を確認する。

## ハーネス監査

- [.claude/settings.json](../.claude/settings.json) は保護・整形・境界・migration 同期・終了時検証、
  [.codex/hooks.json](../.codex/hooks.json) は変更ファイル整形を設定している。
  別の実行系なので Claude 用 hook が Codex でも動くとは扱わない。
  ここでは設定とスクリプトを静的に確認したのみで、各ランタイムの hook 発火は未検証。
- CI が型・lint・境界・配置・migration・DB・unit / worker / browser・build / smoke を検査する。
  今回は hook の追加・変更を要する欠落を確認していないため既存設定を維持する。
- `.claude/skills/` の `new-component`、`contract-change`、`create-migration` に、旧 app 配置、
  schema 先行と TDD の順序不整合、DO は migration 不要という古い案内があった。
  今回のリファクタで各 skill を現行配置・red 先行・DO SQL migration に揃える。
- Codex 用 skill validator は既存の Claude 用 frontmatter 属性を受け付けない。
  `argument-hint` / `disable-model-invocation` は Claude 互換性のため保持し、形式検証ではこの制約を区別する。
- ローカル品質ループ状態は [.gitignore](../.gitignore) の `/.eval-loop/` でコミット対象から除外する。
  既存状態は削除しない。これは formatter の除外設定を兼ねない。
- 既存の別作業を保つため、文書整形は対象ファイルを列挙して
  `npx remark AGENTS.md docs/agent-workflows.md docs/agent-guidance-maintenance.md docs/testing-policy.md .claude/skills/new-component/SKILL.md --quiet --frail --output`
  とする。全体の `format:md` は実行しない。

## 参照ルーティングの回帰確認

指示を変更したら次のシナリオをルートから辿り、必要な制約へ到達できることを確認する。
これは文書の読み合わせであり、アプリの実行テストや agent の実走評価を代替しない。

| 作業例                       | 読込経路と期待する制約                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| README の文言だけ修正        | 常設判断 → 文書のリンク・記載内容・整形検証。UI や Worker の資料・アプリ全テストは要求しない。                                                                     |
| Issue を作成・編集・振り分け | 常設判断 → [Issue 運用](issue-management.md)。種類・Project 状態・PR 参照・自動化・App 権限を確認し、Issue を推測で更新しない。                                    |
| Next の付箋 UI を変更        | 配置 + Next 同梱ガイド + UI + テスト方針。red 先行、container / view 分離、stories・fixture・適用される 4 状態へ到達。共有状態も変更するなら共有状態と認可を併読。 |
| ガイドの固定文言を修正       | テスト方針 → story と文章・表示レビュー。専用 DOM spec の追加を必須にしない。説明の表示条件を変えるなら red 先行へ戻る。                                           |
| ボタンを hook へ接続する     | UI + テスト方針 → DOM 操作と callback・状態変化の接続を検証。hook 単体の成功だけで保証したとしない。                                                               |
| 新しい UI 部品を作る         | new-component → UI + テスト方針。stories は必須。親で検知できる振る舞いを子の専用 spec に重複させず、適用される状態を検証する。                                    |
| API でノート閲覧権限を変更   | 配置 + API + 共有状態と認可。否定系を先に書き、認証認可・visibleTo テーブル・Worker テストを更新する。                                                             |
| RoomDO のカラムを変更        | 配置 + Migration。振る舞いの red を確認し、マージ済み SQL の不変性、新規 SQL、生成物非コミット、DB lint / Worker テストに到達。                                    |

合わせてリンク先・npm script の存在、`CLAUDE.md` symlink、Markdown 再整形の差分ゼロ、
`git diff --check`、`git check-ignore .eval-loop/` を確認する。
