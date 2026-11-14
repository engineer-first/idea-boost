---
id: "0022"
status: Proposed
date: "2026-10-28"
---

# ADR 0022: ゲストは入室前に同じ本人のCookieを更新する

## Context

Googleの再認証を前提とした入室前の残り時間判定は、Google連携のないゲストには使えなかった。再読込や再訪で別の本人に変わると、作業と権限を続けて使えない。

## Decision

有効なゲストが入室する前に認証の残りが5時間未満なら、Googleへ送らず同じ本人のCookieを発行から7日に自動更新する。サーバーで有効な本人と未連携の登録が存在することを確認し、実期限切れや本人不明では更新しない。入室の継続を本人の作り直しやGoogleの強制利用に結び付けないためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、ゲスト再訪のIssue仕様・実装PRへ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、定期的に入室するゲストが同じ本人を続けて使えること。悪い影響は、漏れたCookieも入室を続ければ更新され、個別失効で止められないこと。別タブの本人情報削除と更新の応答が競合すると、同じゲストのCookieが戻り得る。中立の影響として、ルームと成果の保存期限および既存WebSocketの期限は延びない。個別失効や5時間より長い作業中の継続保証が必要になった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

ページ表示ごとの無条件延長は、使っていない本人を延ばし続ける。作業中の自動更新は既存WebSocketの再接続を必要とするため今回見送る。短命の認証と更新専用トークンは失効管理の追加を要する。

## Related ADRs

- [ADR 0009](0009-websocket-session-expiry.md)：関連する判断。
- [ADR 0010](0010-room-entry-authentication.md)：関連する判断。
- [ADR 0021](0021-guest-session-identity.md)：関連する判断。
- [ADR 0023](0023-guest-google-link-same-identity.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [PBI #749](https://github.com/engineer-first/idea-boost/issues/749)
- [#850](https://github.com/engineer-first/idea-boost/issues/850)
- [Issue #853](https://github.com/engineer-first/idea-boost/issues/853)
- [実装 PR #865](https://github.com/engineer-first/idea-boost/pull/865)
- [入室前更新](../../lib/session/room-entry-session.ts)
- [照合した実装・規約](../../lib/session/room-entry-session.ts)（確認日：2026-11-03）。
- 採用の根拠：2026-11-03時点で、オーナーがこの判断を採用した記録は確認できていない。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0022-guest-session-refresh.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
