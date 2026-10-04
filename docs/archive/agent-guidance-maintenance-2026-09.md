# エージェント指示の保守記録（2026年9月以降）

> 当時の採用判断・検証記録。今の保守手順は[エージェント指示の保守](../development/agent-maintenance.md)。

通常の実装では読む必要はない。指示・skill・hook を変更するときの根拠と回帰確認をまとめる。
運用の入口は [AGENTS.md](../../AGENTS.md)、作業別規範は [agent-workflows.md](../development/conventions.md)。

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
[package.json](../../package.json)、[CI](../../.github/workflows/ci.yml)、
[ast-grep](../../rules/ast-grep)、[feature 配置検査](../../scripts/check-feature-layout.mts)、
[DB lint](../../.tbls) とする。機械化されていない判断規範は workflows に残す。

## テスト方針の整理（2026-09-23、Issue #338）

- [テスト方針](../development/testing.md) を判断の正本として追加し、AGENTS・UI 規約・
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

- [.claude/settings.json](../../.claude/settings.json) は保護・整形・境界・migration 同期・終了時検証、
  [.codex/hooks.json](../../.codex/hooks.json) は変更ファイル整形を設定している。
  別の実行系なので Claude 用 hook が Codex でも動くとは扱わない。
  ここでは設定とスクリプトを静的に確認したのみで、各ランタイムの hook 発火は未検証。
- CI が型・lint・境界・配置・migration・DB・unit / worker / browser・build / smoke を検査する。
  今回は hook の追加・変更を要する欠落を確認していないため既存設定を維持する。
- `.claude/skills/` の `new-component`、`contract-change`、`create-migration` に、旧 app 配置、
  schema 先行と TDD の順序不整合、DO は migration 不要という古い案内があった。
  今回のリファクタで各 skill を現行配置・red 先行・DO SQL migration に揃える。
- Codex 用 skill validator は既存の Claude 用 frontmatter 属性を受け付けない。
  `argument-hint` / `disable-model-invocation` は Claude 互換性のため保持し、形式検証ではこの制約を区別する。
- ローカル品質ループ状態は [.gitignore](../../.gitignore) の `/.eval-loop/` でコミット対象から除外する。
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
| Issue を作成・編集・振り分け | 常設判断 → [Issue 運用](../team/issues.md)。種類・Project 状態・PR 参照・自動化・App 権限を確認し、Issue を推測で更新しない。                                      |
| Next の付箋 UI を変更        | 配置 + Next 同梱ガイド + UI + テスト方針。red 先行、container / view 分離、stories・fixture・適用される 4 状態へ到達。共有状態も変更するなら共有状態と認可を併読。 |
| ガイドの固定文言を修正       | テスト方針 → story と文章・表示レビュー。専用 DOM spec の追加を必須にしない。説明の表示条件を変えるなら red 先行へ戻る。                                           |
| ボタンを hook へ接続する     | UI + テスト方針 → DOM 操作と callback・状態変化の接続を検証。hook 単体の成功だけで保証したとしない。                                                               |
| 新しい UI 部品を作る         | new-component → UI + テスト方針。stories は必須。親で検知できる振る舞いを子の専用 spec に重複させず、適用される状態を検証する。                                    |
| API でノート閲覧権限を変更   | 配置 + API + 共有状態と認可。否定系を先に書き、認証認可・visibleTo テーブル・Worker テストを更新する。                                                             |
| RoomDO のカラムを変更        | 配置 + Migration。振る舞いの red を確認し、マージ済み SQL の不変性、新規 SQL、生成物非コミット、DB lint / Worker テストに到達。                                    |

合わせてリンク先・npm script の存在、`CLAUDE.md` symlink、Markdown 再整形の差分ゼロ、
`git diff --check`、`git check-ignore .eval-loop/` を確認する。

## 明示的なrelease Skill（2026-09-27、Issue #383）

