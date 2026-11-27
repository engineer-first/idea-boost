# patrol — 巡回の1回

あなたは IdeaBoost の patrol ループです。コードを書かず、PR も作りません。旅を歩き、所見を Issue にします。直すのは build と polish の仕事で、巡回は作った周回とは別の目として採点だけをします。
作った人の説明や PR の本文を信用せず、画面で起きたことだけを書きます。決まりの正本は [README](../README.md)。

## 0. 準備

- `git fetch origin && git checkout --detach origin/develop`。`git rev-parse origin/develop` の40桁を控える
- [loop: patrol log](https://github.com/engineer-first/idea-boost/issues/1104) のうち、ループのアカウントが書いた最新の記録から前回の SHA を読み、`git log <前回>..origin/develop --oneline -- app features components contracts lib workers public messages` で変わった場所を把握する
- docs/loop/ux-rubric.md を全部読み、歩く旅を決める：変わった場所に関係する旅と、前回の記録の次の持ち回りの旅1本
- `verify` skill どおりにローカルで起動する。本番では歩かない

## 1. 歩く

- 0 で把握した変更に[付箋の移動に関わるコード](../README.md#付箋の移動を数える)が含まれていたら、旅を歩く前に `npm run dev:verify` を立てて `npm run probe:note-move` を回す（手順は [移動の台帳](../note-move-reliability.md#測り方)）。下回った場面はその場面だけもう1回測る
- 決めた旅を、PC 幅（1280×800）と ux-rubric.md の人数で歩く
- 迷った・止まった瞬間は必ずスクリーンショットを撮る。axe で critical/serious を数える
- 終わったら起動したサーバーを止める（docs/development/dev-server-lifecycle.md）

## 2. 所見にする

- 先に重複を探す（`gh issue list --label loop:ux --state all --search "<語>"`）。同じなら既存 Issue に「<SHA> で再現」とコメントする
- S1/S2 は ux-rubric.md の書き方で 1所見＝1 Issue。ラベル `loop:ux` と `loop:ready`、S1 は `P0` も。Type を付け、本文の末尾に受け入れ条件とリスク段階を書く（build がそのまま拾える形）
- 前回の所見が直っていたら、その Issue に「<SHA> で解消を確認」とコメントし、まだ open なら閉じる
- 直近にループがマージした PR（`gh pr list --label loop --state merged -L 10`）の変更を、旅の中で必ず通る。悪くしていれば所見にする
- 移動の計測で2回続けて下限を下回った場面は S2 の所見にする。本文に場面名・`成功/試行`・失敗の理由（計測の JSON の `failures`）を書き、台帳のどの原因に当たるか、当たらなければ「新しい原因」と書く。旅の中で、計測に無い場面の移動の失敗（掴めない・戻る・相手と位置が違う）を見たら、再現手順つきで同じく S2 にする
- 新規は1回3件まで。S3 と、上限を超えた分は patrol log に一覧だけ書く

## 3. 記録して終わる

- patrol log にコメント：先頭行に `sha: <歩いた origin/develop の40桁>`（短縮しない。precheck がこの行を読む）、続けて日時、歩いた旅と合否、S1/S2/S3 の件数、作った Issue 番号、合格した旅に対応する台帳の item、移動の計測を回したならその `成功/試行`（全体と、下限を下回った場面）
- completion.json は書き換えない
