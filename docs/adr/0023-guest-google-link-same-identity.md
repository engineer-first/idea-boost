# 0023: ゲストの本人IDへGoogleを後付けで連携する

- 状態：提案
- 決定日：2026-10-29
- 記録日：2026-10-29

## 背景

ゲストは名前だけで作成・参加・成果の閲覧まで使える（[0021](0021-guest-session-identity.md)）。Cookieを消す・別の端末を使うと同じゲストに戻れないため、記録を残したい人だけが後からGoogleで本人を引き継げるようにする（[Issue #850](https://github.com/engineer-first/idea-boost/issues/850)）。
ゲストのデータはRoomDOのmember/host、付箋・投票のowner、ACCOUNT_DOの参加候補、完了成果のviewerとして、すべて `users.id`（セッションの `sub`）に結び付いている。
通常のGoogleログイン（`/api/auth/sync`）は google_sub → メールの順で既存行を探し、なければ新しいIDを作る。

## 候補と決定

**ゲストの `users.id` を変えず、その行へ google_sub と email を付ける。** 連携後のセッションは同じ `sub` のaccountになり、以後の通常ログインは既存の google_sub 解決で同じIDへ戻る。

- 連携は通常ログインと経路を分ける。Nextの連携専用Actionが現在のゲストCookieから本人を取り、用途を分けた署名付き短命intent（最長10分かつセッションの残り期限以内）をHttpOnly Cookieに置いてGoogle認証を始める。callbackは state 一致・Google検証・現在のCookieの本人が開始時と同じことを確認し、通常の `establishSession` を呼ばない。
- Workerの連携専用APIは、現在のゲストセッションと連携用の署名付き主張の両方を検証して本人IDの一致を確認し、「未連携のゲスト」または「同じIDに同じgoogle_subが連携済み（再送）」の行だけを条件付きUPDATEする。並行実行は事前SELECTではなくUPDATE条件とUNIQUE制約で守る。
- 表示名（display_name・revision）はGoogle名で上書きしない。
- Workerが同じIDの確定を返した後にだけaccount Cookieを発行する。取消し・失敗・対象外では元のゲストCookieとデータを保持し、列挙した結果コードを元画面で文言に変換する。

**別のIdeaBoost本人へ登録済みのGoogleアカウントとの統合は行わない。** 別IDが既に同じgoogle_subまたはメールを持つ場合は連携を拒否し、双方の行を変えない。

採用しなかった候補:

- 通常ログインで新しい（または既存の）IDのCookieを発行してから、ゲストのデータを移す方式。RoomDO・ACCOUNT_DO・成果viewerなど所有者の参照が複数のストレージに分散し、全ルームの走査と移行が必要になる。移行途中の失敗や並行操作で、ホストや付箋の所有者が二重・欠落になりうる。
- 別IDの記録を1つの本人へ統合する方式。統合後にどちらの表示名・ホスト権・参加状態を残すかの判断が必要で、誤って他人の記録を取り込む影響が大きい。ベータ版では需要も確認できていない。

## 影響と見直す条件

- 連携は1つのusers行の更新だけで完結し、ルームや成果のデータには触れない。連携前に参加していたルームのWS・入室確認は、新しいセッション期限で通常どおり確認し直す。
- 先に別の端末でGoogleログインしてIdeaBoostの本人を作っていた人は、そのGoogleでゲストを連携できない。別のGoogleアカウントで連携するか、ゲストのまま使う。
- 一度連携した行は、連携の解除や別Googleへの付け替えをしない。
- Google OAuthの実環境でしか確かめられない取消し・同意画面の挙動は、PR Previewまたは本番相当の環境で確認する。

別ID同士の記録統合を求める声が継続して出た場合、またはGoogle以外の連携先を追加する場合に見直す。

## 根拠

- [Issue #850](https://github.com/engineer-first/idea-boost/issues/850)（実装メモと設計判断のコメント）、[PBI #749](https://github.com/engineer-first/idea-boost/issues/749)
- [0021: ゲスト本人を署名付きCookieで保持](0021-guest-session-identity.md)、[0010: 入室前の認証準備](0010-room-entry-authentication.md)、[0015: アカウント単位の参加先切り替え](0015-account-room-participation.md)
