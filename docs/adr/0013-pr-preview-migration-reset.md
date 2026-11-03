---
id: "0013"
status: Proposed
date: "2026-10-11"
---

# ADR 0013: PR Previewはmigration変更時に保存先を作り直す

## Context

適用済みmigrationの内容を書き換えても、同じ識別のSQLは既存のD1とRoomDOでは再実行されず、最新のコードとDBが合わなくなる。Previewの目的はPRの最新コードの検証であり、保存データの維持とは両立しない場合があった。

## Decision

PRのmigrationが変わった場合は、そのPRのPreviewと保存先を作り直す。通常のコード更新では保存先を再利用する。対象と直前の公開版を確認できない場合は、推測して削除せず公開を止める。Previewではデータの維持より、PRのコードと新規構築したDBが一致する検証環境を優先するためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、PR Preview運用へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、適用済みSQLの変更を含めて最新のPRを検証できること。悪い影響は、以前のルームと付箋を失い、再作成中は確認できない時間が生じること。中立の影響として、PR用の入口URLは維持するが、保存データや既存ルームURLの存続は保証しない。本番やマージ済みmigrationの不変性は変えない。長期データを用いた検証が必要になった場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

SQLが変わっても同じ保存先へ再適用する案では、新しいコードと適用履歴が一致しない。公開履歴ごとに保存先を増やす方式は採らず、PR単位の再作成としている。

## Related ADRs

- [ADR 0012](0012-pr-preview-full-stack.md)：関連する判断。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [運用手順](../operations/preview.md)
- [実装 PR #627](https://github.com/engineer-first/idea-boost/pull/627)
- [migration比較](../../scripts/preview-migrations.mts)
- [公開・再作成制御](../../scripts/preview-control.mts)
- [照合した実装・規約](../../scripts/preview-control.mts)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0013-pr-preview-migration-reset.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
