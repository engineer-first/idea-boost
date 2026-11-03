---
id: "0009"
status: Proposed
date: "2026-10-09"
---

# ADR 0009: WebSocketにも署名検証済みセッション期限を適用する

## Context

HTTPは期限切れの認証を拒否していたが、期限前に開いたWebSocketは期限後も操作・配信できた。RoomDOは休止・復帰するため、接続時の認証結果をメモリだけへ持つ方式では継続した検査を保証できなかった。

## Decision

署名検証済みのセッション期限を既存WebSocketにも適用し、期限後の共有操作と情報配信を拒否する。期限切れは接続の失効として扱い、在籍と確定済み本文は維持する。同じ本人の有効な別接続まで止めない。HTTPとWebSocketで認証の境界を一致させるためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、認証期限の実装PR・開発規約へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、開いた接続を使い続けて認証期限を迂回できなくなること。悪い影響は、長時間の共同作業を継続するために認証の更新と再接続の体験が別途必要になること。中立の影響として、期限前に確定した保存を巻き戻さず、結果不明の回復も既存の操作識別と照会で扱う。途中失効や長時間作業の更新を導入するときに、署名済み期限だけで十分か見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

クライアント申告や未検証の期限は信頼しない。無通信接続を期限ちょうどに閉じる専用タイマーは設けず、受信・配信時に期限を検査する技術案が実装されている。

## Related ADRs

- [ADR 0010](0010-room-entry-authentication.md)：関連する判断。
- [ADR 0021](0021-guest-session-identity.md)：関連する判断。
- [ADR 0022](0022-guest-session-refresh.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Task #535](https://github.com/engineer-first/idea-boost/issues/535)
- [継続体験のPBI #557](https://github.com/engineer-first/idea-boost/issues/557)
- [更新方式のSpike #558](https://github.com/engineer-first/idea-boost/issues/558)
- [実装 PR #573](https://github.com/engineer-first/idea-boost/pull/573)
- [期限の拒否実装](../../workers/room/room-do.ts)
- [期限境界の回帰テスト](../../workers/room/session-expiry.spec.ts)
- [開発規約](../development/conventions.md)
- [照合した実装・規約](../../workers/room/room-do.ts)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0009-websocket-session-expiry.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
