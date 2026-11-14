---
id: "0019"
status: Proposed
date: "2026-10-18"
---

# ADR 0019: 保存待ちの共有付箋移動をローカルで受け付ける

## Context

前の移動の確定応答待ち中に次のドラッグを拒否していたため、短い移動を続けると入力が無視された。接続内の順序保証だけでは確定応答までの待ち時間を消せず、途中位置の配信間隔の短縮も入力拒否を解消しなかった。

## Decision

保存待ちでも次の移動を本人の表示上で受け付け、共有状態の確定はRoomDOへ一件ずつ順に送る。各ドラッグを独立した操作として残し、Undoも一回ずつ戻せるようにする。未送信分は本人の一時状態とし、競合や切断・再同期では破棄する。操作の即応性を通信往復から分け、共有状態の権威と操作単位の履歴を守るためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、キャンバス操作仕様・付箋移動の実装PRへ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、短い連続ドラッグが保存待ちによって無視されなくなること。悪い影響は、遅延中に未送信操作がたまり、他者への反映とUndo可能になる時点が遅れること。中立の影響として、未送信操作はページ閉鎖や切断で失われ、表示されたことは保存成功を意味しない。長期遅延の蓄積が問題になる場合に、入力上限と操作単位のUndoを合わせて見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

複数操作を同時送信すると本人の操作同士が競合する。最後の位置に集約すると各ドラッグのUndoを失う。本人の途中表示を確定状態へ書き込む案はRoomDOの権威を崩す。

## Related ADRs

- [ADR 0006](0006-move-transactions.md)：関連する判断。
- [ADR 0018](0018-websocket-message-order.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #713](https://github.com/engineer-first/idea-boost/issues/713)
- [PR #726](https://github.com/engineer-first/idea-boost/pull/726)
- [連続操作のhook回帰テスト](../../features/notes/logic/use-note-move-queue.spec.tsx)
- [受信を250ms遅らせる実ブラウザ検証](../../tests/browser/canvas-move-queue.spec.ts)
- [キャンバス操作仕様](../product/canvas-interactions/details.md)
- [照合した実装・規約](../../features/notes/logic/use-note-move.ts)（確認日：2026-11-03）。
- 2026-10-16〜18：オーナーは短いドラッグの不具合を報告し、改善とpushを依頼した。ローカルキューの方式を個別に承認した記録は確認できていない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0019-queue-local-note-moves.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
