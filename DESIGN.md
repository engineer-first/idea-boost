---
version: alpha
name: IdeaBoost
description: 初学者チームが迷わずアイデアを出し、チームで選べるブレスト支援ツールの見た目の基準。白いボードと作者色の付箋が主役で、主色の青は「次にやること」だけを照らす。
colors:
  primary: "#035EDE"
  primary-strong: "#0049B4"
  primary-soft: "#E8F1FF"
  on-primary: "#FFFFFF"
  accent: "#FFCF4A"
  on-accent: "#121D2F"
  ink: "#121D2F"
  muted: "#516079"
  line: "#DDE5F1"
  line-strong: "#8391A6"
  surface: "#FFFFFF"
  surface-muted: "#EFF3F8"
  canvas: "#F8FBFE"
  state-select: "#0B93F5"
  state-focus: "#C2410C"
  state-decided: "#1E8E3E"
  state-decided-text: "#188038"
  state-excluded: "#5F6C81"
  warning: "#B45309"
  warning-soft: "#FEF3E2"
  danger: "#D92D4A"
  danger-soft: "#FDEEF1"
  danger-text: "#B42339"
typography:
  headline-display:
    fontFamily: Noto Sans JP
    fontSize: 30px
    fontWeight: 800
    lineHeight: 1.3
  headline-lg:
    fontFamily: Noto Sans JP
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.4
  headline-md:
    fontFamily: Noto Sans JP
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.5
  headline-sm:
    fontFamily: Noto Sans JP
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.5
  body-md:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
  body-sm:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.7
  note-body:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  label-md:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.4
  label-sm:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.4
  label-xs:
    fontFamily: Noto Sans JP
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  note-width: 200px
  note-height: 150px
rounded:
  note: 2px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
  button-waiting:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  notice-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.lg}"
  marker-highlight:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  stamp-decided:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.state-decided-text}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
---

# IdeaBoost DESIGN.md

