# Idea Boost キャンバス操作監査

## 基準と検証範囲

- 調査基準: 2026-10-04、`develop` = `ad244effde34662fbeedd83813aa3a0dbe7fd82a`。`git fetch origin develop` 後の `git archive` を静的監査。
- \#503 / #505 / #506 / #508 はマージ済み。#491 は **closed / unmerged**。PR本文の「承認待ち」「Draftを維持」は最新状態を表していない。
- [#491のclose理由](https://github.com/engineer-first/idea-boost/pull/491#issuecomment-5975846855): ツールバー導入によって導線・操作仕様が変わり得るため、現時点では取り込まない。
- 本監査では実装・テストソースを読み、製品コード・GitHub Issue/PRは変更していない。列挙したテストは存在する検証観点であり、この監査での実行成功を意味しない。実画面の検証は別途のVisual Spec作業と区別する。

## 先に決めるべきこと

1. 現行は空白ドラッグがパン、#284は選択ツール初期＋空白矩形選択、#484/#491はグループ内空白が一括移動。**同じ空白ドラッグに異なる意味があるため、active tool × hit target × modifier × editing focusの優先表が必要。**
2. 一時的な複数選択と、共有の意味的なグループは別物。#284の選択判定は矩形が付箋に触れる、#491はグループ枠に付箋の中心が入る。対象集合の決定規則を混ぜない。
3. 現行private→sharedは **ボードに入った瞬間にpublish**、shared→privateは **dockでpointerup時にunpublish**。drop確定前まで非公開とするなら明示的な挙動変更になる。
4. Escapeは一律の取消ではない。付箋本文は保存して編集終了、グループ名は元へ戻す、通常選択/採用/stamp modeは解除。現行active note drag/vote dragへのEscape取消配線は見当たらない。
5. 投票中の付箋固定、採用前の候補外を含む全員移動、ホストだけ候補整理、確定後凍結は#455で確定済み。ツール導入を理由に再解釈しない。

## 現行の操作骨格

- 1枚の選択IDは本人画面のlocal state。movable・通常共有付箋のクリックは、別途`note:bring-to-front`を送り、重なり順を全員へ保存共有する。選択そのものと前面化は別の操作として扱う。
- 未選択の付箋はpointerdownで選択。4px以上動けば移動。選択済み付箋の静止クリック、Enter、文字キーで本文編集。文字キーは本文末尾へ追加。IME確定、blur、Escapeの保存境界あり。
- 現行の下部HUDは「編集/移動/削除」の可否表示・文字サイズ・ズーム。選択/手/ペンツールバーはない。
- キャンバスは空白左ドラッグ、Space＋左ドラッグ、中ボタンでパン。Space/middleはcaptureフェーズで通常付箋操作より先に処理。ただし採用対象overlayはそのcapture処理を通さない。編集欄keydownはカメラ用Space処理から除外。
- wheelはパン、Ctrl/Meta＋wheelはpointer中心zoom。Shift＋vertical wheelは現行コードでX/Y両方を変える。表示倍率は1〜400%、＋/−は1.25倍刻み、100%復帰とHUD安全域を含む全体fit。矢印/PageUp/PageDownは表示HUDにfocusがある時だけカメラ移動。
- マイ付箋の追加/削除はStep1、本文編集はStep1/2、共有/戻すはStep2のみ。Step2共有本文は作者以外も編集可能。#505のラベル「自分だけに見える付箋エリア」とdrag-only共有/戻すを保持。
- 1-3の近接グループはrectのX/Y隙間が各60px以内の連結成分。表示枠は移動中も再計算、永続所属はdrag:end（または直接moveの変更時）に1-3だけ再編成。近接に伴う表示上のcombined枠と永続groupIdも同一ではない。
- 投票は主観1・客観3。パレットdrag、種類選択→付箋click、付箋focus後Enter/Space。本人シールはdrag付替え、click取消、paletteへdrop取消。無効位置dropで票を失わない。送信待ちと確定した使い切りを区別する。
- 2軸評価は固定の横=実現可能性、縦=価値。左下0/0、右上100/100。3-2・3-3・採用前3-5で移動、3-4は表示のみ。マップの広さは3-2/3-3でホストが共有変更、個人zoomと別。軸の編集/入替は見当たらない。
- 右click/Shift+F10は候補外/復帰の補助メニュー。汎用キャンバスcontext menuではない。Undoは候補除外操作の復帰で、移動・本文・削除を横断する汎用Undo/Redoは見当たらない。
- タッチの付箋ドラッグ、tap候補操作、pointer ID混線防止はある。2本指pinch専用実装、keyboard note nudge、keyboard-only共有/戻す、ペン描画は未実装/根拠なしとして分ける。

## 文書/コードの食い違い

| 項目             | 調査結果                                                                              | 扱い                                                           |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| #210削除キー     | closed IssueはBackspace丸ごと削除禁止。現行NoteCardとテストはBackspace/Deleteとも削除 | 歴史要求と現行の矛盾。直ちに製品バグと断定せず意図を確定       |
| ホストと作成者   | sprint-flow:71は同一視、同:105とCONTEXTは移譲で分離                                   | 新しい現在ホスト定義を使用、古い本文の訂正候補                 |
| 結果での移動     | use-room-board-interactions:157のコメントは操作禁止、権限overrideと#455は採用前可     | コード/テスト/確定仕様が優先。古いコメントを仕様へコピーしない |
| 機能表の共有D\&D | 私有公開と共有位置変更が同じ列。所有者・工程・commit境界が異なる                      | machine indexではpublish/unpublish/moveを分ける                |
| 操作可否HUD      | phaseだけで○×、選択noteの可視性/所有者/通信状態を考慮しない                           | 実際の権限モデルの代用にしない                                 |
| WS gate文書      | sprint-flow:171-174がDiscussion#36を正本として残す                                    | repo側canonical方針と照合、Discussionは過去根拠へ              |
| autosave/復旧    | 実装には本文CAS/ACK照会/IME/sessionStorage recoveryあり、進行仕様で詳細不足           | canonicalの状態/失敗欄へ移す。server audit補足参照             |

## Issueの分担

- \#283: ペン/複数選択の試作を人が操作し、仕様と実装Issueを確定する調査。静止図やAIのクリック確認だけでは完了しない。
- \#284: 選択/手ツール・矩形・Shift選択・相対一括移動。評価map/private/移動不可の扱いは試作結果待ち。一括削除/一括group化は対象外。
- \#484: group内空白ドラッグの仕様整理のみ。#491はその未採用実装資料。再開/復活や既定採用を自動でしない。
- \#455: 既存の単一選択・候補移動/除外/復帰・失敗/Undoの確定仕様。#284/#285を明確に除外している。
- \#285: ステップ移行時の通常board自動配置、採否自体が未定。評価座標は自動移動しない。
- \#297: 評価mapの重なり可読性検証。評価値を変えない前提。

## 正本の置き方

`docs/product/canvas-interactions.md`をPRD・docs/README・sprint-flowから参照する。進行/時間/工程目的はsprint-flow、操作入力/状態/中断/権限の詳細はcanvas specに責務を分け、同じ規則を全文複製しない。安定IDを付け、FigJamにはID・status・commit/source link・代表シナリオを表示する。機械可読indexはMarkdownから生成するか、full JSONを選ぶならどちらがauthorityか1つに決める。draftのJSONを実行時の第二認可表にはしない。RoomDOが権限と共有状態の真実を持ち、contractsは境界形だけを持つ。

`CONTEXT.md`は選択/グループ/候補/個人カメラ/評価位置/現在ホストの語彙を整理する場所。操作マトリクスや実装詳細を入れない。ADRは既存0004を参照し、不可逆に近い重要なトレードオフだけに使う。

## 添付データ

- [current-inventory.json](current-inventory.json): current/proposedを分けた36操作、14工程、入力優先、相違点、source anchors。
- 操作IDごとの固定commitソースURLはcurrent-inventory.jsonの各sourceに含む。
- RoomDO制約、ロック、復旧、Undo、認可の追加監査（16項目）はcurrent-inventory.jsonにも収録。
