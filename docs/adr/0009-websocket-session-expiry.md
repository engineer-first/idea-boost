# 0009: WebSocketにも署名検証済みセッション期限を適用する

- 状態：提案
- 決定日：未決定（PRでレビューする）
- 記録日：2026-10-09

## 背景

HTTPでは期限切れのJWTを拒否するが、期限前に開いたWebSocketは継続して操作・配信できた。
RoomDOはハイバネーションするため、接続時の認証結果をメモリだけに保持できない。
期限切れは退出ではなく、同じ本人の新しい有効な接続と確定済み本文を維持する必要がある。

## 候補と決定

署名検証済みclaimsの整数秒の`exp`を、発行用の本人情報とは別の`VerifiedSessionSchema`で保持する。
API WorkerがユーザーIDと同様に入力ヘッダーを上書きし、DOへ期限を引き継ぐ。
DOはupgradeの非同期処理の前後に期限を確認し、受理した接続のattachmentへ保存する。
受信と全送信の共通経路で`exp > floor(Date.now()/1000)`を要求し、等値も拒否する。
旧attachment・期限なし・不正値は認証専用close（4002）で再認証へ進める。

JWTの未検証decodeやクライアント申告期限は採用しない。DOの再起動後にも同じ拒否を保証するため、
期限をメモリキャッシュには置かない。無通信接続を時刻ちょうどに閉じるalarmも追加しない。
次の受信・送信時に閉じれば、期限後の操作と情報配信を拒否できる。

## 影響と見直す条件

一時所有権の解放は対象接続のattachmentと移動transaction・drag leaseに限定する。
close再到達に備えて先に所有権を取り除き、同じ本人の新接続・メンバーシップ・本文を消さない。
本人単位のカーソル通知は、同じ本人の別の有効接続がdrag中なら終了通知を送らず、その表示を維持する。
期限前の受信だけでは保存成功としない。本文digest等の待機後・mutation前にも期限と接続・在籍を再検査する。
進行・発表共有の非同期transactionはalarm待機後・commit前にも検査し、失効時は未確定の変更をrollbackした後にcloseする。
期限前に確定済みの保存は巻き戻さず、期限後のACKを抑止する。
期限前に永続確定済みの進行予約は、元接続の失効後も内部alarmで実行する。
結果不明の保存は既存のoperation IDによる照会・再送とrevision競合検査で回復する。

既存の長時間接続も次の通信で再認証が必要になる。作業継続のための期限更新は別途設計する。
セッションの途中失効や更新を導入するときは、署名済み期限だけで十分かを見直す。

## 根拠

- [Task #535](https://github.com/engineer-first/idea-boost/issues/535)
- [継続体験のPBI #557](https://github.com/engineer-first/idea-boost/issues/557)
- [更新方式のSpike #558](https://github.com/engineer-first/idea-boost/issues/558)
- [共有状態の権威](0001-cloudflare-room-authority.md)
