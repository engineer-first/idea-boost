# ドラッグ応答性・移動Undo監査

## 結論

1. \#364後の「つかみ始めが遅い」という体験報告は重要。新仕様のリリース条件に応答性回帰検査を置く。ただし「private領域の計算が原因」とは、まだ実測で確定していない。
2. 現行共有付箋には、drag開始ACKまでローカル座標を動かさない経路が確実にある。この待ち方は#364以前から存在するため、#364が新設した回帰原因とは言えない。
3. \#364でprivate/returning previewの描画時DOM測定、FLIP、auto-scroll等の仕事が増えた。静的な調査候補は特定したが、どれが実ユーザーの遅延を支配するかはbrowser traceが必要。
4. private→sharedはdrop確定まで本人previewのみとする変更に賛成。移動表示を先に始め、認可・共有確定・履歴作成を別段階にする。
5. Undoは移動から段階導入し、UI名も「移動を元に戻す／やり直す」とする。汎用snapshot復元は避ける。1-3では移動がgroup ID・名前・所属を変えるため、座標だけの逆送では正しいUndoにならない。

## 調査基準・実行結果

- 現行基準: develop ad244effde34662fbeedd83813aa3a0dbe7fd82a。
- PR: [#364 付箋のアニメーション追加](https://github.com/engineer-first/idea-boost/pull/364)。base 1ce8b5dc64f4d59e83a8748e2ac981b4b1fc9bdd、head 729eea7769b49c68e74b580b28b6fbd80ac8d5cf、merge b17a2602d8defd0bdc520059900b947445c59bf6。22ファイル、+1642/-201。2026-09-28マージ。
- 現行基準のgit archiveを隔離ディレクトリへ展開して既存Vitestを実行。use-room-notes 33、use-board-drag 41、use-room-board-interactions 19、private-notes-toolbar 19、note-card 85、use-candidate-operations 8、計6ファイル205テストがpass。
- 上記はjsdomの機能検査。実ブラウザのlayout、paint、pointer-to-frame latencyは測っていない。テスト実行時間を操作の応答時間として報告しない。
- [#364 headに対応するCI](https://github.com/engineer-first/idea-boost/actions/runs/36372048687)のlint/typecheck・unit/worker・browser・build・smokeの成功を確認。[browser job](https://github.com/engineer-first/idea-boost/actions/runs/36372048687/job/108770248704)のログは8ファイル122テストpass。これもドラッグ開始の性能SLOを満たした証拠ではない。
- 変更したのは本調査用ファイルのみ。アプリ本体、Issue、PR、Figmaの変更なし。

## 1. 入力→表示の現在の経路

### 1.1 押下と閾値

- pointerdownで選択・pointer capture、移動距離4 CSS px以上で親のdragへ移管。timer型のdrag activationはこの経路にない。NoteCard自体は#364変更対象外。
- [NoteCard:613-655](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/molecules/note-card.tsx#L613-L655)、[4px定数](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/contracts/board.ts#L98-L103)。
- drag-startへ渡されるのは閾値を越えたpointermoveのevent。したがって計測はpointerdown→threshold crossing（利用者が動かすまでの時間）と、crossing→最初の視覚追従を必ず分離する。

### 1.2 共有付箋のACK待ち

- startNoteDragでstatus=pendingにしてdrag:startを送信。moveNoteはlatestPositionを記録するが、status!=activeなら座標反映をreturnする。
- ACK後にactiveとなり、latestPositionをローカルに適用。その後の移動配信は80msでthrottleするがローカル更新とは分かれている。
- [現在start/move](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/logic/use-room-notes.ts#L649-L705)、[ACK反映](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/logic/use-room-notes.ts#L386-L443)、[80ms配信](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/logic/use-room-notes.ts#L191-L200)。
- [既存テスト:開始受理までは動かさない](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/logic/use-room-notes.spec.tsx#L156-L204)を今回実行してpass。
- [#364以前にも同じpending→active gate](https://github.com/engineer-first/idea-boost/blob/1ce8b5dc64f4d59e83a8748e2ac981b4b1fc9bdd/features/notes/logic/use-room-notes.ts#L617-L655)。これはネットワーク待ちが発生するコード上の証拠であり、#364で追加された回帰・今回の体感の唯一原因という証明ではない。
- RoomDO側は競合drag・使用済drag ID・rate limit等を確認してACKする。[認可とACK](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L441-L485)。ロックをなくして速度を稼ぐのでなく、ロック確定前の本人previewを独立させる。

### 1.3 private領域の現在の処理

- 毎pointermoveでtoolbar矩形を読み取って判定。shared/returning時はghostの寸法・つかみ位置から上下右へ判定を拡張する。privateから出る際はpointer自体がtoolbar外になったことを見る。
- この交差判定は定数時間の矩形演算で、全private付箋走査ではない。[273-303](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-board-drag.ts#L273-L303)。
- 挿入位置決定はcard要素を列挙し、そのmidpointまでgetBoundingClientRectを読む。最悪はprivate枚数に比例。この走査は#364以前にもある。[現在324-353](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-board-drag.ts#L324-L353)。
- private/returning previewではhookのrender中にtoolbarとscroll-areaの矩形を追加で読む。[204-253](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-room-board-interactions.ts#L204-L253)。これは#364で追加された。[PR head196-246](https://github.com/engineer-first/idea-boost/blob/729eea7769b49c68e74b580b28b6fbd80ac8d5cf/features/room/logic/use-room-board-interactions.ts#L196-L246)。
- private/returning ghostはportalでfixedのleft/topを更新する。transformだけを更新する構造ではない。[描画](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/organisms/room-board-canvas.tsx#L694-L715)。
- private→sharedは現在boardに入った瞬間publish。[632-641](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-board-drag.ts#L632-L641)。今回承認されたdrop-publishはここを変える新規挙動。
- shared→privateは#364でhover中unpublishからpointerup時へ変更済み。[戻しdrop](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-board-drag.ts#L674-L748)。

## 2. #364の増分と、断定してはいけないこと

| 変更                           | コード上の事実                                                                   | 性能に関する読み方                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| shared drag開始のcard rect測定 | 1回のgetBoundingClientRect追加                                                   | stale layoutなら同期layoutが必要になる可能性。1回測ったことだけで重いとは断定不可                    |
| private/returning preview      | pointer座標・offset・sizeをstateに保持、portal表示、render中toolbar/list矩形read | render/layoutの追加経路。browser traceの有力観察点                                                   |
| FLIP                           | private順序keyが変わった時だけlist全件readと160msのtransform animation           | 160msのdrag開始待機ではない。毎pointermoveの再アニメーションを意図しておらず、順序不変ではeffect不発 |
| auto-scroll                    | rAFでscrollTopを変更後、挿入indexのためcard矩形を再read                          | write→read経路が追加。レイアウト/スクロール起因コストは計測必要                                      |
| drop pending表示               | unpublish応答前もboardから隠す、private順序・placeholderを楽観表示               | 応答待ちの再出現を防ぐ。失敗/再接続時の収束は性能と別に検証                                          |
| private順序保存                | unpublishにprivateIndex追加、private noteのstackOrderを再採番                    | サーバー仕事はdrop時。通常shared dragのつかみ始め原因には直結しない                                  |

- [shared開始追加read](https://github.com/engineer-first/idea-boost/blob/729eea7769b49c68e74b580b28b6fbd80ac8d5cf/features/room/logic/use-board-drag.ts#L452-L480)
- [FLIP](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/organisms/private-notes-toolbar.tsx#L144-L194)
- [auto-scroll write/read](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-board-drag.ts#L385-L450)
- [drop順序更新](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/notes.ts#L252-L291)

その他、grouping以後のcanvas renderはcalculateRenderGroupsを呼び、calculateClustersが全pairを走査するO(n²)経路を持つ。これも#364の新規変更ではなく、note/drag state更新時の全体コスト候補として分ける。[render](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/organisms/room-board-canvas.tsx#L212-L219)、[pair走査](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/contracts/grouping.ts#L42-L67)。

### 重要な取消境界

- 現在drag:moveは毎回DB座標を更新する。[491-532](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L491-L532)。
- cancelNoteDragはローカルをinitial座標へ戻すが、serverへposition:nullを送る。[734-759](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/logic/use-room-notes.ts#L734-L759)。
- serverのposition:nullは、最後の受理済み座標を返すだけ。初期座標の復元コマンドではない。[535-586](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L535-L586)。
- したがってEscape/Ctrl+Zで「元位置へ完全復帰」を保証したい場合、before-image・操作ID・安全な逆操作が必要。ローカルpreview取消と既にserverへ保存した移動のUndoを混同しない。

## 3. 測定で確かめること

応答性の契約と暫定数値は[CI-PERF-001 / AT-032](../product/canvas-interactions/details.md#ci-perf-001)に集約する。実測済みの値ではない。同一端末・browser・refresh-rate・viewport・zoom・seed・production相当buildで、#364前後と現行・候補を比較し、private枚数/tray開閉/shared枚数/map/単一・複数を分ける。

pointerdown→閾値超過と、閾値超過→初回描画、lock要求/ACK、drop、commit/ACKを別々に測る。p50/p95、frame gap、long task、style/layout/paintと強制layoutのcall stackを記録する。ACK遅延/拒否注入でもpreview開始と収束を確認する。60Hzと120Hzのframe予算は異なる。baselineなしに「高速化済み」「回帰なし」と判定しない。[Chromeのlayout解説](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)はread→writeをまとめ、実traceで原因を確認する参考。

## 4. 現在のUndo相当と不足

| 操作            | 現行                                                                                                                    | 汎用Undoとしての扱い                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 候補外→復帰     | 既存の個別/一括復帰。成功通知後だけUndo。個別はexclusion operation ID、bulkは対象のoperation IDで後続除外を巻き戻さない | domain commandとして維持。移動履歴と混ぜない                           |
| 採用取消        | 現在hostが結果工程でdecision:clear、対象note ID検証                                                                     | 正式な意思決定を取り消す明示操作。Ctrl+Zに黙って統合しない             |
| 投票取消/付替え | 本人sticker ID単位のadd/move/remove、quota/工程/所有権検証、楽観失敗補償                                                | 既存投票操作。汎用履歴や他人票の復元ではない                           |
| 付箋削除        | note/appearance/bulk exclusion等を削除、vote削除、group再編成。復元用tombstone契約なし                                  | delete Undoは新規設計が必要。作り直しは同一ID/関連状態の復元とは異なる |
| 本文            | autosave/IME/競合回復あり。editor中のnative Undoとboard履歴は別                                                         | v1移動履歴へ混ぜない                                                   |
| private並べ替え | クライアントprivateOrder。sharedから戻す際だけprivateIndexがserverへ届く                                                | 永続履歴としての前提がなく、v1から外す                                 |
| 移動            | drag IDとactive lockはあるが、汎用Undo/Redo stack/commandなし                                                           | 新規追加                                                               |

ソース:

- [candidate成功通知・同一operation検証](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-candidate-operations.ts#L97-L219)、[host復帰認可](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L622-L730)
- [candidate履歴の寿命・host世代](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/containers/room-board.tsx#L102-L143)、[snapshot/phase/decisionで終了](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-candidate-operations.ts#L157-L166)
- [採用取消](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/decision-handlers.ts#L59-L83)
- [本人vote取消](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L1014-L1043)
- [削除](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L733-L757)、[DB削除](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/notes.ts#L510-L514)
- [native editor/IME境界](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/molecules/note-card.tsx#L993-L1016)

## 5. 移動Undoの設計先

[CI-HIST-001 / 002](../product/canvas-interactions/details.md#ci-hist-001)が履歴単位・現在権限・原子的逆操作・他者変更保護・pending照会・寿命の正本。特に1-3では位置だけ戻しても消えたgroup名/ID/所属を復元できない。[group再編成](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/contracts/grouping.ts#L104-L182)、[保存・削除配信](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/groups.ts#L45-L119)が根拠。現行moveの[stackOrder更新](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/notes.ts#L324-L352)も、通常move逆送をそのままUndoに使えない理由となる。新仕様のUndoは最新stackOrderを保持する。

## 6. FigJam / Miroから参照できる範囲

- [Miro公式Undo/Redo](https://help.miro.com/hc/en-us/articles/360017730793-Undo-Redo): 現sessionの本人操作のみ、30操作まで、refresh/reopenで履歴消失、Ctrl/⌘+ZとShift追加でRedo。本人履歴とsession境界は参考になるが、30という容量はIdea Boostにそのまま採用する根拠ではない。
- [Miro公式shortcuts](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys): Windows/MacのUndo/Redoキーを確認。
- [Figma公式Widget Undo/Redo](https://developers.figma.com/docs/widgets/undo-redo/): userごとのstack、shared scalarへの単純inverseは別userの後続値も上書きし得る例、user別mapの分離、commitUndoによるgroupingが示される。ただしwidgetはregular FigJam/Figma objectと挙動が異なると明記されている。通常FigJamの全履歴仕様の根拠に一般化しない。
- [Figma公式multiplayer設計記事](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/): Undo→Redoで他人の後続変更を失わない設計原則を説明する。過去の設計解説であり、現行FigJamの詳細保証として断言しない。
- [FigJam公式iPad](https://help.figma.com/hc/en-us/articles/4502073572247-FigJam-for-iPad): Undo/RedoのUIとgestureは確認できる。今回はdesktop canvasの仕様であり、iPad gestureを実装済みとしない。

## 優先度

- 高: previewを認可ACKから切り離す仕様と、drop-publishの非公開境界を先に固定。
- 高: 共有Undoの全snapshot復元、他者位置の上書き、multi部分適用、1-3 group名喪失をリリース阻害条件にする。
- 中: #364前後の実traceでgeometry/FLIP/全board再renderを切り分ける。計測前に原因を決め打ちしてprivate判定だけ最適化しない。
- 中: 現行機能テストへ性能・入力優先・再接続競合の検証を足す。既存CI greenを「遅延なし」の根拠にしない。
