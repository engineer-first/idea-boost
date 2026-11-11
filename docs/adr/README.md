# 設計判断の記録（ADR）

ADRは、このプロジェクトで重要な選択を必要とした事情、選んだ方針と理由、その代償を後から検証する記録。現在の構成は[構成概要](../architecture/overview.md)、要求は[PRD](../prd.md)、実装規則は[開発規約](../development/conventions.md)を参照する。

## 作る基準

構成、状態の権威、認可境界、永続化、主要依存など、後の変更を長く制約する選択を1件1判断で残す。通常の機能追加、既存方式に従う権限付与、文言修正、作業の進捗には増やさない。要求はPRD・詳細仕様、実行方法は運用文書、作業はIssueへ置く。

粒度に迷ったら「実現方式を別方式に置き換えたとき、ADR本文の書き換えが必要か」と問う。方針を変えずに関数・設定・照合方法を変えただけで書き換えが必要なら、その記述は仕様書・運用文書・PR本文へ移す。基盤や権威そのものを選ぶ判断まで抽象化して消さない。

## 記載規約

MUSTは必須、SHOULDは原則。SHOULDを外す場合は理由を説明できるようにする。

| ID     | 強度   | 規約                                                                                                                                                                                                            |
| ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-01 | MUST   | [テンプレート](template.md)を使い、実ファイルは既存と同じ4桁ID・`NNNN-kebab-case.md`にする。frontmatterに`id`・`status`・`date`を持ち、タイトルは`ADR NNNN: 判断`とする。本文・説明は日本語、節名は英語にする。 |
| ADR-02 | MUST   | Contextには、このプロジェクトで実際に起きた問題・制約を中立的な事実で書く。一般論や採用案の正当化だけにしない。単体で判断の必要性が読めるようにする。                                                           |
| ADR-03 | MUST   | Decisionは「〜する」と能動態で方針と選択理由を書く。関数名・環境変数名・照合手順・型の構造は仕様またはPRへ置く。末尾に`### 本ADRで決定しないこと`を設け、実在する委譲先を名指しする。                           |
| ADR-04 | MUST   | Consequencesには良い影響・悪い影響・中立の影響と、見直す条件を書く。保証しない範囲と受け入れるリスクを明記する。単なる実装完了報告にしない。                                                                    |
| ADR-05 | MUST   | 事実を実コード・一次資料と照合し、確認日と出典をReferencesへ記す。本人の希望、本人の採用判断、AIの提案・推測、実装済みの事実を区別する。会話や会議だけを技術的事実の根拠にしない。                              |
| ADR-06 | MUST   | Issue/PR番号とADR以外へのリンクは末尾のReferencesに置く。本文に移行計画・進捗・タスク表を書かない。関連ADRはRelated ADRs、全体の置換はSupersession節にまとめ、部分変更なら対象と残る判断を示す。                |
| ADR-07 | MUST   | 未確定事項が残る判断をAcceptedにしない。根拠不明は推測で補わずProposedとし、Consequencesに「根拠未確認」と確認できなかった点を書く。実装済み・PRマージ済みだけでは本人の採用承認としない。                      |
| ADR-08 | MUST   | 状態変更時は本索引と参照元を更新する。後継の提案があるだけでは元判断全体を置換しない。旧判断の背景を現在の仕様で上書きしない。                                                                                  |
| ADR-09 | SHOULD | Alternatives Consideredには実際に比較した候補だけを書く。不採用理由の記録がなければ未確認とし、比較を創作しない。任意節を埋めるための案を作らない。                                                             |
| ADR-10 | SHOULD | おおむね1ページで、後から読む人が選択理由と代償を追える長さにする。複数の独立した判断は分割し、既存IDとファイル名を付け直さず新番号を追加する。                                                                 |

## 状態・日付と更新

- `Proposed`：未採用、判断根拠未確認、または採用・実装の一致をまだ確認していない。
- `Accepted`：オーナーが明確に採用した根拠があり、方針に実装が一致している。実装に先行して採用を明示した場合は、その承認と実装・配備が未完了であることをReferencesに記し、採用と実装完了を区別する。
- `Deprecated`：利用をやめた判断。理由と影響を残す。
- `Superseded by ADR NNNN`：判断全体を後継へ置き換えた記録。後継へのリンクをSupersessionに置く。未採用の旧案を別案に差し替えた場合は、後継もProposedであることを併記し、採用と混同しない。

`date`は確認できる決定日。提案中または決定日が不明なら最初の記録日を使い、その意味をReferencesまたはConsequencesで説明する。書き直し日を過去の決定日に見せない。確認日はReferencesに書く。

新規作成・変更時は、一次資料とコードを照合し、通常のPRでレビューする。採用の承認と実装の確認後に状態を更新する。既存方式を変えるときは新ADRを作り、元ADRに変更範囲と後継を示す。独立した判断であれば関連として残し、元の採用範囲を消さない。

過去セッションは日付・エージェント・セッションID・本人が承認した範囲をReferencesに残す。個人のローカルパスや会話全文は配布せず、判断の事実だけを記す。AIが本人名義で投稿したIssue/PRもあるため、投稿者名やマージだけで本人の元発言とみなさない。私有記録に依存する場合も、第三者が照合できるIssue/PRとコードを併記する。

