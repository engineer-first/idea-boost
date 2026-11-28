# ループの Issue と PR の書き方

ループ（patrol・polish・replan・build・mend）が書く Issue と PR の本文の形と、画面の撮り方・添付の仕方の正本。
読むのはオーナーとメンバーで、1件を1分で判断できることを目指す。オーナーが見たいのは「どう変えるか」が困りごとの解決として正しいか、前提から変えるべきか、の2つ（2026-11-28 のオーナーの声。#1436 は見出しは良かったが、画面の「欄」がどこか分からず、変えた後の姿も無かった）。

- Issue の扱い（Type・状態・ラベル）は [Issue運用](../team/issues.md) と [README](README.md)、Why の考え方は [Issue記述ルール](../team/issue-writing.md) に従う。ここの「何が問題か」が Issue記述ルールの Why に当たる。
- PR の作り方は [write-pr](../../.agents/skills/write-pr/SKILL.md) に従い、**画面で見える変化（UI・文言・操作への反応）がある**ループの PR だけ本文の見出しをここの形にする。

## Issue の本文

ループが起票する提案（`loop:proposal`）と欠陥（`loop:ux` などの Bug）は、次の4見出しで書く。見出しの名前と順番は変えない。

```markdown
## 何が問題か

誰が・どの場面（ステップ番号・画面幅・役割）で・何に困るか／迷うか。1〜3文。
欠陥なら再現手順（何をした直後か）と、期待どおりの姿（PRD・進行仕様・完成台帳のどこと食い違うか）。

## どう変えるか

変え方。案が複数なら「案A」「案B」で、違いを1行ずつ（3案まで）。
前提を疑う別案（作りそのものを変える案）があれば1行だけ添える。例：「別案：この欄を共有ステップでは出さない」。

## 変える前の画面

<画面幅・ステップ・役割・何をした直後か の1行>

![<枠で囲んだ所の名前>](./before.png)

## 変えた時の画面イメージ

案A：![<何が変わるか>](./after-a.png)
作れなかったら、その理由を1行（例：「新しい動きなので静止画で示せない。動きは〜」）。

---

Risk: R0〜R2（理由と主なファイル）。1周で作れる大きさか。
```

