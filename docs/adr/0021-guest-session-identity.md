---
id: "0021"
status: Proposed
date: "2026-10-28"
---

# ADR 0021: ゲスト本人を署名付きCookieで保持する

## Context

オーナーはGoogleアカウントなしでも名前だけで作成・参加できる体験を求めた。既存のユーザーとセッションはメール必須で、名前を入れるだけでは本人の付箋や権限を再訪時に安全に引き継げなかった。後に、入口はGoogleとゲストを同等に選べる形へ明示的に修正された。

## Decision

ゲストも既存の署名付きHttpOnly Cookieで本人IDを証明し、Googleの本人と同じ認可境界を通す。ゲストとアカウントを明示的に区別し、表示名とメールの有無を本人確認の代わりにしない。初回の認証は発行から7日とし、有効な本人情報があれば同じ本人を再利用する。ゲスト用にルームと成果の認可を二重化せず、本人を偽装されないようにするためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、ゲスト本人の実装PR・PRDへ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、Googleなしでも既存の権限・在籍・成果の本人識別を使えること。悪い影響は、Cookieの消失や期限切れで同じゲストへ戻れず、本人を作り直して本人単位の制限を回避できること。中立の影響として、同じ名前でも別人であり、別端末への回復はGoogle連携など別の判断を要する。乱用、個別失効、長期の本人保持が必要になった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

ブラウザ申告のIDだけでは他人のID指定を検知できない。認証情報をJavaScriptから読める保存先へ置く案や、別のゲスト認可経路を作る案を実装比較では採用していない。

## Related ADRs

- [ADR 0009](0009-websocket-session-expiry.md)：関連する判断。
- [ADR 0014](0014-account-display-name.md)：関連する判断。
- [ADR 0022](0022-guest-session-refresh.md)：関連する判断。
- [ADR 0023](0023-guest-google-link-same-identity.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [PBI #749](https://github.com/engineer-first/idea-boost/issues/749)
- [方針変更](https://github.com/engineer-first/idea-boost/issues/749#issuecomment-6538535072)
- [Issue #852](https://github.com/engineer-first/idea-boost/issues/852)
- [Cloudflare D1の外部キー](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [実装 PR #861](https://github.com/engineer-first/idea-boost/pull/861)
- [セッションの形](../../contracts/session.ts)
- [ゲストの準備](../../features/auth/logic/guest-identity-actions.ts)
- [PRD](../prd.md)
- [照合した実装・規約](../../contracts/session.ts)（確認日：2026-11-03）。
- 2026-10-27 Claudeセッション 65fc6dc9-2297-40b6-aae5-d699de51e823（ゲスト開始の希望）、2026-10-31 9becd4fc-035e-4096-a8c1-a327fd7f1aa9（Googleとゲストを同等に選ぶ本人の訂正）。保持方式そのものの採用承認とは区別する。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0021-guest-session-identity.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