IdeaBoost の画面を、人も AI エージェントも同じ基準で作るための文書です。本文が意図と使い方、先頭の YAML がその値です。
形式は [Google Labs の DESIGN.md](https://github.com/google-labs-code/design.md)（alpha）に合わせ、`npx @google/design.md lint DESIGN.md` で検査できます。
まだ実装に入っていない項目は、末尾の「決まり具合」にまとめています。

色などの値は、固定した `@google/design.md` から `npm run gen:design-tokens` で [app/design-tokens.css](app/design-tokens.css) に生成します。生成物は直接編集せず、YAMLを変更して再生成します。`npm run check:design-tokens` が生成物との一致を、`npm run lint:design` がこの文書の形式を検査し、CIでも実行します。[app/globals.css](app/globals.css) はshadcnの名前を生成変数へ対応させます。角丸はこの対応層を通じて用途ごとに適用します。生成された余白は、対応付けるまで画面へ適用されません。

## Overview

**ひらめきが次々に出て、チームで選び切れる。** 見た目はこの体験を支えるためにあります。
対象はアイデア出しに慣れていない初学者のチームで、自由なホワイトボードではなく「道案内」を提供します（[PRD](docs/prd.md)）。

- **主役は付箋と人。** 白いボードの上で、作者色の付箋がいちばん目立つようにします。付箋は現実の付箋と同じく、枠や飾りを付けません。ボタンやパネルなどの操作部品は白と灰色を基本にし、付箋より目立たせません。

- **主色は「次にやること」を照らす。** 青は主ボタン・現在のステップ・投票など、今触る場所だけに使います。面積が小さいほど道案内として効きます。

- **基本はシンプルに、ワクワクは角の丸さで出す。** 色や飾りは足さず、丸みのある部品で硬すぎない印象にします。LP ではヒーローの見出しを太くするなど、表現を足してよいです。

- **言葉は足さない。** ボタンの文言で分かることは説明しません。説明による安心感より、少なさを取ります。

LP・成果画面は表現を豊かにしてよく、作業ボードは付箋と次の行動を主役にして装飾を控えます。テーマはライトだけです（PRD §9）。

## Colors

色は役割で選びます。同じ値でも意味が違えば別のトークンにし、後から片方だけ変えられるようにします。

- **主色（`primary` `#035EDE`）：** 色相 260° の青。主ボタン、現在のステップ、投票、リンクに使います。選択枠には使いません（下の「状態」）。「とっつきやすく、目に優しい」という理由で、紫寄りの案から選びました（[#841](https://github.com/engineer-first/idea-boost/issues/841)）。

- **濃い色・淡い色（`primary-strong` / `primary-soft`）：** ホバーと淡い面の文字、現在のステップなど小さな面の背景に使います。

- **アクセントの黄（`accent`）：** 基本は使いません。LP の見出しのマーカーなど、必要なときだけ小さな面に使い、文字は濃い色（`on-accent`）を乗せます。

- **文字と面：** 本文（`ink`）は主色の色相を少し含んだ濃紺、補足は `muted`。パネルは白（`surface`）、ボードはわずかに青みのある白（`canvas`）です。

- **淡い操作面（`surface-muted`）：** 通常の補助ボタン・ホバー・メニューの淡い背景に使います。shadcn の `muted`・`secondary`・`accent` を対応させ、補足文字の `muted` や装飾の黄の `accent` とは区別します。

- **強い線（`line-strong`）：** 押せないボタンの破線枠など、白地の上で 3:1 を確保したい線に使います。普段の区切りは `line` です。

- **注意の淡い面（`warning-soft`）：** ダイアログで気を付けてほしいこと（未完了のメンバーなど）を示すカードの背景です。文字は `warning` を乗せます。

- **危険の淡い面（`danger-soft` / `danger-text`）：** エラー表示や削除の確認など、取り消せないことを伝える小さな面です。`danger` の文字は小さいと 4.5:1 に届かないため、文字は 1 段濃い `danger-text` にします。

- **ページ背景：** `surface` の白を使います。ボード用の `canvas` と役割を分けます。

- **キーボードフォーカス：** リングは `primary` を使います。操作対象を示し、注目の `state-focus` とは区別します。

### 状態

状態色は役割ごとに1色にします。鮮やかな色が同時にいくつも出ると、やかましく見えるためです。小さな文字に使うときだけ、同じ色相の1段濃い色で 4.5:1 を確保します。

| 状態         | 色                                       | 理由                                                                                                                    |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 選択（操作） | 明るい青 `#0B93F5`                       | 多くのツールの選択色に合わせ、主ボタンと見分ける。付箋との間に白い 1px の隙間を挟み、どの作者色の上でも見えるようにする |
| 注目         | オレンジ `#C2410C`                       | いま目を向けてほしいもの（採用候補の付箋、待っているメンバー）に使う。注意を向ける色として一般的で、黄より好まれた      |
| 決定         | 緑 `#1E8E3E`（はんこの文字は `#188038`） | 成功・完了は緑、という多くの人の共通認識に合わせる。値は Google の緑に合わせ、16px の文字だけ 1 段濃くする              |
| 候補外       | 青みの灰 `#5F6C81`                       | 作者色を薄く残し、消えたようには見せない                                                                                |

### 作者色（付箋）

付箋の色は、誰が書いたかを示します。表示色の正本は `features/room-members/logic/note-color.ts`、割り当て順は `contracts/room-protocol.ts` で、ここには値を写しません。

- **付箋には名前を出さない。** 誰の意見かより中身で「いいな」と思えるように、付箋は色だけで書き手を示します。誰がどこにいるかを知りたいカーソルや参加者一覧には名前を出します。
- **少人数ほど見分けやすい色から割り当てる。** 6人程度までは色の系統が重ならない順にしています。
- 付箋に入力した文字は、どの色でも同じ濃い色（`note-color.ts` の `FOREGROUND_COLOR`）にします。

### 値を直接書かない

色と角丸は値ではなく名前で書きます。Tailwind では `bg-primary`・`rounded-lg`、CSS では `var(--ib-color-*)` を使い、淡い面は `color-mix(in oklab, …)` で名前から作ります（`oklch` は色相がずれる）。名前と値の一覧は Storybook の `Design/Tokens` で見られます。

`npm run lint` が CSS の hex と Tailwind の既定パレットをエラーにします。値を残すときは `biome-ignore lint/style/noHexColors: <理由>` を書き、ファイル全体なら `biome.json` の `overrides` に入れます。今の `overrides` はテスト・stories（見本の色）、LP の配色、ガイドのイラストです。`room-board-canvas.tsx`・`room-board-header.tsx` は Biome の不具合でパレットの検査だけ外しています（[biome#11342](https://github.com/biomejs/biome/issues/11342)）。

## Typography

日本語の読みやすさを最優先にします。

- **すべての画面を Noto Sans JP の1書体にする。** 可変フォントを `display: swap` で配信します。太さ（400・700）とサイズだけで差をつけます。例外として、LP のヒーローの見出し（h1）だけ 800 を使います。技術的な等幅表示には Geist Mono を残します。
- **標準は 16px。** 本文・ボタン・入力欄に使います（デジタル庁・SmartHR・Miro と同じ）。付箋の文字は利用者が 12〜24px で変えられ、初期値を 16px にします（`contracts/board.ts` の `NOTE_DEFAULT_FONT_SIZE`）。入力欄は、スマホで画面が拡大されないよう 16px 未満にしません。
- **場所が足りない部品は 14px、最小は 12px。** ボード上のツールバーや HUD は 14px、補足やバッジは 12px です。
- **段階は 12・14・16・18・20・24px**（Tailwind の `text-xs`〜`text-2xl`）。LP の大見出しは表示用途の既存サイズを使います。足りなければ、用途と一緒にここへ追加します。
- **最小サイズは拡大・縮小前の値です。** ボードのズームや成果の盤面プレビューは縮小できます。保存済み付箋の文字サイズは保持し、新規付箋と省略時の補完に16pxを使います。

## Layout

4px を最小単位にして余白を取ります。付箋は幅 200px で、高さは 150px から文字量に合わせて伸びます（`contracts/board.ts`）。
作業ボードは画面いっぱいに広げ、操作部品（HUD）は四隅に浮かべて、付箋と重ならないよう端に余白を取ります。
20人の参加、長文の付箋、縮小表示、狭い画面幅でも崩れないことを確かめます。

## Elevation & Depth（影と重なり）

奥行きは「紙」と「浮いた道具」の2種類だけにします。

- **付箋＝机に貼った紙。** 下辺からだけ影が出て、端がわずかに浮いて見えます（`features/notes/logic/note-shadow.ts` から、ドメインに依存しない紙の影の計算 `lib/paper-shadow.ts` を利用）。
- **HUD・メニュー・ダイアログ＝ボードの上に浮いた道具。** 柔らかく広い影を1種類だけ使います。
- **候補外の付箋** は影を消し、点線の縁にします。

道具の影の値の正本は [app/globals.css](app/globals.css) の `--elevation-tool` です。`@google/design.md` CLI v0.4.0 は影のスキーマと CSS export に対応していないため、YAML へ未対応キーを追加せず、ここだけ CSS に定義します。CLI が対応したら YAML へ移します。Tailwind は `shadow-tool`、CSS Modules は `var(--elevation-tool)` で共用します。通常の入力・ボタン・ページ内パネルは浮遊影を付けません。選択リング・発光・はんこ・押し込みは状態表現として別に維持します。

## Shapes

付箋は角をほぼ立て（2px）、UI の部品は丸くします。付箋は「紙」、部品は「道具」として見分けがつくようにするためです。
入力欄は 8px、ボタン・パネルは 12px、HUD・ダイアログは 16px、バッジ・チップは丸にします。

## Components

### 付箋の状態

付箋は普段は枠を付けず、選択・注目・決定・候補外のときだけ見た目を足します。具体的な見た目と動きは付箋の部品（`features/notes/molecules/`）が正本です。別の画面で同じ状態を出すときは、それを使うか真似てください。

- **決定は、ボードの中でいちばん目立たせる。** チームで選び切った結果なので、離れて見ても分かるようにします。今は付箋の浮き上がりと「決定」のはんこで示しています。上部の「決定した課題」など狭い欄では、見切れないように拡大せず、はんこを付箋の内側の右下に置きます。
- **動きは短く。** 次々に押し替えても待たされない速さにし、外れるときは静かにします。
- **枠が重なるときは、選択がいちばん内側。**
- **状態は色だけで伝えない。** 線の種類や文字も組にして、色の見え方に差がある人にも伝わるようにします。

### ボタン

利用者はボタンの文言を見て操作を決めます。何が起きるかを文言で言い切り、押せるかどうかは形と線でひと目で分かるようにします（[#896](https://github.com/engineer-first/idea-boost/issues/896)）。

| 種類   | 使う場面                         |
| ------ | -------------------------------- |
| 主     | 次にやること（1画面に1つが基本） |
| 補助   | キャンセル・並ぶ操作             |
| 控えめ | HUD・メニューの道具              |
| 危険   | 削除・戻せない操作の確定         |

- **押せない状態は、種類にかかわらず面を外し、破線の枠で示す。** 淡い面に濃い文字だと押せるように見えるためです。アイコンだけの小さいボタンは破線が騒がしくなるので、薄くするだけにします。
- **待てば押せるときは、禁止ではなく、あと少しで進めることを伝える。** 待つものを言い切れるなら文言と進み具合を出し、言い切れなければ文言は変えません。文言が変わっても周りの操作を動かしません。具体的な見た目と動きは `features/room/molecules/next-phase-confirm-dialog.tsx` が正本です。

### ダイアログ

確認には `AlertDialog`、入力には `Dialog` を使います。

- **タイトル・メインのコンテンツ・二者択一のボタンの3つで構成する。** コンテンツは入力などの操作箇所か、未完了メンバーなどの今の状態です。帯・区切り線・種類のアイコンは付けません。何のダイアログかはタイトルの言葉で、どれだけ重いかは主ボタンの色で伝えます。
- **説明は書かない。** 例外は、説明そのものが目的の画面（オンボーディング）、操作の失敗など今の状態、取り違えると取り返しがつかない操作の短い一文です。
- **ボタンは横幅いっぱいに大きく並べ、主ボタンを右に置く。** 利用者はボタンを見て決めるため、次の行動をいちばん大きく見せます。
- **注意点は `warning-soft` のカード1つにまとめる。**

## Do's and Don'ts（やること・避けること）

- 入力の制約は常に書かず、違反したときに初めて伝える。

- 主色は「次にやること」が分かる場所に絞る。広い面に色を付けたくなったら、`primary-soft` か白にする。

- フェーズが変わっても、主ボタンと選択の色は変えない。フェーズの違いはステップの番号や見出しで示す。

- 付箋には常時の枠線を付けず、作者色と影で見分ける（PRD §9）。枠は状態を示すときだけに使う。

- 文字は背景に対して 4.5:1 以上、状態を示す枠線は 3:1 以上のコントラストにする。

## 決まり具合

この文書のうち、まだ実装に入っていないものです。実装したら行を消します。

| 項目                                 | 今の実装                                                         | 扱う Issue |
| ------------------------------------ | ---------------------------------------------------------------- | ---------- |
| ドット投票のシールの色（主観・客観） | Tailwind の既定パレット。定数の文字列に書いており、lint の対象外 | #952       |
