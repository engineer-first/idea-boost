---
id: "0023"
status: Proposed
date: "2026-10-29"
---

# ADR 0023: ゲストの本人IDへGoogleを後付けで連携する

## Context

ゲストの作業と権限は本人IDに結び付いているが、Cookie消失や別端末では本人へ戻れない。記録を残したい人が後からGoogleで同じ本人へ戻るには、既存の所有権をどう保つかを決める必要があった。

## Decision

ゲストの本人IDを変えずに同じ本人へGoogleを紐付ける。通常のログインとは別の連携として本人の同意と現在のゲストを確認し、連携後も表示名・付箋・在籍・成果の所有権を維持する。別の本人へ登録済みのGoogleとの統合は拒否する。複数の保存先をまたぐ所有者移行と、誤った記録統合を避けるためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、Google連携のIssue仕様・実装PRへ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、ルームと成果の所有者を書き換えずに、別端末から同じ本人へ戻れること。悪い影響は、既に別の本人へ登録したGoogleを使えず、連携解除や付け替えもできないこと。中立の影響として、連携後の接続は通常の認証と現在の権限を再確認し、Google名で表示名を上書きしない。別IDの統合需要が継続するか、Google以外へ広げる場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

新しい本人へデータを移す案は、複数保存先の途中失敗と並行操作で所有権を二重化・欠落させ得る。別IDの統合には、表示名・参加状態・権限をどちらから引き継ぐかという別の判断が必要になる。

## Related ADRs

- [ADR 0010](0010-room-entry-authentication.md)：関連する判断。
- [ADR 0015](0015-account-room-participation.md)：関連する判断。
- [ADR 0021](0021-guest-session-identity.md)：関連する判断。
- [ADR 0022](0022-guest-session-refresh.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #850](https://github.com/engineer-first/idea-boost/issues/850)
- [PBI #749](https://github.com/engineer-first/idea-boost/issues/749)
- [実装 PR #866](https://github.com/engineer-first/idea-boost/pull/866)
- [連携の認可と保存](../../workers/lib/db.ts)
- [連携の境界検証](../../workers/account-link.spec.ts)
- [照合した実装・規約](../../workers/account-link.spec.ts)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0023-guest-google-link-same-identity.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
