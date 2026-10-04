# ドラッグ応答性・移動Undo監査

## 結論

1. #364後の「つかみ始めが遅い」という体験報告は重要。新仕様のリリース条件に応答性回帰検査を置く。ただし「private領域の計算が原因」とは、まだ実測で確定していない。
2. 現行共有付箋には、drag開始ACKまでローカル座標を動かさない経路が確実にある。この待ち方は#364以前から存在するため、#364が新設した回帰原因とは言えない。
3. #364でprivate/returning previewの描画時DOM測定、FLIP、auto-scroll等の仕事が増えた。静的な調査候補は特定したが、どれが実ユーザーの遅延を支配するかはbrowser traceが必要。
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

| 変更 | コード上の事実 | 性能に関する読み方 |
| --- | --- | --- |
| shared drag開始のcard rect測定 | 1回のgetBoundingClientRect追加 | stale layoutなら同期layoutが必要になる可能性。1回測ったことだけで重いとは断定不可 |
| private/returning preview | pointer座標・offset・sizeをstateに保持、portal表示、render中toolbar/list矩形read | render/layoutの追加経路。browser traceの有力観察点 |
| FLIP | private順序keyが変わった時だけlist全件readと160msのtransform animation | 160msのdrag開始待機ではない。毎pointermoveの再アニメーションを意図しておらず、順序不変ではeffect不発 |
| auto-scroll | rAFでscrollTopを変更後、挿入indexのためcard矩形を再read | write→read経路が追加。レイアウト/スクロール起因コストは計測必要 |
| drop pending表示 | unpublish応答前もboardから隠す、private順序・placeholderを楽観表示 | 応答待ちの再出現を防ぐ。失敗/再接続時の収束は性能と別に検証 |
| private順序保存 | unpublishにprivateIndex追加、private noteのstackOrderを再採番 | サーバー仕事はdrop時。通常shared dragのつかみ始め原因には直結しない |

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

## 3. 応答性の規範と受け入れ条件案

これは未実装の目標であり、測定済みの現状値ではない。

### 軽量な構成

1. pointerdownでは対象・pointer ID・起点・cameraを記録。4px閾値を維持し、不要な長押し待ちを加えない。
2. 閾値を越えたら次の描画frameを目標に本人previewを追従。server ACK、publish、並べ替えanimation完了を表示開始条件にしない。
3. latest pointerはrefに置き、表示更新は最大1回/frameへ合流。ローカルpreviewと共有配信のthrottleを分離。previewのtransform更新を優先し、静的な全board tree再renderを避ける。
4. geometryはdirty時にreadをまとめる。cached tray/list boundsとitem midpointsで判定し、read→write→readの反復を避ける。1枚のrect read自体を一律禁止する必要はない。
5. invalidationはviewport/window resize、visual viewport変化、pan/zoom、panel開閉・layout移動、tray scroll、note追加/削除/順序変更、本文/font/高さ変化。cache更新漏れでdrop領域が古くなることもバグとする。
6. 自動scrollはscroll更新と計測をframe単位に分けるか、既知scroll差分でcached midpointを補正する。毎frameの全card再計測・全pair groupingを前提にしない。
7. 未受理previewは「保存済み／共有済み」と表示しない。lock拒否はserver確定状態へ戻し、理由を短く提示。drop-publish前はprivate本文・previewを他者へ送らない。
8. 競合/phase変更を軽量化のために省略しない。最終認可・永続化・履歴はRoomDOで検証。

### 測定と合否

