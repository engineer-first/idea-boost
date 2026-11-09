---
id: "0015"
status: Proposed
date: "2026-10-14"
---

# ADR 0015: アカウント単位でルーム参加の切り替えを管理する

## Context

オーナーは、同じアカウントが別タブや別端末から複数の未完了ルームへ参加する使い方を想定しないと明示した。各RoomDOが在籍の真実を持つ一方、同時要求や応答喪失をまたいで本人の参加先を一つに保つ調整役はなかった。

## Decision

本人単位のAccountDOで参加・作成・再訪と切り替えを調整し、未完了の参加先を一つに保つ。在籍・接続・成果閲覧権の真実は各RoomDOが持つ。元ルームの退出と移動先の参加の結果を照合し、応答が失われても二重参加にしない。ホスト交代・解散を伴う場合には本人の同意を求める案とした。端末内の制御に限定せず、サーバーで並行する要求を制御するためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、参加先切り替えの運用仕様へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、別端末や同時要求でも本人の参加先を一つに制御できること。悪い影響は、複数RoomDOとの調整と途中失敗の回復が増えること。中立の影響として、完了成果の閲覧は未完了ルームの参加とは別に扱う。本人の制限が実際の共同作業に合わない場合、または切り替え時の同意が負担になる場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

タブ間通知では別端末と直接API要求を制御できない。D1へ現在ルームだけを記録する案も、RoomDOの在籍変更と一括確定できない。AccountDOという実現方式は実装提案であり、オーナーが明示したのは単一参加という目的である。

## Related ADRs

- [ADR 0016](0016-account-participation-index.md)：照合方式を変更する提案。本人単位の制御は維持する。
- [ADR 0025](0025-room-without-host.md)：ホスト交代・解散への同意を変更する提案。本人単位の制御は維持する。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #630の合意済み仕様](https://github.com/engineer-first/idea-boost/issues/630#issuecomment-6148258279)
- [30秒のタイムアウト](https://developers.cloudflare.com/durable-objects/api/state/)
- [現在の構成とデータ責務](../architecture/overview.md)
- [作成の受付・回復と参加先切り替え](../operations/room-creation.md)
- [実装 PR #652](https://github.com/engineer-first/idea-boost/pull/652)
- [本人単位の調整](../../workers/account/account-do.ts)
- [照合した実装・規約](../../workers/account/account-do.ts)（確認日：2026-11-03）。
- 2026-10-12 Codexセッション 01a129f8（複数ルーム利用への疑問）、2026-10-14 01a135ce（確定仕様の実装依頼）。本人の単一参加の意図と、AIが選んだAccountDO方式の採用承認は区別する。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0015-account-room-participation.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
