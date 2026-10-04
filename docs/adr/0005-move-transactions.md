# 0005: 共有付箋の移動をRoomDOのtransactionとして確定する

- 状態：提案
- 決定日：未確定
- 記録日：2026-10-04

## 背景

単一dragの途中座標をその都度保存すると取消で戻せず、複数移動や分類副作用も部分確定する。ACK待ちで本人previewを始めると通信遅延が入力の応答性を決めてしまう。RoomDOのハイバネーションとhalf-open接続でも、確定結果とlockの所有を取り違えない必要がある。

## 候補と決定

旧single-dragのstreaming保存を複数枚へ拡張する方式は、全件取消とgroupの原子的確定を保証できないため採らない。クライアントpreviewを共有状態の真実にする方式も、工程・可視性・競合の認可をクライアントへ移してしまうため採らない。

本人previewは固定集合のローカルdeltaとして描画し、確定座標から分ける。RoomDOはSQLiteに操作ID、接続所有者、全対象lock、専用期待版、leaseと成功receiptを保存し、pointerupで位置・分類・receiptをtransactionSyncに含める。送信後は結果照会だけで復帰し、エラーへの即時再照会で応答ループを作らない。閉鎖後もmember本人には保存済み結果を返し、非memberまたは操作削除後には内容を含まないunknownを返してpendingを終端にする。新旧lockは相互に競合し、対応snapshotで新UIのtransaction経路を選ぶ。

## 影響と見直す条件

遅延したACKを待たず本人が操作でき、全対象と分類が成功か拒否のどちらかになる。位置と可視性の版は本文や投票から独立し、ABAも検知する。receiptは将来の安全な逆操作へ全影響対象の版とgroup前後を渡す。

peer previewは配信しない。旧clientの途中保存とprivate共有は互換経路に残るため、この保証を全操作へ拡張したとは扱わない。成功receiptは24時間で削り、ID墓標はルーム削除まで保持するため操作数に比例する小さい永続コストを持つ。長期ルームの操作数や保存量が問題になった場合は、操作IDの世代境界と保持期間を合わせて見直す。

## 根拠

[Issue #523](https://github.com/engineer-first/idea-boost/issues/523)、[親Issue #521](https://github.com/engineer-first/idea-boost/issues/521)、[操作仕様の移動transaction契約](../product/canvas-interactions/details.md#523の移動transaction契約)。選択入口は#522、drop-only共有は#524、Undo/Redo本体は#525の責務を維持する。