- 同一browser/device/refresh-rate/viewport/zoom/seed・production相当buildで、#364 base/head、現行、変更候補を比較。private 0/少数/多数、shared 1/実運用上限、tray開/閉、board中央/境界、通常board/評価map、単一/複数を分ける。枚数と試行数は測定記録に残す。
- pointerdown、threshold crossing、first presented translated frame、lock request/ACK、drop、server commit/ACKを区別する。p50/p95、frame gap、main-thread long task、style/layout/paint時間・強制layoutのcall stackを保存する。screenshot assertionだけを速度検査と呼ばない。
- 第一目標: 有効な対象はthreshold crossingの次frameからpreviewが追従。明示的な追加待機やnetwork ACKがcritical pathにないこと。
- 遅延ACK/拒否ACKを注入してもpreviewの開始時点が変わらず、拒否後の収束が正しいこと。ネットワーク遅延値はテスト条件であり製品の実測値ではない。
- 連続move中に実装由来の50ms超main-thread taskを作らないことを候補gateとし、低性能端末・大量noteで確認。60Hzでは約16.7ms/frame、120Hzでは約8.3ms/frameの予算が異なるので、無条件の「16msならよい」にしない。
- 基準値が取れるまでは「高速化済み」「回帰なし」と判定しない。許容p95差分・端末・最大note数を決めてから数値gateを固定する。
- [Chrome teamのlayout/forced synchronous layoutの説明](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)も、readをまとめてからwriteし、実traceでボトルネックを確認する方針を支持する。

## 4. 現在のUndo相当と不足

| 操作 | 現行 | 汎用Undoとしての扱い |
| --- | --- | --- |
| 候補外→復帰 | 既存の個別/一括復帰。成功通知後だけUndo。個別はexclusion operation ID、bulkは対象のoperation IDで後続除外を巻き戻さない | domain commandとして維持。移動履歴と混ぜない |
| 採用取消 | 現在hostが結果工程でdecision:clear、対象note ID検証 | 正式な意思決定を取り消す明示操作。Ctrl+Zに黙って統合しない |
| 投票取消/付替え | 本人sticker ID単位のadd/move/remove、quota/工程/所有権検証、楽観失敗補償 | 既存投票操作。汎用履歴や他人票の復元ではない |
| 付箋削除 | note/appearance/bulk exclusion等を削除、vote削除、group再編成。復元用tombstone契約なし | delete Undoは新規設計が必要。作り直しは同一ID/関連状態の復元とは異なる |
| 本文 | autosave/IME/競合回復あり。editor中のnative Undoとboard履歴は別 | v1移動履歴へ混ぜない |
| private並べ替え | クライアントprivateOrder。sharedから戻す際だけprivateIndexがserverへ届く | 永続履歴としての前提がなく、v1から外す |
| 移動 | drag IDとactive lockはあるが、汎用Undo/Redo stack/commandなし | 新規追加 |

