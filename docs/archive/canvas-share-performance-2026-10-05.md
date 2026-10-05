# 共有・戻しの性能比較: 2026-10-05

[Issue #524](https://github.com/engineer-first/idea-boost/issues/524)と[AT-032](../product/canvas-interactions/details.md#ci-perf-001)の探索計測。60Hz実機入力・人の体感・リリース合否は未確認。50msは未合意の暫定目安であり、今回の値を正式な合否とは扱わない。

## 条件と再現

- Mac mini Mac16,10、Apple M4 10 cores、16GB、macOS 26.1。Chromium 153.0.8010.12、Playwright headless、1280×720。物理画面・mouse/trackpad入力の計測ではない。
- `#364前 1ce8b5d`、`#364後 b17a260`、現行 `d5edae6`、候補をgit archive相当の固定sourceへ分離した。Next 16.2.9のwebpack dev・共有した同じnode\_modules・実dev:verify/RoomDOで順次起動し、所有サーバーは毎回停止した。歴史版の起動管理だけ現行scriptを使い、プロダクト実装は変更しない。候補の本番変更ファイル集合のSHA256は`93d1424ab3aa7391184b0f104634999ea085a245839925c78876f2c0e7c7eae9`（traceにも記録）。
- 1-2のsnapshotを100枚へ増やす公開fixture注入: shared9/private91、長文30枚。DOには元の10枚だけが存在し、private1枚と本人shared1枚を操作する。100枚の保存/通信負荷は測っていない。
- privateはトレイ内、returningは共有付箋から始める。pointerdown後40ms保持、初回12pxで閾値を超え、returningはパネルhover→ボードへ戻す。Escape/upで終了し、次のdrag前にcameraを同じ位置へ調整する。掴み位置のhit IDを検査し、不正hitや対象消失を速度の成功として数えない。
- 閾値超過からrAFでゴースト出現/対象rect移動を初めて観測するまでを計測。GPUの描画完了やpointerdownからの全待ち時間ではない。downToPreviewをtraceへ別記した。
- 0/150/500msはstart/result ACKのアプリへの配送だけを遅らせる。ネットワーク全体のRTTではない。privateの未送信経路に遅延するACKは存在しない。pending結果の安全性は別の二者検証で確認した。
- getBoundingClientRect呼び出しは押下からupまでをカウントし、挿入位置・FLIP・auto-scrollを含む複合値とする。個別寄与を分離したCPU profileではない。auto-scrollの上下/外縁・順序は既存hook/DOMテストで保護し、開始速度と同じ指標にしない。

## #364前後・現行・候補: 100% / ACK遅延0ms

| 版               | 操作      | 件数 | 開始preview p95 ms | 1drag矩形read最大 | 開始区間の50ms以上long task |
| ---------------- | --------- | ---- | ------------------ | ----------------- | --------------------------- |
| #364後 `b17a260` | private   | 30   | 20.0               | 14                | 0                           |
| #364後 `b17a260` | returning | 30   | 84.5               | 383               | 0                           |
| 現行 `d5edae6`   | private   | 30   | 24.2               | 17                | 0                           |
| 現行 `d5edae6`   | returning | 30   | 25.5               | 657               | 0                           |
| 候補             | private   | 30   | 24.5               | 19                | 0                           |
| 候補             | returning | 30   | 21.6               | 573               | 0                           |

\#364前は同条件でprivateカードが`x=1428..1628`の画面外へ配置され、正しいhitで開始できなかった。0件の欠測として扱い、速度値を付けない。失敗画面はPRの画面資料へ添付する。歴史版ではEscape/戻しの挙動も異なるため、hover後ボードへ戻して共有状態を保った試行だけを比較した。#364以後には他の改善も含まれ、数値を#364単独の因果効果と解釈しない。

## 候補: 通常ボードのmatrix

| zoom | ACK配送遅延 ms | 操作      | 件数 | 開始preview p95 ms | 開始区間の50ms以上long task |
| ---- | -------------- | --------- | ---- | ------------------ | --------------------------- |
| 25%  | 0              | private   | 30   | 27.1               | 0                           |
| 25%  | 0              | returning | 30   | 21.3               | 0                           |
| 25%  | 150            | private   | 30   | 24.8               | 0                           |
| 25%  | 150            | returning | 30   | 21.8               | 0                           |
| 25%  | 500            | private   | 30   | 27.5               | 0                           |
| 25%  | 500            | returning | 30   | 22.2               | 0                           |
| 100% | 0              | private   | 30   | 24.5               | 0                           |
| 100% | 0              | returning | 30   | 21.6               | 0                           |
| 100% | 150            | private   | 30   | 20.9               | 0                           |
| 100% | 150            | returning | 30   | 21.7               | 0                           |
| 100% | 500            | private   | 30   | 26.1               | 0                           |
| 100% | 500            | returning | 30   | 23.1               | 0                           |
| 200% | 0              | private   | 30   | 22.8               | 0                           |
| 200% | 0              | returning | 30   | 23.1               | 0                           |
| 200% | 150            | private   | 30   | 27.4               | 0                           |
| 200% | 150            | returning | 30   | 21.5               | 0                           |
| 200% | 500            | private   | 30   | 27.9               | 0                           |
| 200% | 500            | returning | 30   | 22.7               | 0                           |

3-2マップの100%/ACK遅延0msで、private/returningを各30回確認した。private p95 27.9ms（30件） returning p95 26.8ms（30件）。マップの全zoom/ACK遅延matrixと歴史版比較は未実施。

## 負荷・制約・証跡

- after364: loadavg開始 58.4, 38.9, 24.0、終了 87.6, 47.2, 27.5（1/5/15分）。
- current: loadavg開始 21.2, 33.6, 33.1、終了 20.2, 32.2, 32.6（1/5/15分）。
- candidate: loadavg開始 30.5, 29.9, 31.3、終了 3.8, 12.7, 22.7（1/5/15分）。
- candidate-map: loadavg開始 4.1, 12.4, 22.4、終了 4.3, 11.7, 21.9（1/5/15分）。

同じMac上の別worktreeのunit/Worker検証や開発プロセスが並行しており、負荷を固定していない。数msの差を改善の因果証拠にせず、正式な50ms判定にも使わない。実装更新のHMRが混ざった途中の測定と不正hitの試行は採用せず、固定sourceで完了した試行を掲載した。

[sanitized trace](canvas-share-performance-2026-10-05.trace.json)は全pointerdown/閾値/初回観測・long task・矩形readと集計を持ち、本文・room/user ID・認証値・receiptを持たない。[再実行harness](canvas-share-performance-2026-10-05-harness.zip)は計測と二者デモ・fault injectionを含む。共有前hoverの非配信、Escape、drop初回配信、戻しhover/取消/drop、ACK喪失の照会は実RoomDOの別認証接続で確認し、PRへ動画を添付する。再接続のfault injectionは実WebSocketのcloseと合成close通知を併用した。

代表60Hz PC、Windows、日本語IME、実mouse/trackpad、負荷を揃えた本番build、性能値の合意、人による操作確認、#525履歴本体との統合は未確認。人の操作は依頼者がPR作成後に確認する。
