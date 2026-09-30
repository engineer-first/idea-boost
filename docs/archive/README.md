# 過去の検討・検証記録

ここは設計判断や運用ルールの根拠を読む場所。現行の要求・手順・規約は[文書の入口](../README.md)から辿る。当時の実測・旧構成を現在の実装として扱わない。

| 資料                                                    | 残す理由                                             | 現在の参照先                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [feature構成の比較・検証](feature-design-2026-07.md)    | 候補の比較、実証した境界検査の穴、緩和と受容した費用 | [ADR 0002](../adr/0002-feature-boundaries.md)・[ADR 0003](../adr/0003-feature-bands.md) |
| [指示の保守記録](agent-guidance-maintenance-2026-09.md) | 採用根拠と当時のagent実走結果                        | [現在の保守手順](../development/agent-maintenance.md)                                   |

スプリント期間はMilestone、一度限りのProject移行はGit履歴を参照する。Issue自動化の未実装候補は[Issue #393](https://github.com/engineer-first/idea-boost/issues/393)へ移した。完了済みの運用作業や進捗の複製をarchiveへ増やさない。

公開HTMLの判断資料は冒頭と[目次](../site/index.html)で過去資料と表示する。

- [技術選定の再評価](../site/stack-reeval/index.html)：2026年7月の比較。[ADR 0001](../adr/0001-cloudflare-room-authority.md)
- [自前ボードの判断](../site/why-not-tldraw/index.html)：2026年7月のSupabase構成の理由とデモ。[ADR 0004](../adr/0004-custom-board.md)
- [Supabase Realtimeの解説](../site/realtime/index.html)：Supabase時代の学習資料。現在はRoomDO / WebSocket

`docs/images/issue-366/`の画面資料は外部参照と用途が未確認のため保持する。参照が見当たらないだけで削除しない。
