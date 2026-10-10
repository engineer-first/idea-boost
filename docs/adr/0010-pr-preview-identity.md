# 0010: PR PreviewをAccess本人ログインと共通APIで動かす

- 状態: 提案
- 決定日: 未確定（PRレビューで判断する）
- 記録日: 2026-10-10
- 対象: [PBI #362](https://github.com/engineer-first/idea-boost/issues/362)

## 背景

レビュー担当者がPRの変更画面を好きなステップから操作し、実際の本人同士で同じルームを共有したい。本番データを使わず、PRごとにAPIと保存先まで複製する運用も避けたい。

## 決定案

PRごとにAppだけをWorkers Previewsへ公開し、CI成功したdevelopの共通Preview API、専用D1、PreviewRoomDO namespaceへ接続する。APIとRoomDOを変えるPRは、その版をPreviewで確認できないことをPRの案内へ明記する。

Cloudflare AccessのGoogle限定applicationとメール許可一覧で本人ログインを受ける。Appの全入口（静的assetsとWebSocketを含む）でJWTのRS256署名・issuer・audience・期限を検証し、署名済みの短命な本人主張でAPIへユーザーを登録する。既存のGoogle本人主張を使い、Access subjectを`access:<subject>`としてPreview専用D1の本人へ対応付ける。Access applicationへGoogle以外のIdPを加えないことを初期設定の前提にする。

本番と別の秘密でPreviewセッションを署名する。ブラウザにはhost限定の`__Host-idea_boost_preview_session`を持たせ、内部のNext/APIへ検証済み本人のCookieだけを渡す。APIはメール許可一覧を再検査し、ルーム所属・ホスト・付箋可視性は既存のアプリ認可を継承する。セッション期限はAccess JWTの期限以下とし、WebSocketもその期限で閉じる。

## 比較した方式

既存AppのGoogle OAuthを各PRで使う方式では、可変のPR URLとOAuth戻り先の登録・分離を管理する必要がある。Accessの共通applicationで本人性を検証すると、その入口を集約できるため採用案とする。ただしAccessの実契約・Google設定・URL対象・許可一覧を#360で確認できることが条件となる。

API・D1・RoomDOもPRごとに作る方式は、PR版バックエンドを確認できる代わりにmigration・Secret・削除対象が増える。初版で最も使うUX確認を優先し、Issueで決定済みの共通API方式を使う。

## 代償と確認

Access policyとApp/APIの許可一覧を揃えて更新する必要がある。JWTだけではGoogle限定policyの実設定を証明できないため、実環境のGoogle本人ログインと別メンバー2ブラウザの確認を公開前に残す。PRコードのbuildはSecretのない別runnerに分離し、公開runnerは信頼済みoperatorと構成だけを使う。同一repoのPRのみ対象で、forkにはSecretを渡さない。

手順と実施記録は[Preview運用](../operations/preview.md)へ案内する。コードがマージされただけで、実設定・本番release・PBI受け入れ条件の完了とは扱わない。
