---
id: "0001"
status: Proposed
date: "2026-09-30"
---

# ADR 0001: Cloudflare構成でRoomDOを共有状態の権威にする

## Context

フェーズ進行、非共有付箋、ステルス投票を参加者ごとの可視性を保って同期する必要があった。ルーム内の操作をどこで認可し、どこへ永続化するかが基盤選定の争点だった。当時の比較資料は、放置後の復帰、ドラッグ配信、費用、運用の継続性を評価していた。

## Decision

CloudflareのWorkers・Durable Objects・D1を基盤とし、RoomDOをルーム内の共有状態・認可・配信の唯一の権威にする。ルーム単位で操作と状態を集められるためである。D1は横断的なディレクトリと投影に使い、同じルーム状態の第二の権威にはしない。ブラウザから特権的な保存先を直接操作させず、API境界を通す。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、構成概要・開発規約へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、可視性と状態更新の判断をルームごとに集約できること。悪い影響は、Cloudflare固有の永続化・実行環境に依存し、横断表示への投影の失敗と再試行を別途扱う必要があること。中立の影響として、クライアントの表示状態と共有状態の責務が分かれる。ルームを越える共有や、実測した性能・運用制約が要求を満たせなくなった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。決定日は不明のためdateは旧ADRの記録日。

## Alternatives Considered

SupabaseとVercelを継続する案は当時の技術比較に含まれる。React SPAや外部認証サービスを併用する案も資料にあるが、すべてが採用されたわけではない。最終的な選択理由をオーナーが承認した記録は確認できない。

## Related ADRs

- [ADR 0004](0004-custom-board.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [当時の技術比較](../site/stack-reeval/index.html)
- [6b695dc](https://github.com/engineer-first/idea-boost/commit/6b695dc)
- [eb0392f](https://github.com/engineer-first/idea-boost/commit/eb0392f)
- [現在の構成と責務](../architecture/overview.md)
- [RoomDO](../../workers/room/room-do.ts)
- [API設定](../../workers/wrangler.jsonc)
- [基盤移行 PR #92](https://github.com/engineer-first/idea-boost/pull/92)
- [照合した実装・規約](../../workers/room/room-do.ts)（確認日：2026-11-03）。
- 採用の根拠：2026-11-03時点で、オーナーがこの判断を採用した記録は確認できていない。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0001-cloudflare-room-authority.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
