---
id: "0004"
status: Proposed
date: "2026-07-04"
---

# ADR 0004: 付箋ボードを自前で実装する

## Context

当時必要だった中心操作は付箋の作成・編集・移動・投票だった。非共有付箋とステルス投票は端末で隠すだけでは保護できない。tldrawとSupabase BroadcastのPoCには永続化、初期状態、競合解決、認可の不足があった。

## Decision

汎用の描画SDKとその同期モデルを全面採用せず、付箋をドメインの明示的なデータとして扱うボードを自前で実装する。必要な付箋UXは既存製品から学び、進行と可視性の要求に合わせて操作を組み立てる。自由描画全体よりも、このアプリの共同作業を優先するためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、キャンバス操作仕様へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、付箋の進行・候補整理・可視性をドメインに合わせられること。悪い影響は、選択・編集・移動・キーボード・パン・ズームの保守を自分たちで担うこと。中立の影響として、当時のSupabaseを維持する理由は基盤移行後にはそのまま適用できない。自由描画や汎用シェイプの要求が増え、自前保守の費用がSDK採用を上回る根拠が得られたら見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

tldrawのドキュメント同期、独自同期、自前の構造化ボードを比較した。PoCの不足を埋める範囲とドメイン固有の可視性を重視した比較は当時の資料に残る。

## Related ADRs

- [ADR 0001](0001-cloudflare-room-authority.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [PR #76](https://github.com/engineer-first/idea-boost/pull/76)
- [2026年7月の判断全文と操作デモ](../site/why-not-tldraw/index.html)
- [現行要求](../product/sprint-flow.md)
- [付箋UI](../../features/notes/molecules/note-card.tsx)
- [配信可視性](../../workers/visibility.ts)
- [照合した実装・規約](../../features/notes/molecules/note-card.tsx)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0004-custom-board.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
