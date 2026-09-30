# ドキュメント

プロダクト要求の正本は[PRD](prd.md)。Wikiは更新しない。詳細仕様はPRDから参照し、読む目的と更新する場所を揃える。

## 知りたいことから探す

| 知りたいこと                           | 読む資料                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 何を作るか・誰のためか                 | [PRD](prd.md)                                                                                    |
| ステップ・操作・ガイド・成果の振る舞い | [進行仕様](product/sprint-flow.md)                                                               |
| コードをどこに置くか                   | [開発規約](development/conventions.md)                                                           |
| 何をどう検証するか                     | [テスト方針](development/testing.md)、[ローカル検証](development/local-verification.md)          |
| 本番の閲覧権限を付けたい               | [認証と権限付与](operations/access.md)                                                           |
| 本番を公開・復旧したい                 | [リリース運用](operations/release.md)                                                            |
| 成果・意見の保存や削除を確認したい     | [共有成果](operations/shared-outcomes.md)、[意見](operations/feedback.md)                        |
| 現在の構成とデータ責務を知りたい       | [構成概要](architecture/overview.md)                                                             |
| なぜこの設計を選んだか                 | [ADR](adr/README.md)                                                                             |
| Issue・チームの仕事を進めたい          | [Issue運用](team/issues.md)、[ホワイトボード](team/whiteboard.md)                                |
| 指示・skill・hookを保守したい          | [エージェント指示の保守](development/agent-maintenance.md)                                       |
| 図や操作デモで理解したい               | [公開HTMLの目次](site/index.html) / [GitHub Pages](https://engineer-first.github.io/idea-boost/) |
| 当時の検討を辿りたい                   | [過去資料](archive/README.md)                                                                    |

## 作る・統合する・残す基準

- 新しい文書は、既存文書では答えられない問いがあるときに作る。先に読者・問い・更新する契機を決める。
- 同じ目的で読み、同じ変更で更新する内容は統合する。同じルールを複数の正本にしない。仕様と手順のように用途が違うものは分けて参照する。
- 現行の要求・規約・手順は更新する。重要な設計判断はADR、比較全文・旧構成・一度限りの移行記録はarchiveへ残す。
- 空の文書や、統合後に固有の内容がなくなった文書は削除する。未採用案や外部参照のある画像は、行き先・用途を確認せず削除しない。
- 作業と進捗はGitHub Issue / Project、スプリント割当てはMilestone、公開実績はGitHub Releasesで管理する。
- 公開HTMLは図とデモを持ち、正本のMarkdownへ案内する。既存URLを保ち、現行の解説か過去資料かを明示する。制作ルールは[site/README.md](site/README.md)。

文書を移すPRでは、リンク・アンカー・AGENTS・skill・コード内の参照も更新する。要件を削らず統合し、矛盾は実装・テスト・決定記録と照合する。
