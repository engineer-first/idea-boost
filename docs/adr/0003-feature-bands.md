---
id: "0003"
status: Proposed
date: "2026-07-13"
---

# ADR 0003: feature内部を依存方向の5帯にする

## Context

機能内のUIとロジックの二層構成では、実装とテスト・stories・fixtureが並び、UI一覧が膨らんでいた。部品の本質的な大きさだけを基準にした分類は、境界を機械的に判定できなかった。

## Decision

機能内部のUIをcontainers・templates・organisms・moleculesの依存方向で区分し、非UIをlogicへ分ける5帯を使う。帯は部品の主観的な粒度ではなく、上位の帯へ依存しないという宣言にする。帯のスキップと同帯依存を認め、小さい機能はフラットに保つ。依存方向を検査でき、不要な階層を増やさないためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、開発規約・当時の比較記録へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、主観的な分類の正解を争う代わりに依存方向を検査できること。悪い影響は、帯の変更に配置と参照の変更が伴い、衛星ファイルで一覧が膨らむ問題自体は残ること。中立の影響として、フラットと5帯の2つの配置を運用する。帯の昇格や衛星の見落としが継続して負担になる場合に、機能の切り出しと分類方式を見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。dateは旧資料の決定日表記で、本人の元発言による日付の裏付けは未確認。

## Alternatives Considered

フラット、部品ごとのディレクトリ、Atomicの粒度分類を比較した記録がある。採否と当時の再検討指標は比較記録を参照する。

## Related ADRs

- [ADR 0002](0002-feature-boundaries.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [当時の比較・検証・改定記録](../archive/feature-design-2026-07.md)
- [現行規約](../development/conventions.md#コード配置と命名)
- [帯の検査](../../rules/ast-grep/feature-band-imports.yml)
- [配置検査](../../scripts/check-feature-layout.mts)
- [構成移行 PR #128](https://github.com/engineer-first/idea-boost/pull/128)
- [照合した実装・規約](../../scripts/check-feature-layout.mts)（確認日：2026-11-03）。
- 採用の根拠：2026-11-03時点で、オーナーがこの判断を採用した記録は確認できていない。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0003-feature-bands.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
