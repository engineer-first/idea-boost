# 共有付箋の移動: 2026-10-04の性能比較

[Issue #523](https://github.com/engineer-first/idea-boost/issues/523)・[親 #521](https://github.com/engineer-first/idea-boost/issues/521)・[AT-032](../product/canvas-interactions/details.md#ci-perf-001)の探索baseline。実機の入力・人による操作観察・リリース合否は未確認。暫定50msを合意済みの合否値として扱わない。

## 条件と再現方法

- 端末: Mac mini Mac16,10、Apple M4 10 cores、16GB、macOS26.1。Chromium 153.0.8010.12、Playwright headless、1280×720。60Hz物理画面・mouse/trackpad入力の計測ではない。
- 変更前: develop df53887。変更後: a70f1106f60164d315e1955ea28cdc3d5aaa643a。別worktreeの同じdev:verifyでOwner、1-2と3-3を毎case新規作成。
- 単一の表示負荷: snapshotの共有付箋を100枚に増やす公開ダミー。3枚ごとに長文、元の付箋と同じ座標に重ねる。移動対象は実DOに存在する元付箋1枚。通常1-2では別枠の本人private1枚も保持する。100枚のDO保存負荷や均等配置の再現ではない。
- 集合の表示負荷: Room/RoomBoardCanvasのTransactionMove100Notes・TransactionMove100MapNotes。100枚の格子配置、10枚ごとに長文、先頭3枚を固定集合として本番hookで移動。選択入口は#522未統合。fake transportはstart ACKだけ0/150/500ms遅延、commitは同期応答。DO性能の証拠にはしない。
- 単一の通信: room WebSocket全outboundをRTT/2、start/commit resultをさらにRTT/2遅らせ、FIFOを保持。HMRとHTTP、その他のbroadcastは遅らせない。全ネットワークのRTTエミュレーションではない。初回のstart-only遅延runは順序を崩したため破棄した。
- 集合mapの200%では付箋中央下部が幅調整ツールへ重なるため左下を掴む。hit ID検査で止まった試行はdrag開始前で計測せず、同じsource commitの完了済み15条件を保持して残り3条件を再開した。
- 各通常/map×zoom25/100/200%×遅延0/150/500msで30drag。pointerdown後40ms保持、最初のmoveで12px、10ms後に24px。往復を交互に行う。正常な確定を確認し、失敗操作を速度の成功として数えない。
- 入力閾値4px超過から、rAFでnote rectの移動を初めて観測するまでを計測。描画完了のGPU traceではない。pointerdownからの40ms保持を含む利用者待ち時間はraw traceのdownToPreviewへ別記。変更前は閾値イベントから次入力までの待ちも含む。
- 単一はNext dev、集合はbuild済みStorybook。同一Mac上の他セッションとバックグラウンド負荷あり。通常の開発負荷を固定していないので数msの差や正式な50ms判定には使わない。測定中に観測したloadavgはbefore約9.6/11.9/15.6、after開始22.2/13.6/11.0、終了12.1/14.1/12.4（1/5/15分）。負荷を揃えた値ではない。

## 単一移動: 開始preview p95 (ms)

| 表面 | zoom | 注入RTT ms | 変更前 | 変更後 |
| ---- | ---- | ---------- | ------ | ------ |
| 通常 | 25%  | 0          | 87.6   | 23.0   |
| 通常 | 25%  | 150        | 196.1  | 22.6   |
| 通常 | 25%  | 500        | 546.9  | 25.2   |
| 通常 | 100% | 0          | 96.2   | 34.1   |
| 通常 | 100% | 150        | 189.1  | 27.2   |
| 通常 | 100% | 500        | 548.4  | 21.8   |
| 通常 | 200% | 0          | 71.7   | 34.4   |
| 通常 | 200% | 150        | 173.8  | 29.6   |
| 通常 | 200% | 500        | 544.0  | 21.3   |
| map  | 25%  | 0          | 98.1   | 29.1   |
| map  | 25%  | 150        | 175.7  | 23.9   |
| map  | 25%  | 500        | 545.1  | 27.4   |
| map  | 100% | 0          | 102.1  | 26.8   |
| map  | 100% | 150        | 175.5  | 28.9   |
| map  | 100% | 500        | 542.6  | 22.1   |
| map  | 200% | 0          | 87.0   | 27.3   |
| map  | 200% | 150        | 188.1  | 28.6   |
| map  | 200% | 500        | 544.9  | 31.2   |

全caseは各30件。変更後のaccepted結果を各30件確認した。開始計測区間を含む各caseのmain-thread long taskもtraceへ記録する。

## 固定3枚集合: 開始preview p95 (ms)

旧版に集合操作がないため変更前の値はない。各dragで3枚の画面delta一致を確認する。

| 表面 | zoom | start ACK遅延 ms | 変更後 | 相対位置確認 |
| ---- | ---- | ---------------- | ------ | ------------ |
| 通常 | 25%  | 0                | 17.1   | 30/30        |
| 通常 | 25%  | 150              | 17.7   | 30/30        |
| 通常 | 25%  | 500              | 17.6   | 30/30        |
| 通常 | 100% | 0                | 17.7   | 30/30        |
| 通常 | 100% | 150              | 17.5   | 30/30        |
| 通常 | 100% | 500              | 17.9   | 30/30        |
| 通常 | 200% | 0                | 17.8   | 30/30        |
| 通常 | 200% | 150              | 17.4   | 30/30        |
| 通常 | 200% | 500              | 17.1   | 30/30        |
| map  | 25%  | 0                | 17.7   | 30/30        |
| map  | 25%  | 150              | 17.8   | 30/30        |
| map  | 25%  | 500              | 17.2   | 30/30        |
| map  | 100% | 0                | 17.3   | 30/30        |
| map  | 100% | 150              | 17.7   | 30/30        |
| map  | 100% | 500              | 17.0   | 30/30        |
| map  | 200% | 0                | 17.6   | 30/30        |
| map  | 200% | 150              | 17.1   | 30/30        |
| map  | 200% | 500              | 17.6   | 30/30        |

## 証跡と残る確認

[sanitized trace](canvas-move-performance-2026-10-04.trace.json)は全pointerdown/閾値/初回観測とlong taskを保存し、本文・user/room ID・認証値・receiptを含めない。[再実行用harness ZIP](canvas-move-performance-2026-10-04-harness.zip)は公開fixture・script・READMEだけを含む。PRには同じviewport・データ・入力・Ownerの変更前後動画と集合操作動画を添付する。集合mapの撮影だけは3枚の動きを判読できるよう非対象97枚を`visibility:hidden`にし、DOM・座標変換は保つ。性能traceは全100枚を表示して計測した。

\#522の実選択入口からの3枚移動、代表60Hz PC、Windows、実mouse/trackpad、日本語IME、人の開始体感と取消操作、安定した負荷・本番buildでの計測、50msと負荷条件のレビューは未完了。今回のheadless比較やStorybookをその代用として扱わない。
