# 過去の検討・移行記録

ここは当時の根拠を読む場所。現行の要求・手順・規約は[文書の入口](../README.md)から辿る。本文に旧配置や当時の前提を含むため、現在の実装として扱わない。

| 資料                                                           | 対象時期・用途                      | 現在の参照先                                                          |
| -------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| [feature全体構造](feature-structure-2026-07.md)                | 2026年7月。旧ui/logicを含む分析     | [ADR 0002](../adr/0002-feature-boundaries.md)                         |
| [feature内部構造](feature-internal-structure-2026-07.md)       | 2026年7月。5帯の判断・改定          | [ADR 0003](../adr/0003-feature-bands.md)                              |
| [内部構成の候補比較](feature-ui-directory-options.md)          | 2026年7月。比較・検証全文           | [ADR 0003](../adr/0003-feature-bands.md)                              |
| [スプリント期間表](sprints-2026.md)                            | 2026年6〜8月。期間対応              | [Milestones](https://github.com/engineer-first/idea-boost/milestones) |
| [Project刷新](project-refresh-2026-09.md)                      | 2026年9月20日。一度限りの移行       | [Issue運用](../team/issues.md)                                        |
| [Issue自動化の改善候補](issue-automation-proposals-2026-09.md) | 2026年9月。未採用候補も保存         | [Issue運用](../team/issues.md)                                        |
| [指示の保守記録](agent-guidance-maintenance-2026-09.md)        | 2026年9月。採用根拠と当時の実走結果 | [現在の保守手順](../development/agent-maintenance.md)                 |

公開済みの過去HTMLはURLを維持し、冒頭と[目次](../site/index.html)で過去資料と表示する。

- [技術選定の再評価](../site/stack-reeval/index.html)：2026年7月の比較。React SPA・Clerkは採用していない。[ADR 0001](../adr/0001-cloudflare-room-authority.md)
- [自前ボードの判断](../site/why-not-tldraw/index.html)：2026年7月のSupabase構成の理由とデモ。[ADR 0004](../adr/0004-custom-board.md)
- [Supabase Realtimeの解説](../site/realtime/index.html)・[旧PoCの実装マップ](../site/realtime-poc-map/index.html)：Supabase時代。現在はRoomDO / WebSocket

`docs/images/issue-366/`の画面資料は外部参照と用途が未確認のため保持する。参照が見当たらないだけで削除しない。