外した実装詳細は、既存の仕様・運用文書を先に探し、そこから辿れるPRの詳細と対応づける。既存文書にも元PRにもない必要な詳細は用途に合う文書へ移してから削る。今回の書き直しでは、元ADRの固定コミットへのリンクもReferencesに残し、情報が辿れなくなることを避けた。

## 一覧

2026-11-03の照合で、従来の「採用」表記を根拠から再評価した。Proposedは現在の実装を否定する状態ではなく、記録された技術判断をオーナーの採用済み方針として扱えるかを示す。特に0001〜0005・0012〜0013・0024は以前の採用表記だけを根拠にAcceptedを引き継いでいない。

| ADR                                              | 判断                                                             | 状態                   |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------- |
| [0001](0001-cloudflare-room-authority.md)        | Cloudflare構成でRoomDOを共有状態の権威にする                     | Proposed               |
| [0002](0002-feature-boundaries.md)               | 機能単位で分割し公開境界を持つ                                   | Proposed               |
| [0003](0003-feature-bands.md)                    | feature内部を依存方向の5帯にする                                 | Proposed               |
| [0004](0004-custom-board.md)                     | 付箋ボードを自前で実装する                                       | Proposed               |
| [0005](0005-shared-skills.md)                    | 共有スキルの正本を .agents/skills に統一する                     | Proposed               |
| [0006](0006-move-transactions.md)                | 共有付箋の移動をRoomDOのtransactionとして確定する                | Proposed               |
| [0007](0007-room-creation-retries.md)            | ルーム作成要求を削除後も保持する                                 | Superseded by ADR 0008 |
| [0008](0008-room-creation-expiry.md)             | 作成受付と回復情報の寿命を分ける                                 | Proposed               |
| [0009](0009-websocket-session-expiry.md)         | WebSocketにも署名検証済みセッション期限を適用する                | Proposed               |
| [0010](0010-room-entry-authentication.md)        | 入室前だけ認証を準備し、元操作を一度引き継ぐ                     | Accepted               |
| [0011](0011-pr-preview-identity.md)              | PR PreviewをAccess本人ログインと共通APIで動かす                  | Superseded by ADR 0012 |
| [0012](0012-pr-preview-full-stack.md)            | PR Previewの画面・API・保存先をPRごとに分ける                    | Proposed               |
| [0013](0013-pr-preview-migration-reset.md)       | PR Previewはmigration変更時に保存先を作り直す                    | Proposed               |
| [0014](0014-account-display-name.md)             | 認証名から独立した共通の表示名                                   | Accepted               |
| [0015](0015-account-room-participation.md)       | アカウント単位でルーム参加の切り替えを管理する                   | Proposed               |
| [0016](0016-account-participation-index.md)      | 参加候補を索引化し、WS操作から全ルーム照合を外す                 | Proposed               |
| [0017](0017-move-current-groups.md)              | 付箋移動はドロップ時の分類から確定する                           | Proposed               |
| [0018](0018-websocket-message-order.md)          | 同じ接続のWS操作を受信順に処理する                               | Proposed               |
| [0019](0019-queue-local-note-moves.md)           | 保存待ちの共有付箋移動をローカルで受け付ける                     | Proposed               |
| [0020](0020-sprint-review-day-policy.md)         | Sprintのreview日を含む割当期間をversionで区別する                | Proposed               |
| [0021](0021-guest-session-identity.md)           | ゲスト本人を署名付きCookieで保持する                             | Proposed               |
| [0022](0022-guest-session-refresh.md)            | ゲストは入室前に同じ本人のCookieを更新する                       | Proposed               |
| [0023](0023-guest-google-link-same-identity.md)  | ゲストの本人IDへGoogleを後付けで連携する                         | Proposed               |
| [0024](0024-pbi-shared-manual-order.md)          | PBIの優先順をProjectの共通手動順で管理する                       | Proposed               |
| [0025](0025-room-without-host.md)                | ルームにホストを置かず、退出を本人だけの操作にする               | Accepted               |
| [0026](0026-account-session-refresh-on-entry.md) | Googleの本人も入室時にCookieを自動で更新する                     | Accepted               |
| [0027](0027-color-tokens-and-lint.md)            | 色と角丸はDESIGN.mdの名前で書き、直書きはBiome公式ルールで止める | Proposed               |

根拠未確認：0001〜0009、0011〜0013、0015〜0024、0027。0007と0011は後継に置き換えた旧提案として残す。0010と0014は本人の要求・承認と実装を照合できた。0025・0026は2026-11-03にオーナーが明示的に採用した最新方針としてAcceptedとし、実装に先行する決定であることをReferencesに明記する。実装への追従確認は別に行う。

## 検証

`npm run check:adr`でfrontmatter、日付、必須節、本文中のIssue/PR番号、索引の状態、後継、相対リンクを検査する。負例を含む検査自体のテストは`npx vitest run --config docs/adr/vitest.config.mts`。CIでも同じコマンドを実行する。

`npx prettier --check docs`と`git diff --check`で整形を確認する。機械検査は根拠の正しさ、本人の採用承認、文中の意味、外部URLの到達性を保証しない。これらはReferencesとコードを読み合わせる。

## References

- [ADRの記載基準を整備した事例](https://zenn.dev/tokium_dev/articles/adr-authoring-guideline)（2026-11-03確認）。本文の責務と、根拠を辿れる書き方の参考にした。
- [GDSのADR方針](https://gds-way.digital.cabinet-office.gov.uk/standards/architecture-decisions.html)。
- [文書の整理基準](../README.md#作る統合する残す基準)。
