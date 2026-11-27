# 利用分析（PostHog）

流入元ごとの LP 訪問と、アプリの利用へ進んだ数を見るための計測（[#1043](https://github.com/engineer-first/idea-boost/issues/1043)、検討は [#636](https://github.com/engineer-first/idea-boost/issues/636)）。
本番では 2026-11-27 から有効（下の「今の設定」）。**PostHog のプロジェクトキーが無いビルドでは何も読み込まず、何も送らない。**

## 有効にする手順

1. PostHog Cloud でプロジェクトを作り、プロジェクトキー（`phc_...`）を控える。プロジェクト設定で IP アドレスを保存しない設定（Discard client IP data）を有効にする。
2. [保存とプライバシー](../../app/privacy/privacy-view.tsx)に、送る情報・送り先・目的を書く（下の「送る情報」をもとにする。記載済み。下の表や送信先の地域を変えたときはページも合わせる）。
3. GitHub の Actions variables に `NEXT_PUBLIC_POSTHOG_KEY` と `NEXT_PUBLIC_POSTHOG_HOST` を入れる。
4. 次の本番公開（Deploy の `build:cf`）から有効になる。ブラウザの開発者ツールで `i.posthog.com` への送信と、送られた URL に招待コード・ルーム ID が無いことを確かめる。

止めるときは `NEXT_PUBLIC_POSTHOG_KEY` を消して公開し直す。開発環境・PR プレビューでは、キーがあっても送らない（本番ビルドだけ）。

## 今の設定（2026-11-27 に有効化）

- PostHog Cloud **US**（`https://us.i.posthog.com`）のプロジェクト「Idea Boost」（ID 771180）。オーナーが作った組織に1つだけあったプロジェクトを使う。US にしたのは、オーナーが作った時点の組織が US で、EU へは組織ごと作り直しになるため。送る情報は匿名の画面閲覧だけで、地域による差が小さい。プライバシーのページにも米国のサーバーと書いている。
- プロジェクト側でも、IP の破棄・タイムゾーン Asia/Tokyo を設定し、自動収集・録画・ヒートマップ・アンケート・コンソールログ・性能計測・例外・Web Vitals を切っている（コード側でも止めている）。
- Actions variables：`NEXT_PUBLIC_POSTHOG_KEY`（公開のプロジェクトキー）と `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`。秘密の値は使わない。
- PostHog のダッシュボード「流入元から完了まで」で、流入元別の LP 訪問と、LP → ルーム作成・参加 → 完了の進み具合を見る（画面閲覧のパスで数える）。

## 送る情報と送らない情報

| 送る                                                             | 送らない                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 画面の閲覧・離脱（`$pageview` / `$pageleave`）                   | クリックの自動収集・画面録画・ヒートマップ・アンケート・Web Vitals・例外（すべて無効） |
| 閲覧した画面のパス（ID は `/rooms/:id`・`/invite/:code` に置換） | 招待コード・ルーム ID・成果 ID、`next` などのクエリ、URL のハッシュ                    |
| 流入元のクエリ `utm_source`・`utm_medium`・`utm_campaign` など   | 外部の参照元の検索語（`ph_keyword` は落とし、参照元は origin だけにする）              |
| ブラウザ・OS・画面サイズ・おおよその地域（PostHog の標準の項目） | 名前・メール・アカウント ID（`identify` を呼ばないので匿名のまま）、付箋の本文         |

Do Not Track を有効にしているブラウザからは送らない。匿名の識別子は cookie ではなく localStorage に置く。実装は `lib/analytics/`、送る直前の整形は `sanitizeAnalyticsProperties`。

## UTM の付け方

施策ごとに `utm_source`（例：`youtube`・`x`・`note`・`hackathon`）と `utm_campaign`（例：`kobe-student-hack-2027`）を LP の URL に付ける。決まりは #1043 で決める。
