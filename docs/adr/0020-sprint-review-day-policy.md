---
id: "0020"
status: Proposed
date: "2026-10-28"
---

# ADR 0020: Sprintのreview日を含む割当期間をversionで区別する

## Context

Milestoneの期限日にreviewを行う運用に対し、既存の自動割当はその日の開始時に終了するため、review当日に未完了Issueが次期へ移り得た。既存の期間定義は過去集計にも使われ、同じ定義の解釈を変更すると履歴まで変わる。

## Decision

review当日いっぱいを含む新しい期間定義を別versionとして提案する。旧versionの期間は従来の意味で読み、過去の所属を再解釈しない。期間の開始と重複は明示された日程で判断し、推測で補正しない。review当日の繰越しを防ぎつつ、履歴の意味を維持するためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、Issue運用のSprint期間仕様へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、review日の作業を当期に残せること。悪い影響は、日程を読むすべての利用先の対応と、次期の開始日の調整が必要なこと。中立の影響として、実装のマージだけでは既存の日程とIssueの運用採用を意味しない。reviewを特定時刻で終了する運用や、期間の重複を認める必要が出た場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。新期間の実運用採用も未確認。

## Alternatives Considered

既存期間を一律に1日延長する案は過去の境界を変える。前期を優先する自動補正は明示された開始日と実効開始日を二重化するため、提案では採用しない。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [移行時の確認](../team/issues.md#review日を含むv3運用採用は別途判断)
- [Issue運用の自動割当](../team/issues.md#現在sprintへの自動割当)
- [日程判定・割当実装](../../.github/scripts/assign-current-sprint.js)
- [v2互換・v3境界・繰越しのfixture](../../.github/scripts/assign-current-sprint.spec.ts)
- [提案と実装 PR #860](https://github.com/engineer-first/idea-boost/pull/860)
- [照合した実装・規約](../../.github/scripts/assign-current-sprint.js)（確認日：2026-11-03）。
- 採用の根拠：2026-11-03時点で、オーナーがこの判断を採用した記録は確認できていない。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0020-sprint-review-day-policy.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