ソース:
- [candidate成功通知・同一operation検証](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-candidate-operations.ts#L97-L219)、[host復帰認可](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L622-L730)
- [candidate履歴の寿命・host世代](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/containers/room-board.tsx#L102-L143)、[snapshot/phase/decisionで終了](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/room/logic/use-candidate-operations.ts#L157-L166)
- [採用取消](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/decision-handlers.ts#L59-L83)
- [本人vote取消](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L1014-L1043)
- [削除](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/note-handlers.ts#L733-L757)、[DB削除](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/notes.ts#L510-L514)
- [native editor/IME境界](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/features/notes/molecules/note-card.tsx#L993-L1016)

## 5. 移動Undo v1の最小安全契約

### 履歴単位・対象

- 本人タブ/同room/同phase訪問に限定した成功確認済みの移動を履歴にする。drag=1 transaction、複数選択のmoveも1 transaction。pointermove packetごとに履歴を積まない。
- no-op、未送信preview、拒否された操作は履歴なし。部分ACKを成功した複数移動として登録しない。
- 履歴はoperation ID、actor/session、対象ID、開始/終了位置、位置revision、visibility revision、phase/権限世代、必要なgroup差分を持つ。RoomDOが履歴対象と現在状態を検証する。
- 全note snapshotを保存→丸戻しせず、位置fieldと必要な副作用だけ逆操作。別人の本文/font/voteは保持する。updatedAtは投票/fontにも進むので位置競合判定の唯一根拠にしない。位置revisionにはABA（他者が動かして同じ座標へ戻す）も検知させる。
- 他者の位置変更・削除・非公開化・lock競合・関連group変更なら、対象全体を拒否し説明。1回のキー入力で勝手に別の古い履歴へ飛ばない。
- 成功したUndoでのみRedoへ移し、成功したRedoでのみUndoへ戻す。redo時も現在のrevision/認可を検証。別の新規local mutationでRedoを無効化。remoteは影響範囲の履歴だけを無効化する。

### groupと重なり順

- 1-3のmove終了はautoReorganizeし、2枚未満になったgroupを消し、分裂時に新IDを作り得る。[group再編成](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/contracts/grouping.ts#L104-L182)、[保存と削除配信](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/groups.ts#L45-L119)。
- 位置だけ逆にしても消えた名前/ID/所属は復元できない。移動の副作用を同じserver transactionで安全に復元するか、その契約まで1-3のUndoを明示的に対象外にする。
- 現行moveはstackOrderも進める。[324-352](https://github.com/engineer-first/idea-boost/blob/ad244effde34662fbeedd83813aa3a0dbe7fd82a/workers/room/notes.ts#L324-L352)。v1位置Undoでは最新stackOrderを保持する案が最小。重なり順まで戻すならそれもtransaction/CAS対象として明示する。通常note:moveの逆送は自動前面化を再実行するため無条件流用しない。

### 入力優先・見せ方

- Ctrl/⌘+Z=移動Undo、Ctrl/⌘+Shift+Z=Redo。UIのtooltip/accessible nameで次の操作種別と枚数を表示。対象がない時は無効状態と理由を示す。
- input/textarea/contenteditable、IME composition中はnative/editorのUndoへ完全に委ねる。native履歴が空でもcanvas Undoへfallthroughしない。
- drag中のキーはdragの停止/preview解除を先に扱い、同じキーで過去履歴まで戻さない。現在serverへ保存済みの中間位置は、取消契約か最終確定位置に従って扱いを明記する。
- 1要求pending中の連打を直列化/無効化。timeoutや未受信ACKを成功扱いしない。処理結果不明は同operation IDで照会・解決し、逆操作を重複させない。

### phase・権限・寿命

- Undo/Redoも現時点のphase・在籍・可視性・host世代・lock・採用確定/room完了を再検証。以前できたという事実は現在の許可ではない。
- phase訪問が変わる、採用確定、room完了、再読込、切断後snapshot再同期でv1履歴を終了。host移譲でも他人の履歴は引き継がない。権限依存の履歴は旧host revisionを保持して無効化する。
- connection未openでは送信しない。Undoの表示を戻しただけでserver成功を装わない。永続履歴・複数タブ横断・再接続後の履歴復旧は別設計。
- 共有/非共有化をv1Undoへ含めない。既に他人が見た情報は非公開化しても「見なかったこと」に戻せない。公開後は作者・工程条件を満たすunpublishを明示的な別操作にする。
- phase/採用/投票/host/共有/削除/本文/色/文字サイズ/private順序/mapサイズは初回の移動履歴から除外し、既存専用操作を保つ。「すべて元に戻せる」と広告しない。

### 必須シナリオ

1. 3枚の相対move→Undo1回で3枚の位置同時復帰→Redo1回で同時復帰。
2. 1枚でも他者が後から位置変更/削除/lock→全transactionが0枚適用で拒否。
3. 他者が本文だけ編集→移動Undoで本文は維持。
4. 1-3でgroup消滅/分裂→名前/ID/所属含む安全な復帰、または0件拒否。
5. drop ACK不明→再接続で位置確定、同一Undoを二重適用しない。
6. IME中/native editor Ctrl+Z→boardは動かない。
7. 採用確定/phase変更/host移譲直後に旧callback送信→serverでも拒否。
8. publish前Escape→他者がprivate内容を一度も受信しない。publish後Undoはprivacy回復を装わない。

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
