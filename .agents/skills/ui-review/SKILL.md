---
name: ui-review
description: features/・app/・components/ の UI 変更を、配置・stories・検証の選び方・見た目（DESIGN.md）の観点でレビューする。UI を追加・変更した後、PR 作成前に使う。認可は扱わない。
---

# UI 変更のレビュー

`git diff` と未追跡ファイルから UI の変更（`features/`・`app/`・`components/` の `.tsx`・CSS・stories・fixture・spec）を取り出し、下の規範に照らしてレビューする。
規約の本文はここに書き写さない。レビュー前に次を読み、指摘の根拠には該当箇所を示す。

- [コード配置と命名](../../../docs/development/conventions.md#コード配置と命名)と[UI](../../../docs/development/conventions.md#ui)
- [テスト方針](../../../docs/development/testing.md)。特に「検証する層を選ぶ」「UI 変更の判断」
- 見た目を変えた場合は [DESIGN.md](../../../DESIGN.md)

認可・可視性は扱わない。Claude Code では `authz-security-reviewer` エージェントの担当とする。

## 観点

1. **配置と境界**: ドメイン UI が `features/`、`components/ui/` がドメインを知らないか。container / view の分離、`app/` の責務。静的検査（`npm run check:feature-layout`・`npm run lint:boundaries`）で分かることは実行結果を示し、読み直さない。
2. **stories**: 追加・変更した UI 部品に stories があり、実際の Props と変更した状態を再現しているか。
3. **検証の選び方**: 変更が振る舞いか、文言・CSS・配置だけかを先に判定する。振る舞いなら、検知したい不具合を観測できる層（純関数・DOM・browser）で失敗するテストから始まっているか。親の DOM テストで検知できるなら子ごとの専用 spec を求めない。データに依存する UI は、適用される loading / empty / success / error を状態を持つ container・view 等で検証し、見た目を stories で再現しているか。存在しない状態を要求しない。
4. **fixture とモック**: 生のテストデータや固定コンテンツをコンポーネントに書いていないか。spec と stories が fixture を共有し、外部 API は MSW、WS は `webSocketFactory` のフェイクでモックしているか。
5. **見た目**: 色・角丸を値ではなくトークン名で書き、DESIGN.md の役割どおりに使っているか（主色は次にやることだけ、状態色は役割ごとに 1 色、付箋に常時の枠を付けない、押せないボタンは破線、ダイアログに説明を足さない等）。`npm run lint` で検出できない定数文字列の既定パレットや、DESIGN.md の文章にしかない基準を中心に見る。

## 出力

- 日本語で書き、各指摘に `must-fix` / `should-fix` / `nit` と `ファイルパス:行番号`、根拠の文書と節を付ける。
- 欠けている検証は「どの不具合を検知できないか」で書く。件数やファイルの有無だけで指摘しない。
- 見た目の確認が人の目でしかできない場合は、確認すべき story と状態を挙げる。
