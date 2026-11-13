---
id: "0026"
status: Accepted
date: "2026-11-03"
---

# ADR 0026: Googleの本人も入室時にCookieを自動で更新する

## Context

従来の入室前認証は、入室時に認証の残りが5時間を下回るとGoogleで再ログインさせる。ゲストは入室前の更新により、同じ判定時にCookieを自動で再署名するようになった。同じ入室でもGoogleの本人だけがログイン操作を求められ、利用者には理由が分からない手間になっている。

## Decision

accountも0022と同じ契機・同じ条件で、同じ `sub` のCookieを発行から7日で再署名する。Googleへの往復は求めない。

- Workerは検証済みセッションの `sub` について、D1のユーザー行とGoogleの紐付けが残っている場合だけ更新を許可する。ブラウザが送るIDや期限は受け取らない。
- Cookieの消失・署名不正・実期限切れでは更新せず、通常のログインへ進める。既存WebSocketの期限は延ばさない（0009を維持）。
- 0010の元操作の引継ぎは、実期限切れ後の再ログインにだけ使う。

### 本ADRで決定しないこと

更新の通信形式と実装手順は実装PRへ、入室の要求はPRDへ委譲する。Referencesを参照。

## Consequences

- 週1回以上入室するGoogleの本人は、ログイン操作なしで使い続けられる。
- Googleアカウントの停止・連携解除は、Cookieの実期限まで反映されない。一度漏れたCookieは入室を続ける限り更新され続ける。個別失効が必要になったら、セッションIDの失効表を導入する後継ADRを作る。

## Alternatives Considered

Google側の再認証を残す案は、入室のたびの往復が利用者の手間に見合わないため採らない。作業中の自動更新は0022と同じ理由で見送る。

## Related ADRs

- [ADR 0010](0010-room-entry-authentication.md)：accountの入室前再認証を変更する提案。
- [ADR 0022](0022-guest-session-refresh.md)：ゲストの更新と同じ契機・条件を使う。
- [ADR 0009](0009-websocket-session-expiry.md)：既存WebSocketの実期限は維持する。

## References

- [#686 の方針見直し](https://github.com/engineer-first/idea-boost/issues/686)
- [0022: ゲストは入室前に同じ本人のCookieを更新](0022-guest-session-refresh.md)
- [方針を記録した PR #913](https://github.com/engineer-first/idea-boost/pull/913)（2026-11-03）。
- [ホスト撤廃の要求 #903](https://github.com/engineer-first/idea-boost/issues/903)。
- [PRD](../prd.md)、[進行仕様](../product/sprint-flow.md)。
- 2026-11-03：オーナーが入室時の再ログインを今回の改善に含めることを明示的に承認した（PR #913に記録）。実装に先行する採用判断であり、実装・配備の完了を意味しない。
