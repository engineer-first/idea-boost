# 0003: feature内部を依存方向の5帯にする

- 状態：採用（既存判断の整理）
- 決定日：2026-07-13（移行完了・緩和：2026-07-14）
- 記録日：2026-09-30

## 背景

featureのui/logic二層ではUI一覧の見通しが悪く、実装とspec / stories / fixtureが並ぶため一覧が膨らんだ。本質的な粒度でmolecule / organismを分類する方式では、境界を機械判定できない。

## 候補と決定

フラット、部品ごとのディレクトリ、Atomicの分類と比較し、`containers / templates / organisms / molecules / logic`の5帯を採用した。UIの4帯は「上の帯へ依存しない」という宣言として使い、上向きimportを禁じる。帯のスキップと同帯依存は許可する。logicはJSXを返さない。

新規UIの既定はmolecules。feature単位でフラットか5帯かを選び、混在・帯の入れ子は認めない。atomsは作らず汎用UIを`components/ui/`へ置く。container/viewの分離と衛星ファイルの同居は維持する。

## 影響と見直す条件

主観的な分類の正解ではなく、宣言した依存方向を検査できる。一方、帯の昇格にimport変更が伴い、GitHubの一覧で衛星が畳まれないことを受容する。文字列リテラルの動的import先と型レベルのモジュール拡張は、2026-07-14の改定に従いレビューで確認する。

当時決めた再検討条件は、昇格が月5回を超える状態が2か月続くこと、衛星の見落としによる差し戻しが複数回起きること。1帯の実装が15を超えた場合は、まずfeatureの切り出し漏れを疑う。これらは現在の発生状況を主張するものではない。

## 根拠

- [当時の比較・検証・改定記録](../archive/feature-design-2026-07.md)
- [現行規約](../development/conventions.md#コード配置と命名)、[帯の検査](../../rules/ast-grep/feature-band-imports.yml)、[配置検査](../../scripts/check-feature-layout.mts)