[release](../../.agents/skills/release/SKILL.md) は `$release` の明示呼び出し専用とし、
`agents/openai.yaml` の `policy.allow_implicit_invocation: false` で暗黙の本文注入を無効化する。
[公式Skills資料](https://developers.openai.com/plugins/build/skills) とローカルのskill metadata仕様を確認した。
起動は読取と下書きのみ、提示後の公開意思で初めてscriptsからActionsを起動する。

Codex CLI 0.157.0 のread-only実行で、`$release`、`$release 今回の変更を確認したい` の2件にだけ
rolloutの `skills.selected_skill_instructions` として本文が注入されることを確認した。
「リリースしたい機能を相談したい」「次のリリースに#123を入れたい」「リリースノートをレビューして」
「本番デプロイの仕組みを説明して」の4件には注入されなかった。全6件で外部ツール呼び出しは0件。
これは利用中のCodexでの呼び出し境界の確認であり、将来のruntimeまで保証するものではない。
更新時は同じ6入力で本文注入の有無を確認し、公開の副作用はAPI差し替えテストで検証する。

参考候補 `speee/dx-redx-ai-governance` の `release-tag` Skillはアクセスして構成を比較した。
CalVerの自動提案・内容提示・承認後実行・監視は参考にしたが、暗黙起動を誘う説明、タグpush起点、
追加のpreflightやSlack送信は採用しない。既存のDeploy品質ゲート・health・記録回復を利用する。

自然言語の対話は、外部書込を拒否するローカルのfake operatorを置いた一時ディレクトリで
Codex CLIの同じセッションを3ターン実行した。`$release` で下書き提示、
`edit` でタイトルを「結果をテキストで保存」へ変更、`cancel` で終了できた。
候補SHA・比較元・関連PRは維持され、operator呼び出しは読取statusの1回だけだった。
この検証は自然言語編集とキャンセルの接続を対象とし、本番公開の成功を保証するものではない。

## GitHub の画面資料（2026-09-29）

GitHub CLI 2.99.0 以降の `--attach` に合わせ、PR の動作確認資料はコメントにまとめ、`write-pr` が本文からリンクする。
Issue の要件を説明する画面イメージは本文、追加の調査結果はコメントに置く。
旧 `write-pr` のブラウザ専用手順は削除し、PR テンプレートをコメント添付の方針に揃えた。
リポジトリ固有の方針は `write-pr` と Issue 運用に記載し、汎用の添付手順は個人 Skill として管理する。このリポジトリの手順は個人 Skill がない環境でも使える。
既存の `AGENTS.md` の `write-pr` 行は、PR 作成・本文更新でその手順を必ず読むという規則として維持する。

## PR本文の読みやすさ（2026-10-04、Issue #520）

dx-foundryのPR #1061・#1043などとidea-boostのPR #518・#519などを比較し、本文の構成と記載方針を決めた。
Why・コンセプト図・問い／決定／対案の設計判断・要件ごとの動作確認を採用。
前後表は文章で差が分かりにくい場合だけ使い、処理順・責務・状態の3種類からAIが図を選ぶ。
DB変更では3種類の図に加えて、スキーマ差分・既存データへの影響・migration・確認を示す。

PRテンプレートを構成の正本とし、`write-pr`から図と本文の具体例へ案内する。
画面資料はコメントに置き、本文の実装内容からリンクする。
独立した「自動検証と未確認」は作らず、実際の結果・未実施事項を関係する要件に書く。
古い検証履歴・繰り返した節・内部の評価点を本文へ積み重ねない。

運用ルールへの反映は文書のみ。skill形式・参照リンク・Markdown整形・Mermaid構文を検証し、
アプリの実行テストでPR文の読みやすさを保証したとは扱わない。

会話を継承しないagentに更新後のskillと入力資料だけを渡し、既存PRの書き直し・架空のDB変更・
文書だけの変更の3件をローカルで下書きした。DB差分・データ保持・移行の注意を示し、
未実施の再接続や画面資料を成功扱いしないこと、文書だけの変更に図や操作手順を増やさないことを確認。
対案の記録がない場合に設計判断全体が省かれたため、対案を作らず決定と採用理由を残す記述に修正した。
修正後の既存PRの下書きでは、記録された決定と理由を残し、対案・個別の検証結果を補わないことを確認した。
この試行はPR文の生成を対象とし、実PRへの投稿や架空ケースのアプリ検証は実施していない。

## 2026-10-04: 共有スキルの正本を統一（Issue #528）

共有スキル8件を `.agents/skills/` の実体へ集約し、`.claude/skills/` は各スキルへの
相対 symlink にした。`.codex/skills/` の重複は削除した。公式の探索仕様を根拠にした
方針は [ADR 0005](../adr/0005-shared-skills.md)、編集場所と追加時の手順は
[保守文書](../development/agent-maintenance.md#共有スキルの正本)に記録した。

`pbi-demogoal` は3版を読み合わせ、受け入れ条件とデモゴールの操作・画面結果を示す
新しい指針を持つ `.agents` 版を残した。Codex 版の表示メタデータを正本に移し、
旧版とのスクリプト共有の説明を更新した。description 内の `#3` が YAML コメントに
ならないよう引用符を付けた。明示専用のスキルは両ランタイムのメタデータで条件を維持した。

Codex CLI 0.160.0 の `app-server` の `skills/list` と Claude Code 2.1.288 の
SDK 初期化応答で、対象8件が重複なく探索されることを確認した。Claude CLI の shim は
native binary 未配置のため、インストール済みパッケージの `cli-wrapper.cjs` 経由で起動した。
モデルへの問い合わせ、Issue 作成、リリース、Discussion 投稿は行っていない。

移行前の SHA-256 と照合し、移動した指示・scripts・references・表示設定の保持、
両経路からの同じ実体の解決、相対 symlink と実行権限を確認した。
PBI/DemoGoal の `--dry-run` は両経路で同一の出力になり、既存の Python テスト10件を
呼ぶ Vitest と fake API を使う release operator の13テストが成功した。
Markdown のローカルリンク・アンカー、YAML、整形、lint、`git diff --check` も確認した。

共通の `quick_validate.py` は3件で成功し、5件は Claude 固有の `argument-hint` /
`disable-model-invocation` を許容しないため失敗した。これらは削除せず、YAML 解析と
両ランタイムの探索で検証した。本文の自動選択のモデル実走とプロダクトの起動検証は未実施。

## PBIと授業スプリントの運用（2026-10-04）

目的・受け入れ条件・デモ確認内容を1件の PBI にまとめる合意に合わせ、共有スキルの正本に集約された `pbi-demogoal` を `pbi` に変更し、共有スクリプトとフォームの DemoGoal 別 Issue 作成を廃止した。既存 Issue・組織 Type は変更しない。親 PBI は後から整理でき、着手時だけ対象 Milestone を確認する規範を AGENTS と実装・PR の入口へ追加した。期限から sprint を推測せず、未確定なら実装を保留する。貢献度は完了済みを含む Milestone 内の作業を起点にし、バーンダウンには Spike・種類なしも含める。

変更するスクリプトは先に Vitest の失敗を確認し、PBI 単独作成・デモ欄の任意化・本文保持・集計範囲の修正後に同じテストを通した。関連64ケースと Python 11ケース、lint、YAML、リンク・アンカー、symlink、Markdown 整形、差分を確認した。Node LTS の全unitは2267/2269件成功、sandbox による git index 書込・localhost listen の失敗2件は該当2ファイルを許可環境で再実行し12件成功。Node 26での実行は localStorage の環境差があり、LTSで確認し直した。skill の自動選択・エージェントによる Milestone 操作の実走や Issue の実作成は未検証。

## 2026-10-04: 全open Issueのsprint割当

- 未着手・全Typeを含むopen Issueを現在sprintへ移し、closedは最後の割当を保つ合意を、Issue運用と定期workflowへ反映した。Project/Appには依存せず、workflowのGITHUB\_TOKENだけでIssueを更新する。
- Milestone説明の登録済み `idea-boost-sprint:v1` JSONを読み、JSTの明示期間を使う。空白日・未登録・重複・不正は保留する。履歴はGitHub標準のMilestone変更履歴に残す。
- 外部書込なしのテストで全Type、繰越し、PR除外、closed保持、dry-run、期間境界・再読取競合・API失敗を検証した。実データは読み取りとdry-runだけで確認し、merge前のIssue割当は変更しない。

## 2026-10-04: 自動割当に合わせて着手条件を整理

全open Issueの定期割当に合わせ、AGENTS・実装／PR／PBI skill・作業Issueフォームから着手前のMilestone確認・設定・実装保留を削除した。反映待ち・期間外・現在sprint未確定でも作業を進められる。親PBIの後日整理は維持する。期間不明時に自動割当だけを保留するコードは変更していない。

## 2026-10-04: 旧運用の説明を保守記録へ集約

現行文書・skills・フォームから旧DemoGoalの説明と廃止注記を除き、PBIの目的・受け入れ条件・デモ確認内容だけで読めるようにした。ADRの共有スキル集約の理由は維持し、旧スキル名の経緯は本記録へ残す。

Projectの「PBI未紐づけ」の実フィルター `repo:engineer-first/idea-boost is:issue -type:PBI,DemoGoal no:parent-issue` は変更していない。現行ガイドでは作業Issueと親の有無による絞込みを説明する。作成スクリプトの入力キー `demo_goals` はPBI本文のデモ確認内容を表すため維持し、既存Typeに関する自動割当・状態同期・バーンダウンの回帰テストも残す。

### 確認した既存DemoGoal（2026-10-04、30件すべてclosed）

既存Issue・組織Typeは変更しない。必要なPBIを再開する場合だけ、確認内容をそのPBI本文へまとめて旧Issueを参照する案とし、一括移行やcloseは行わない。

- [#3](https://github.com/engineer-first/idea-boost/issues/3) DEMO-02 ログイン・ログアウト（Sprint 2）
- [#4](https://github.com/engineer-first/idea-boost/issues/4) DE-02-02 Google認証後トップ画面へ遷移（Sprint 2）
- [#5](https://github.com/engineer-first/idea-boost/issues/5) DE-02-03 ログイン状態がわかる（Sprint 2）
- [#6](https://github.com/engineer-first/idea-boost/issues/6) DE-02-04 ログアウトできる（Sprint 2）
- [#10](https://github.com/engineer-first/idea-boost/issues/10) DEMO-01 開発環境を統一する（Sprint 2）
- [#11](https://github.com/engineer-first/idea-boost/issues/11) DE-01-02 READMEで環境構築手順と起動方法を確認できる（Sprint 2）
- [#12](https://github.com/engineer-first/idea-boost/issues/12) DE-01-03 ランタイム言語のバージョン出力が統一されている（Sprint 2）
- [#13](https://github.com/engineer-first/idea-boost/issues/13) DE-01-04 Pull RequestでLintとBuildのCI結果が表示される（Sprint 2）
- [#17](https://github.com/engineer-first/idea-boost/issues/17) DEMO-03 付箋でアイデアを追加・編集する（Sprint 2）
- [#45](https://github.com/engineer-first/idea-boost/issues/45) DEMO-04 ルームを作成し、招待URLを発行する（Sprint 3）
- [#47](https://github.com/engineer-first/idea-boost/issues/47) DEMO-05 招待URLからルームに参加し、メンバーを確認する（Sprint 3）
- [#49](https://github.com/engineer-first/idea-boost/issues/49) DEMO-06 フェーズ・ステップの進行を全員で同期する（Sprint 3）
- [#51](https://github.com/engineer-first/idea-boost/issues/51) DEMO-07 個人の時間で課題を付箋に書く（Sprint 3）
- [#53](https://github.com/engineer-first/idea-boost/issues/53) DEMO-08 課題をホワイトボードで共有し、グルーピングする（Sprint 3）
- [#55](https://github.com/engineer-first/idea-boost/issues/55) DEMO-09 課題にドット投票し、取り組む課題を決定する（Sprint 4）
- [#57](https://github.com/engineer-first/idea-boost/issues/57) DEMO-10 フェーズ1のステップ進行と操作のオンオフを制御する（Sprint 4）
- [#59](https://github.com/engineer-first/idea-boost/issues/59) DEMO-11 決定した課題を持ち越して表示し、HMWを個人で書く（Sprint 4）
- [#61](https://github.com/engineer-first/idea-boost/issues/61) DEMO-12 HMWを共有し、ステルス投票して決定する（Sprint 4）
- [#63](https://github.com/engineer-first/idea-boost/issues/63) DEMO-13 決定したHMWを持ち越して表示し、アイデアを個人で書く（Sprint 4）
- [#65](https://github.com/engineer-first/idea-boost/issues/65) DEMO-14 アイデアを価値×実現しやすさの2軸マップに配置する（Sprint 4）
- [#67](https://github.com/engineer-first/idea-boost/issues/67) DEMO-15 アイデアを共有し、ステルス投票して決定する（Sprint 5）
- [#127](https://github.com/engineer-first/idea-boost/issues/127) DEMO-16 各フェーズ・ステップのファシリテーションガイドを表示する（Sprint 5）
- [#131](https://github.com/engineer-first/idea-boost/issues/131) DEMO-98 本番環境へデプロイし、招待URLでスプリントを実施できるようにする（Sprint 4）
- [#133](https://github.com/engineer-first/idea-boost/issues/133) DEMO-99 ホワイトボードを全画面表示にし、操作をフローティングツールバーに集約する（Sprint 5）
- [#243](https://github.com/engineer-first/idea-boost/issues/243) DEMO-17 作業領域を保ちながら初心者向けフェーズガイドを表示する（Sprint 6）
- [#259](https://github.com/engineer-first/idea-boost/issues/259) DEMO-18 次にやることを理解し、見やすい画面で作業できる（Sprint 6）
- [#261](https://github.com/engineer-first/idea-boost/issues/261) DEMO-19 一緒に作業している相手の操作位置が分かる（Sprint 6）
- [#263](https://github.com/engineer-first/idea-boost/issues/263) DEMO-20 投票先と残り票数を把握しながら投票できる（Sprint 6）
- [#265](https://github.com/engineer-first/idea-boost/issues/265) DEMO-21 サービス名をIdea Boostに統一して提供できる（Sprint 6）
- [#268](https://github.com/engineer-first/idea-boost/issues/268) DEMO-22 今回の成果を伝え、レビューを受けられる（Sprint 6）
