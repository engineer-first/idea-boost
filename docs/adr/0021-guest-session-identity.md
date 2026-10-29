# 0021: ゲスト本人を署名付きCookieで保持する

- 状態：提案
- 決定日：2026-10-28
- 記録日：2026-10-28

## 背景

利用の基本をゲストにし、Googleログインや「ゲストではじめる」の選択を挟まずに作成・参加できるようにする（[PBI #749](https://github.com/engineer-first/idea-boost/issues/749)）。
従来のセッションとユーザー行はメールアドレスを必須としていた。ゲストには仲間に表示する名前だけを入力してもらい、名前を本人確認に使わない。
ログイン操作をなくしても、本人証明・RoomDOの在籍・作成要求・入室チケット・成果の閲覧判定は維持する。再訪時の期限更新は #853、Google連携は #850 で扱う。

## 候補と決定

既存の署名付きHttpOnly Cookie（HS256 JWT）でゲストの本人IDを保持する。Cookie名・HttpOnly・本番Secure・SameSite=Lax・Path=/ と、発行から固定7日の期限を共通にする。

- セッションは `kind: "guest" | "account"` の判別可能なunionにする。guestは `email: null` を持つ。ゲスト判定はkindで行い、メールや表示名の有無を認可やゲスト判定に使わない。
- kindのない旧Cookie（emailあり）は、署名と期限を検証したうえでaccountとして受理する。kindとemailが矛盾するトークンは拒否する。
- 本人IDはNextのServer Actionで生成する。Nextが署名した短命のログイン主張（`kind: "guest"`）を、Workerが署名・issuer・audience・expで検証してからメールなしのユーザー行を登録する。登録が成功し応答を検証できた後にだけCookieを発行する。
- 有効なCookieがあれば本人を再利用し、Google名や選択済みの表示名を上書きしない。
- `users.email` はNULL可・UNIQUE維持とし、架空のメールを作らない。ゲストの名前は既存の `display_name` に保存する。
- Preview（Cloudflare Access）は許可済みメールを前提とするため、ゲストのセッションとログイン主張を拒否する。

ブラウザが送るUUIDだけを保存する方式は、改ざんや他人のIDの指定を検出できないため採用しない。署名トークンをlocalStorageへ置く方式は、JavaScriptから認証情報を読めるため採用しない。ゲスト用の別Cookie・別検証経路は、作成・参加・WS・成果APIの認可を二重に持つことになるため採用しない。

## 影響と見直す条件

- Cookieを消す、別のブラウザ・端末を使う、期限が切れると同じゲストとして戻れない。名前や前回のIDから権限を復元しない。
- 初回登録の再送で、使われないユーザー行が残ることがある。ルーム作成・参加を登録処理に混ぜないため、権限は二重に作られない。
- ログイン操作という手間がなくなるため、名前を入れるだけで本人とユーザー行を繰り返し作れる。本人単位の作成制限は、本人を作り直せば回避できる。今回は既知のリスクとして受け入れ、流量制限や未使用行の掃除は乱用が観測された時点で別に扱う。
- `users` の作り直しは `user_permissions` のON DELETE CASCADEで権限を消すため、migration 0013は同じ処理内で権限を退避・復元し、ホスト・作成要求・作成制御の参照と保護triggerを残す。外部キー違反が残る場合は移行全体を失敗させる。ローカルD1（miniflare）のmigrationテストで保持と整合性を確認した。リモートD1への適用はPR Previewで確認した。違反が残る場合にリモートで移行全体が戻ることは未確認のため、本番適用前には `PRAGMA foreign_key_check` が空であることを確かめる。
- デプロイはmigration → 新旧セッションを受理するWorker → ゲストを発行するNextの順にする。旧WorkerはkindやNULLのemailを受理しないため。

ゲストの保持期間を7日より延ばす必要が出た場合、または署名鍵の更新でセッションを個別に失効させる必要が出た場合は、保持方式を見直す。

## 根拠

- [Issue #852](https://github.com/engineer-first/idea-boost/issues/852)（保持方式の比較と実装メモ）
- [0009: WebSocketのセッション期限](0009-websocket-session-expiry.md)、[0010: 入室前の認証準備](0010-room-entry-authentication.md)、[0014: 共通の表示名](0014-account-display-name.md)
- [Cloudflare D1の外部キー](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
