---
id: "0012"
status: Proposed
date: "2026-10-11"
---

# ADR 0012: PR Previewの画面・API・保存先をPRごとに分ける

## Context

初版のPreviewで画面はPR版、APIはdevelop版だったため、戻り先の情報が届かず「直前のステップに戻る」を確認できなかった。画面だけの公開ではAPIと保存処理を変えるPRをマージ前に検証できなかった。

## Decision

PR版の画面とAPIを一緒に公開し、D1とRoomDOの保存先および認証をPRごとに分離する。PR同士と本番のデータを共有しない。本人のGoogleログインとルームの認可は維持する。PRコードのビルドと秘密情報を扱う公開処理を分ける。変更全体を試し、別PRや本番へ影響させずに確認するためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、PR Preview運用へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、APIと保存を含む変更をPR単位で確認できること。悪い影響は、PRごとに保存先・鍵・削除対象を管理する費用が増えること。中立の影響として、PreviewデータはPR終了で消え、公開版の固定URLも過去の保存状態を固定しない。分離の運用費用が検証価値を上回るか、Preview固有の制約で必要な動作を試せなくなった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

画面だけPR版にする共通API案では今回の不具合を確認できなかった。PRごとの別API Workerへ接続する案には当時のPreview接続の制約があり、同じ公開単位へまとめる方式を実装した。

## Related ADRs

- [ADR 0011](0011-pr-preview-identity.md)：関連する判断。
- [ADR 0013](0013-pr-preview-migration-reset.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #362](https://github.com/engineer-first/idea-boost/issues/362)
- [CloudflareのPreview保存先・分離・Service Bindingの制約](https://developers.cloudflare.com/workers/previews/resources/)
- [画像付き確認記録](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6107148027)
- [公開処理](https://github.com/engineer-first/idea-boost/actions/runs/38124268809)
- [画像付き比較記録](https://github.com/engineer-first/idea-boost/pull/621#issuecomment-6107797495)
- [終了処理](https://github.com/engineer-first/idea-boost/actions/runs/38128051763)
- [変更全体のPreview PR #591](https://github.com/engineer-first/idea-boost/pull/591)
- [同じ公開単位への接続](../../workers/preview-full-stack.ts)
- [PRごとの保存先管理](../../scripts/preview-resources.mts)
- [照合した実装・規約](../../workers/preview-full-stack.ts)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0012-pr-preview-full-stack.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
