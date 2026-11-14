---
id: "0024"
status: Proposed
date: "2026-10-31"
---

# ADR 0024: PBIの優先順をProjectの共通手動順で管理する

## Context

リファインメントで決めたPBIの優先順を別ビューでも使うため、順位の数値への同期を実装していた。定期同期の遅延が問題となり実行基盤も変更したが、Project内で手動順を共有できるため、順序を使う目的に別の同期値は必須ではなかった。

## Decision

GitHub Projectsの共通手動順をPBIの優先順の正本にする。リファインメントで順序を変え、同じ順で見たいビューは手動順で表示する。数値への変換や定期同期を撤去し、既存の値は記録として扱う。必要なのが順序であれば、標準機能で満たして反映待ちと同期基盤を減らすためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、Issue運用のPBI優先順へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、番号の更新と同期の待ち時間がなくなること。悪い影響は、別ビューからのドラッグも共通の順序を変えること。中立の影響として、別のソート条件を持つビューはその条件が優先し、既存フィールドの値は順位の正本にならない。外部への順位出力、確定版や履歴、独立した複数の優先順が必要になった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

数値への定期同期、別基盤での同期、操作イベントによる同期を増やす案に対し、標準の共通手動順を使う実装へ変更した。オーナーがどの比較を確認し採用を承認したかの元発言は未確認である。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [GitHub担当者によるProjectの手動順の説明](https://github.com/orgs/community/discussions/152407)
- [ビューごとの設定と保存](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/managing-your-views)
- [WorkerのCron削除・撤去・不在確認](https://github.com/engineer-first/idea-boost/actions/runs/41164848691)
- [PBI優先順の運用](../team/issues.md#pbiのドラッグ順と優先順位)
- [同期撤去 PR #884](https://github.com/engineer-first/idea-boost/pull/884)
- [照合した実装・規約](../team/issues.md#pbiのドラッグ順と優先順位)（確認日：2026-11-03）。
- 採用の根拠：2026-11-03時点で、オーナーがこの判断を採用した記録は確認できていない。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0024-pbi-shared-manual-order.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