- **画面の場所は言葉で頼らない。** 「欄」「ボタン」と書くときは、画面の上の位置（「右側のマイ付箋の欄」）か[用語集](../glossary.md)の呼び方を使い、同じ所を画像の枠で囲む。文章を読まなくても、画像だけで問題の箇所が分かるようにする。
- **欠陥は直すところまで。** 「どう変えるか」には欠陥を直す最小の形（崩れを収める、元の形に戻す）を書き、それを受け入れ条件として末尾に置く。新しい文言・配置が要る先は提案に分ける（[README のループが決めてよいこと](README.md#ループが決めてよいこと)）。
- **提案の末尾**には「作ってほしければ `loop:ready` を、要らなければ not planned で閉じてください」と書く。
- **画面が無い問題**（CI・性能・データの不整合など）は「変える前の画面」に、代わりに見せられるもの（ログの抜粋・数字の表）を置くか「画面に出ない」と1行書く。「変えた時の画面イメージ」も同じ。
- 既存の Issue を提案に替えるとき（build・replan）は、同じ4見出しでコメントを書く。ローカルを起動しない replan は、元の Issue の画像を引くか、「変える前の画面」に「未撮影（replan は画面を開かない）」と書く。人が `loop:ready` を付けたら、build が着手前に撮って Issue に足す。
- replan が大きな Issue から切り出す作業の Issue は、提案でも欠陥でもないので [create-work-issue](../../.agents/skills/create-work-issue/SKILL.md) の形のままでよい。
- 公開リポジトリなので、画像にもローカルの架空データだけを写す。本番のデータ・個人情報・秘密を写さない。

## PR の本文

画面で見える変化（UI・文言・操作への反応）があるループの PR は、本文を次の形にする。依存更新・CI・テスト追加・文書・画面に出ない同期や境界の直しなど、画面が変わらない PR は [write-pr](../../.agents/skills/write-pr/SKILL.md) の形のままでよい。

```markdown
Closes #N（Issue 全体を終えない PR は Refs #N。Issue が無ければ、見つけた記録へのリンク）

## 何が問題か

元の Issue の「何が問題か」を1〜3文で。polish のように Issue の無い欠陥は、歩いた旅と見つけた瞬間。

## どう変えたか

何をどう変えたか。人が選んだ案（案A など）と、Issue に書かれていない細部をどう決めたか（設計判断）。

## 変える前の画面

<画面幅・ステップ・役割・何をした直後か>

![変える前：<枠の所>](./before.png)

## 変えた後の画面

<変える前と同じ条件>

![変えた後：<枠の所>](./after.png)

## 確認結果

確かめたこと（テスト・verify での操作・付箋の移動の計測）と結果。未確認があれば書く。

## Risk

Risk: R0〜R2。理由、戻し方、巡回で見てほしい所。
Loop: <build|polish|mend>
```

- 元の Issue へのリンク（`Closes #N` か `Refs #N`）を必ず本文の先頭に置く。Issue の無い polish は polish log の記録のコメント、mend は失敗した run と原因の PR へのリンクで代える。polish で欠陥を複数直した PR は、欠陥ごとに「何が問題か」〜「変えた後の画面」を繰り返し、`Risk` は最後に1つ。
- 変える前と後は、画面幅・データ・ステップ・役割をそろえ、同じ所を同じ色の枠で囲む。変える前は develop の別 worktree か、変更を入れる前に撮る。
- 画像は本文に埋め込む（コメントに分けない）。write-pr の「画面資料はコメントへ」はループの PR には当てはめない。

## 画面の撮り方

撮るのは `verify` skill で起動したローカルだけ。既定は PC 幅（1280×800）で、問題が出る幅が別ならその幅で撮り、本文に幅を書く。

### 問題の箇所を枠で囲む

撮る前に、ページの上で問題の要素を枠で囲む。どのブラウザ操作でも、ページで次の JavaScript を実行してから撮る（agent-browser は `eval`、Playwright は `page.evaluate`、Orca 内蔵ブラウザは JavaScript の実行）。`"SELECTOR"` を問題の要素の CSS セレクタに、`"LABEL"` を枠の名前（「マイ付箋の欄」「案A」など、無くてよい）に替える。

```js
((target, label) => {
  const el = typeof target === "string" ? document.querySelector(target) : null;
  if (typeof target === "string" && !el) throw new Error(`not found: ${target}`);
  el?.scrollIntoView({ block: "center" });
  const r = el ? el.getBoundingClientRect() : target;
  const left = Math.max(2, r.left - 4);
  const top = Math.max(2, r.top - 4);
  const right = Math.min(innerWidth - 2, r.left + r.width + 4);
  const bottom = Math.min(innerHeight - 2, r.top + r.height + 4);
  if (right <= left || bottom <= top) throw new Error("mark is outside the viewport");
  const box = document.createElement("div");
  box.dataset.loopMark = "";
  Object.assign(box.style, {
    position: "fixed", left: `${left}px`, top: `${top}px`,
    width: `${right - left}px`, height: `${bottom - top}px`, boxSizing: "border-box",
    border: "4px solid #e11d48", borderRadius: "8px",
    pointerEvents: "none", zIndex: "2147483647",
  });
  if (label) {
    const tag = document.createElement("span");
    tag.textContent = label;
    Object.assign(tag.style, {
      position: "absolute", left: "-4px", top: top >= 30 ? "-30px" : "0",
      padding: "3px 10px", background: "#e11d48", color: "#fff",
      font: "bold 15px sans-serif", borderRadius: "4px", whiteSpace: "nowrap",
    });
    box.append(tag);
  }
  document.body.append(box);
})("SELECTOR", "LABEL");
```

- 枠は要素の上に重ねるだけで、画面の配置を動かさない。撮った後は `document.querySelectorAll("[data-loop-mark]").forEach((n) => n.remove())` で消してから操作を続ける。
- 枠は画面の内側に収まり、上に余白が無ければ名前を枠の内側に置く。
- 要素を選べないとき（canvas の上の位置など）は、セレクタの代わりに `{ left: 900, top: 0, width: 380, height: 800 }` のような画面上の位置（px）を渡す。
- 枠は1枚に1〜3個。それ以上なら画像を分ける。

### 変えた時の画面イメージを作る

上から順に、作れるものを選ぶ。

1. **ローカルの画面を書き換えて撮る。** 文言の差し替え・要素を隠す・並べ替えくらいなら、ページの JavaScript で DOM を直接書き換え（`el.textContent = "…"`、`el.style.display = "none"` など）、変える前と同じ条件・同じ枠で撮る。コードは変えない。
2. **HTML のモックを撮る。** 新しい部品や配置は、作業用ディレクトリ（リポジトリの外）に HTML を1枚書き、リポジトリのルートで `npx playwright screenshot --viewport-size=1280,800 file:///<パス>/mock.html <作業用ディレクトリ>/after-a.png` を実行して撮る（リポジトリの Playwright とブラウザを使う）。[DESIGN.md](../../DESIGN.md) の色と文字に寄せ、変える所だけを描けばよい。
3. **作れない理由を書く。** 動き・タイミング・複数人の同期など静止画で示せないものは、作れない理由と、代わりに言葉で示す画面の変化を1〜2行で書く。

案A・案B があるときは、案ごとに1枚ずつ作る。前提を疑う別案のイメージは無くてよい。

## 画像の添付

画像は `gh` の `--attach` で添付する。`gh` 2.99.0 以降の `gh issue create/edit/comment` と `gh pr create/edit/comment` が対応し、ループの手元の `gh` 2.106.0 で、PR の本文への添付を #1461 で、Issue の本文への添付を #1436 で確かめた（2026-11-28）。手順の詳細は `github-media` skill。

- 本文は一時ファイル（リポジトリの外）に書き、画像はそのファイルからの相対パスで `![…](./before.png)` と参照する。`gh issue create --body-file body.md --attach ./before.png --attach ./after-a.png` のように渡すと、`gh` がアップロードして参照をアップロード先の URL に置き換える。本文で参照していない画像は末尾に足されるので、添付するものはすべて本文で参照する。
- 既存の本文に足すときは、直前に最新の本文を取得し、追記を残したまま `gh issue edit` / `gh pr edit` に `--body-file` と `--attach` を渡す。
- 投稿後に `gh issue view` / `gh pr view` で本文を読み、画像の参照が `https://github.com/user-attachments/assets/` で始まる URL になっていること（ローカルのパスが残っていないこと）を確かめる。

### 添付できなかったとき

`--attach` は一部の画像だけ失敗しても Issue・PR を作り、終了コードを 0 以外にする。失敗したら、作られた本文を読んでから次のとおりにする。

- **1回だけやり直す。** 欠けた画像の所にローカルの参照を残した本文ファイルを `--body-file` で渡し、`gh issue edit` / `gh pr edit` に欠けた画像だけを `--attach` する（`--attach` だけだと画像は本文の末尾に付く）。同じ Issue・PR を作り直さない。
- **提案の Issue**：やり直しても画像が付かなければ、Issue を閉じずに本文の画像の所へ「画像の添付に失敗（<エラーの1行>）。<画面幅・ステップ・役割・操作> で見られます」と書き、周回の log に Issue 番号を残す。patrol が次の巡回で `gh issue list --state open --search "画像の添付に失敗"` で探し、撮って足す。
- **欠陥の Issue**：画像が無くても起票し、「何が問題か」の再現手順を、画面を見なくても同じ所に辿り着ける細かさで書く。後から足すのは提案と同じ。
- **PR**：UI の PR は変える前と後の画像がそろうまで auto-merge を予約しない（[マージの決まり](README.md#マージの決まり)）。理由を PR にコメントし、次の build が[止まっている PR](prompts/build.md#止まっている-pr-を流すとき)として拾って足す。
- 画像をリポジトリにコミットして代わりにしない。`gh` が古くて `--attach` が無いときは、`mise` などで `gh` を更新してからやり直す。
