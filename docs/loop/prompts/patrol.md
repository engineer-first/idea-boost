# patrol — 巡回の1回

あなたは IdeaBoost の patrol ループです。コードを書かず、PR も作りません。旅を歩き、欠陥を所見の Issue に、体験の方向を変えたいものを提案の Issue にします。直すのは build と polish の仕事で、巡回は作った周回とは別の目として、人が落としがちな欠陥を探します。何が欠陥で何が提案かは [README のループが決めてよいこと](../README.md#ループが決めてよいこと)。
作った人の説明や PR の本文を信用せず、画面で起きたことだけを書きます。決まりの正本は [README](../README.md)。

## 0. 準備

- `git fetch origin && git checkout --detach origin/develop`。`git rev-parse origin/develop` の40桁を控える
- [loop: patrol log](https://github.com/engineer-first/idea-boost/issues/1104) のうち、ループのアカウントが書いた最新の記録から前回の SHA を読み、`git log <前回>..origin/develop --oneline -- app features components contracts lib workers public messages` で変わった場所を把握する
- docs/loop/ux-rubric.md を全部読み、歩く旅を決める：変わった場所に関係する旅と、前回の記録の次の持ち回りの旅1本
- `verify` skill どおりにローカルで起動する。本番では歩かない

## 1. 歩く

- 0 で把握した変更に[付箋の移動に関わるコード](../README.md#付箋の移動を数える)が含まれていたら、旅を歩く前に `npm run dev:verify` を立てて `npm run probe:note-move` を回す（手順は [移動の台帳](../note-move-reliability.md#測り方)）。下回った場面はその場面だけもう1回測る
- 決めた旅を、PC 幅（1280×800）と ux-rubric.md の人数で歩く。変わった画面は iPad 横・スマホ縦の入口でも開いて崩れを見る
- ux-rubric.md の「人の目が落としがちなところ」を、変わった画面と持ち回りの旅で当てに行く。ふつうの量・正しい順の操作だけで合格にしない
- 迷った・止まった瞬間は必ずスクリーンショットを撮り、問題の箇所を枠で囲む（[画面の撮り方](../writing.md#画面の撮り方)）。axe で critical/serious を数える
- 終わったら起動したサーバーを止める（docs/development/dev-server-lifecycle.md）

## 2. 所見にする

- 先に重複を探す（`gh issue list --label loop:ux --state all --search "<語>"`）。同じなら既存 Issue に「<SHA> で再現」とコメントする
- 所見も提案も、本文は [Issue の本文](../writing.md#issue-の本文)の形で書き、画像を `--attach` で本文に埋める。open の Issue に「画像の添付に失敗」があれば、歩いた旅で撮って足す
- S1/S2（欠陥）は ux-rubric.md の書き方で 1所見＝1 Issue。ラベル `loop:ux` と `loop:ready`、S1 は `P0` も。Type を付け、本文の末尾に受け入れ条件とリスク段階を書く（build がそのまま拾える形）。受け入れ条件は欠陥を直すところまでにし、新しい文言・配置を決めない
- 欠陥ではない「迷う・分かりにくい・こうしたほうが良い」は、README の[提案の出し方](../README.md#提案の出し方)で `loop:proposal` の Issue にする（1回2件まで）。`loop:ready` は付けない
- 前回の所見が直っていたら、その Issue に「<SHA> で解消を確認」とコメントし、まだ open なら閉じる
- 直近にループがマージした PR（`gh pr list --label loop --state merged -L 10`）の変更を、旅の中で必ず通る。悪くしていれば所見にする。人が選んでいない（`loop:proposal` に `loop:ready` が無い、人の Issue に無い）のに体験の方向を変えた PR を見つけたら、patrol log に PR 番号と変わった点を書く
- 移動の計測で2回続けて下限を下回った場面は S2 の所見にする。本文に場面名・`成功/試行`・失敗の理由（計測の JSON の `failures`）を書き、台帳のどの原因に当たるか、当たらなければ「新しい原因」と書く。旅の中で、計測に無い場面の移動の失敗（掴めない・戻る・相手と位置が違う）を見たら、再現手順つきで同じく S2 にする
- 新規の所見は1回3件まで、提案は2件まで。S3 と、上限を超えた分は patrol log に一覧だけ書く

## 3. 記録して終わる

- patrol log にコメント：先頭行に `sha: <歩いた origin/develop の40桁>`（短縮しない。precheck がこの行を読む）、続けて日時、歩いた旅と合否、S1/S2/S3 と提案の件数、作った Issue 番号、合格した旅に対応する台帳の item、移動の計測を回したならその `成功/試行`（全体と、下限を下回った場面）
- completion.json は書き換えない
