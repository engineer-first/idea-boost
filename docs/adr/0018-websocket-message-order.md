---
id: "0018"
status: Proposed
date: "2026-10-16"
---

# ADR 0018: 同じ接続のWS操作を受信順に処理する

## Context

参加確認の外部通信が遅れると、同じ接続で後から届いた途中表示・確定要求が移動開始を追い越した。未登録操作として結果不明を返した後、開始だけ成立して予約が残るため、本人には移動を確認できないと表示された。

## Decision

RoomDOで同じ接続の共有操作を受信順に処理する。前の要求の参加確認を含む処理が終わってから次を実行し、実行時点の認証期限・参加先・対象状態を検査する。別接続の操作は並行して進める。同じ人の因果順序を守り、他の参加者まで外部通信で止めないためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、付箋移動の実装PR・キャンバス操作仕様へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、速いドラッグでも開始・途中表示・確定の順を守れること。悪い影響は、同じ接続の遅い要求が後続を待たせること。中立の影響として、共有状態や結果の永続化は従来どおりRoomDOが担い、順序制御だけを追加する。通信遅延が恒常化した場合には待ち時間を計測し、一時的な途中表示の集約などを再検討する。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

ルーム全体を止める案は他の参加者も待たせる。許可結果のキャッシュは参加先の変化を見落とす。クライアントで開始応答を待つだけでは他の要求の追い越しも解決しない。

## Related ADRs

- [ADR 0016](0016-account-participation-index.md)：関連する判断。
- [ADR 0019](0019-queue-local-note-moves.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #713](https://github.com/engineer-first/idea-boost/issues/713)
- [Issue #719](https://github.com/engineer-first/idea-boost/issues/719)
- [参加確認を遅延させるRoomDO回帰テスト](../../workers/room/message-order.spec.ts)
- [Cloudflareのイベント並行性の説明](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile)
- [実装 PR #726](https://github.com/engineer-first/idea-boost/pull/726)
- [接続単位の順序保証](../../workers/room/room-do.ts)
- [照合した実装・規約](../../workers/room/room-do.ts)（確認日：2026-11-03）。
- 2026-10-16〜18 Codexセッション 01a1427f（付箋移動の改善依頼）。順序保証の方式はAIの実装提案。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0018-websocket-message-order.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
