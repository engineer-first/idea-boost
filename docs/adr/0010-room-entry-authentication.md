---
id: "0010"
status: Accepted
date: "2026-10-10"
---

# ADR 0010: 入室前だけ認証を準備し、元操作を一度引き継ぐ

## Context

共同作業中に認証期限へ達すると、共有操作と配信を止める必要がある。オーナーが採用した利用時間の契約は、入室判定から待機・休憩を含む最低5時間だった。通常のログイン画面は有効な認証があれば省略するため、期限更新の入口としては使えなかった。

## Decision

Googleの本人は、入室前に残り5時間以上の有効な認証を準備し、不足時は本人の明示操作でGoogleへ再ログインする。発行から固定7日の認証を維持し、作業中の活動による延長は行わない。同じ本人で現在も許可される場合に限り、選択済みの作成・参加・復帰を一度だけ引き継ぐ。共同作業の途中で通常の認証更新を要求せず、再ログインで別人の権限や本文を引き継がないためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、認証準備の確定仕様・実装PRへ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、入室前に通常の会議を続ける時間を確保し、元の目的へ戻れること。悪い影響は、待機も時間を消費し、5時間を越す作業や通信障害まで継続を保証できないこと。中立の影響として、更新済みCookieは既存WebSocketの期限を延ばさず、認証成功も保存成功を意味しない。より長い共同作業や、入室時の再ログイン負担が問題になった場合に見直す。

2026-11-03に実コード・一次資料を照合。オーナーの採用した要求と現在のaccountの実装の一致を確認した。ゲストの入室前更新はRelated ADRsの部分変更で区別する。

## Alternatives Considered

短命の認証と更新用トークン、作業中の自動更新は、合意した利用時間の契約に対して導入しないことを確定仕様が記録している。

## Related ADRs

- [ADR 0009](0009-websocket-session-expiry.md)：関連する判断。
- [ADR 0022](0022-guest-session-refresh.md)：ゲストの入室前認証だけを変更する提案。
- [ADR 0026](0026-account-session-refresh-on-entry.md)：accountの入室前再認証を変更する提案。

## References

- [確定仕様 #558](https://github.com/engineer-first/idea-boost/issues/558)
- [サーバー境界 #575](https://github.com/engineer-first/idea-boost/issues/575)
- [元操作の引継ぎ PR #582](https://github.com/engineer-first/idea-boost/pull/582)
- [入室前判定](../../lib/session/room-entry.ts)
- [照合した実装・規約](../../lib/session/room-entry.ts)（確認日：2026-11-03）。
- 2026-10-10 Codexセッション 01a1249d（vault）。オーナーは確定仕様のIssueを指定して実装を依頼した。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0010-room-entry-authentication.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
