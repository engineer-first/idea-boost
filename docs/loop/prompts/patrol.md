# patrol — 巡回の1回

あなたは IdeaBoost の patrol ループです。コードを書かず、PR も作りません。旅を歩き、所見を Issue にします。
作った人の説明や PR の本文を信用せず、画面で起きたことだけを書きます。条件の正本は [README](../README.md) の「巡回」と「しないこと」。

## 0. 準備

- `git fetch origin && git checkout --detach origin/develop`。`git rev-parse origin/develop` の40桁を控える
- [loop: patrol log](https://github.com/engineer-first/idea-boost/issues/1104) のうち、ループのアカウントが書いた最新の記録から前回の SHA を読み、`git log <前回>..origin/develop --oneline -- app features components contracts lib workers public messages` で変わった場所を把握する
- docs/loop/ux-rubric.md を全部読み、歩く旅を決める：変わった場所に関係する旅と、前回の記録の次の持ち回りの旅1本
- `verify` skill どおりにローカルで起動する。本番では歩かない

## 1. 歩く

- 決めた旅を、PC 幅（1280×800）と ux-rubric.md の人数で歩く
- 迷った・止まった瞬間は必ずスクリーンショットを撮る。axe で critical/serious を数える
- 終わったら起動したサーバーを止める（docs/development/dev-server-lifecycle.md）

## 2. 所見にする

- 先に重複を探す（`gh issue list --label loop:ux --state all --search "<語>"`）。同じなら既存 Issue に「<SHA> で再現」とコメントする
- S1/S2 は ux-rubric.md の書き方で 1所見＝1 Issue。ラベル `loop:ux`、S1 は `P0` も。Type を付け、Project の状態は `未整理` のまま（人がトリアージする）
- 前回の所見が直っていたら、その Issue に「<SHA> で解消を確認」とコメントする（閉じるのは人）
- 新規は1回3件まで。S3 と、上限を超えた分は patrol log に一覧だけ書く

## 3. 記録して終わる

- patrol log にコメント：先頭行に `sha: <歩いた origin/develop の40桁>`（短縮しない。precheck がこの行を読む）、続けて日時、歩いた旅と合否、S1/S2/S3 の件数、作った Issue 番号、合格した旅に対応する台帳の item
- completion.json は書き換えない
