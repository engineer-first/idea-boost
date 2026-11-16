---
id: "0017"
status: Proposed
date: "2026-10-16"
---

# ADR 0017: 付箋移動はドロップ時の分類から確定する

## Context

移動開始時の全体の分類版を確定時にも要求すると、別の参加者が別の付箋を動かしただけでドラッグが取り消された。分類は離した位置から再編する一方、対象付箋自体の競合と不可視な情報の変更は防ぐ必要がある。

## Decision

通常移動はドロップ時の現在の分類へ移動後の位置を適用して確定する。無関係な分類の更新だけでは取り消さず、位置・分類・成功記録の一括確定と対象の競合・可視性の検査は維持する。保存済みの分類を復元するUndoは別の競合条件で守る。独立した同時操作を受け付けながら他者の変更を上書きしないためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、キャンバス操作の実装用詳細へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、二人が別の付箋を同時に動かせること。悪い影響は、分類の結果がRoomDOでの確定順に依存すること。中立の影響として、通常移動とUndoでは必要な競合条件が異なる。分類変更で座標系や付箋の位置まで変更する機能を導入するときに見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

全体の分類版の一致は独立操作を拒否する。開始時の分類をそのまま上書きすると他者の名前や所属を消すため、実装では確定直前の分類を使う。

## Related ADRs

- [ADR 0006](0006-move-transactions.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #713](https://github.com/engineer-first/idea-boost/issues/713)
- [Issue #719](https://github.com/engineer-first/idea-boost/issues/719)
- [移動transaction契約](../product/canvas-interactions/details.md#523の移動transaction契約)
- [PR #674](https://github.com/engineer-first/idea-boost/pull/674)
- [実装 PR #726](https://github.com/engineer-first/idea-boost/pull/726)
- [移動確定の実装](../../workers/room/move-operations.ts)
- [照合した実装・規約](../../workers/room/move-operations.ts)（確認日：2026-11-03）。
- 2026-10-16〜18：オーナーは付箋移動の改善を依頼し、不具合を再報告した。本人の要望は操作体験の改善であり、本方式の個別承認ではない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0017-move-current-groups.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
