# 瞬間的なドラッグの入力調査（2026-10-18）

対象は [PR #726](https://github.com/engineer-first/idea-boost/pull/726) の `75e1074`。保存待ち中の連続入力を受け付けても残った取りこぼしについて、再現条件と参照実装を残す。現行の契約は[操作仕様](../product/canvas-interactions/details.md)を参照する。

## 再現条件と見落とし

前回の実ブラウザ試験は、短い操作でも必ず1回の`pointermove`を送っていた。今回Chromiumのnative入力で押下と離す位置を変え、途中moveを送らない条件を追加すると、通信遅延なしでも移動要求が0件になった。選択済み付箋では本文編集にも変わった。動画で報告された現象の再現条件として扱い、利用者の実機が出したイベント列自体は未採取である。

NoteCardはmoveでのみ開始距離を判定しており、upでは移動距離を見ずクリックを確定していた。さらにマイ付箋への戻し候補もmoveでのみ更新していたため、最後のupで境界を越える入力を取りこぼしていた。

## tldrawで確認した考え方

参照版は `dd116535b138520d560c9881ad095ab782dc74c7`。本文は実装の比較であり、コードや依存の導入ではない。

| 一次資料                                                                                                                                                                                | 確認した点・今回への適用                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Editor.dispatch](https://github.com/tldraw/tldraw/blob/dd116535b138520d560c9881ad095ab782dc74c7/packages/editor/src/lib/editor/Editor.ts#L10933)                                       | move等を描画tickまで保留しても、up等では保留入力を順に処理する。操作終了を描画や通信の待ち時間に依存させない。                                                                     |
| [Translating.complete](https://github.com/tldraw/tldraw/blob/dd116535b138520d560c9881ad095ab782dc74c7/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts#L206)         | 最終位置を更新してからdropと終了を処理する。こちらもupの座標で共有境界・挿入位置を更新してから確定する。                                                                           |
| [PointingShape](https://github.com/tldraw/tldraw/blob/dd116535b138520d560c9881ad095ab782dc74c7/packages/tldraw/src/lib/tools/SelectTool/childStates/PointingShape.ts)                   | 押下・移動・編集を状態で分けている。こちらも距離を超えた操作をクリック編集へ回さず、クリックの小さな手ぶれは従来の閾値で区別する。                                                 |
| [tldraw sync](https://tldraw.dev/docs/sync) / [TLSyncClient](https://github.com/tldraw/tldraw/blob/dd116535b138520d560c9881ad095ab782dc74c7/packages/sync-core/src/lib/TLSyncClient.ts) | Cloudflare Durable Objectsでルームの共有状態を管理し、クライアントはローカル変更とサーバー結果を分けて扱う。今回の未送信の原因は入力側にあり、RoomDO・WS配信間隔の変更は必要ない。 |

upだけで距離を超える場合に開始する処理は、今回の再現から追加した補完である。tldrawのPointingShape自体が同じ補完をしているという意味ではない。こちらは位置・分類・Undoを1操作として確定する契約を維持する。

## 検証の範囲

- NoteCardのDOM試験で、moveなし・閾値内のmoveの後の遠いup・移動禁止時の編集防止を修正前に失敗させる。
- ボードhookで、upだけの開始、共有境界の最終更新、captureを取り直さない終了を検証する。
- 実RoomDOとChromiumで、通常move／moveなし／閾値内move、受信遅延0／250ms、通常ボード／評価mapを確認する。各16回の描画・保存、Undo/Redo、再読込後の位置を照合する。
- 1-2 / 2-2 / 3-2の実二者検証で、moveなしの共有・非共有化も確認する。既存の無効drop・Escape・パネル閉鎖・共有前の非配信の検査を維持する。

native入力の注入は人のトラックパッド操作そのものではない。macOS/Chromium以外、実機のイベント列は未確認。撮影資料と実行結果はPRの確認コメントに置く。
