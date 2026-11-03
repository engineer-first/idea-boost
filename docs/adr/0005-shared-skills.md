---
id: "0005"
status: Proposed
date: "2026-10-04"
---

# ADR 0005: 共有スキルの正本を .agents/skills に統一する

## Context

同名の共有スキルがエージェント別の複数の場所に存在し、更新差分が生じていた。編集場所と文書からの参照先も統一されておらず、1回の編集を複数エージェントへ反映する必要があった。

## Decision

共有スキルと付属資産の正本を .agents/skills に集約する。Codexは正本を直接読み、Claude Codeは製品側の探索場所から相対symlinkで参照する。製品ごとの実体コピーを同期せず、編集する場所を一つにするためである。これは両製品共通の公式指定ではなく、本リポジトリで選ぶ運用方針とする。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、エージェント指示の保守へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、スキルを1回編集すれば複数エージェントへ反映できること。悪い影響は、Gitのsymlinkを保持できる開発環境と、新規スキル追加時の参照設定が必要なこと。中立の影響として、各製品固有の呼び出し設定は引き続き別に必要になる。公式の探索方式が変わるか、symlinkを保持できない環境を支援する必要が出た場合に見直す。

2026-11-03に実コード・一次資料を照合。根拠未確認：実装または提案記録は確認できるが、オーナーがこの技術方針・比較理由まで採用した元発言は確認できない。実装済みであることだけではAcceptedにしない。

## Alternatives Considered

複数の実体を同期する案は更新漏れが残る。Claude専用の場所を正本にする案より、製品に依存しない編集場所へ集める案を既存のIssueと実装が示している。

## References

- dateは旧記録の提案日または記録日を引き継いだもの。オーナーの決定日の裏付けは未確認。
- [Issue #528](https://github.com/engineer-first/idea-boost/issues/528)
- [Codex の探索場所](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)
- [Claude Code の探索場所](https://code.claude.com/docs/en/skills#choose-where-skills-load)
- [Agent Skills の構成](https://agentskills.io/specification#directory-structure)
- [エージェント指示の保守](../development/agent-maintenance.md#共有スキルの正本)
- [正本統一の実装履歴](https://github.com/engineer-first/idea-boost/commit/6c8921a5)
- [照合した実装・規約](../../.claude/skills)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0005-shared-skills.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。
