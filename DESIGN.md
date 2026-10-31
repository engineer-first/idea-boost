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
  surface: "#FFFFFF"
  canvas: "#F8FBFE"
  state-select: "#035EDE"
  state-focus: "#C2410C"
  state-decided: "#16803F"
  state-excluded: "#5F6C81"
  warning: "#B45309"
  danger: "#D92D4A"
typography:
  headline-display:
    fontFamily: Zen Maru Gothic
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.3
  headline-md:
    fontFamily: Zen Maru Gothic
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.5
  body-md:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.7
  note-body:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  label-md:
    fontFamily: Noto Sans JP
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.4
  label-sm:
    fontFamily: Noto Sans JP
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.3
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
  marker-highlight:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  badge-decided:
    backgroundColor: "{colors.state-decided}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  badge-focus:
    backgroundColor: "{colors.state-focus}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  badge-excluded:
    backgroundColor: "{colors.state-excluded}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
---

# IdeaBoost DESIGN.md

IdeaBoost の画面を、人も AI エージェントも同じ基準で作るための文書です。本文が意図と使い方、先頭の YAML がその値です。
形式は [Google Labs の DESIGN.md](https://github.com/google-labs-code/design.md)（alpha）に合わせ、`npx @google/design.md lint DESIGN.md` で検査できます。
まだ実装に入っていない項目は、末尾の「決まり具合」にまとめています。

## Overview

**ひらめきが次々に出て、チームで選び切れる。** 見た目はこの体験を支えるためにあります。
対象はアイデア出しに慣れていない初学者のチームで、自由なホワイトボードではなく「道案内」を提供します（[PRD](docs/prd.md)）。

- **主役は付箋と人。** 白いボードの上で、作者色の付箋がいちばん目立つようにします。UI の枠は白基調で静かにします。
- **主色は「次にやること」を照らす。** 青は主ボタン・現在のステップ・選択・投票など、今触る場所だけに使います。面積が小さいほど道案内として効きます。
- **ワクワクは、角の丸さと小さな黄色で出す。** 丸ゴシックの見出し、丸みのある部品、LP のマーカーの黄色で、硬すぎない楽しさを出します。

LP・成果画面は表現を豊かにしてよく、作業ボードは付箋と次の行動を主役にして装飾を控えます。テーマはライトだけです（PRD §9）。

## Colors

色は役割で選びます。同じ値でも意味が違えば別のトークンにし、後から片方だけ変えられるようにします。

- **主色（`primary` `#035EDE`）：** 色相 260° の青。主ボタン、現在のステップ、選択枠、投票、リンクに使います。「とっつきやすく、目に優しい」という理由で、紫寄りの案から選びました（[#841](https://github.com/engineer-first/idea-boost/issues/841)）。
- **濃い色・淡い色（`primary-strong` / `primary-soft`）：** ホバーと淡い面の文字、現在のステップなど小さな面の背景に使います。
- **アクセントの黄（`accent`）：** LP のマーカーなど小さな面だけに使い、文字は濃い色（`on-accent`）を乗せます。
- **文字と面：** 本文（`ink`）は主色の色相を少し含んだ濃紺、補足は `muted`。パネルは白（`surface`）、ボードはわずかに青みのある白（`canvas`）です。

### 状態

状態色は役割ごとに1色にします。鮮やかな色が同時にいくつも出ると、やかましく見えるためです。

| 状態             | 色                 | 理由                                               |
| ---------------- | ------------------ | -------------------------------------------------- |
| 選択（操作）     | 主色と同じ青       | 「今触っている」は主色の役割                       |
| 注目（採用候補） | オレンジ `#C2410C` | 注意を向ける色として一般的。黄より好まれた         |
| 決定             | 緑 `#16803F`       | 成功・完了は緑、という多くの人の共通認識に合わせる |
| 候補外           | 青みの灰 `#5F6C81` | 作者色を薄く残し、誰の案かは追えるようにする       |

決定を黒や青にしないのは、黒は重く、青は主色と区別しにくく「まだ操作中？」に見えるためです。

### 作者色（付箋）

付箋の色は、誰が書いたかを示します。表示色の正本は `features/room-members/logic/note-color.ts` で、ここには値を写しません。

- 付箋の文字は、どの色でも共通の濃い色にします。
- 色だけで人を見分けさせず、付箋・アバター・カーソルには名前を添えます。
- 20色を一律に淡くはしません。淡くすると見分けにくい組が増えるためです。

## Typography

日本語の読みやすさを最優先にします。

- **見出し：Zen Maru Gothic。** 丸ゴシックで硬すぎない楽しさを出します。作業ボードの小さな文字には使いません。
- **本文・ラベル：Noto Sans JP。** 小さいサイズでも潰れにくく、OS による見え方の差が小さい書体です。
- **付箋の本文：** 14px、行の高さ 21px。
- **太さ：** 400 と 700 の2つに絞ります。

## Layout

4px を最小単位にして余白を取ります。付箋は幅 200px・高さ 150px（`contracts/board.ts`）です。
作業ボードは画面いっぱいに広げ、操作部品（HUD）は四隅に浮かべて、付箋と重ならないよう端に余白を取ります。
20人の参加、長文の付箋、縮小表示、狭い画面幅でも崩れないことを確かめます。

## Elevation & Depth

奥行きは「紙」と「浮いた道具」の2種類だけにします。

- **付箋＝机に貼った紙。** 下辺からだけ影が出て、端がわずかに浮いて見えます（`features/notes/logic/note-shadow.ts`）。
- **HUD・メニュー・ダイアログ＝ボードの上に浮いた道具。** 柔らかく広い影を1種類だけ使います。
- **候補外の付箋** は影を消し、点線の縁にします。

## Shapes

付箋は角をほぼ立て（2px）、UI の部品は丸くします。付箋は「紙」、部品は「道具」として見分けがつくようにするためです。
入力欄は 8px、ボタン・パネルは 12px、HUD・ダイアログは 16px、バッジ・チップ・アバターは丸にします。

## Components

部品の型（ダイアログ2種、ボタンの使い分け）は #841 の Phase 2 で書きます。ここでは付箋の状態の示し方だけを決めます。

状態は色だけで伝えず、「✓決定」「注目」「候補外」の文字バッジと縁の線種を組にします。色の見え方に差がある人にも伝わるようにするためです。
決定済みの付箋を選択しても両方が見えるよう、層を分けます。

- **結果**（注目・決定・候補外）：付箋の縁の線種と文字バッジ。
- **操作**（選択）：付箋から少し離した外側の枠と、四隅のハンドル。
- **キーボードフォーカス**：さらに外側のリング。

## Do's and Don'ts

- 主色は「次にやること」が分かる場所に絞る。広い面に色を付けたくなったら、`primary-soft` か白にする。
- フェーズが変わっても、主ボタンと選択の色は変えない。フェーズの違いはステップの番号や見出しで示す。
- 付箋には常時の枠線を付けず、作者色と影で見分ける（PRD §9）。枠は状態を示すときだけに使う。
- 文字は背景に対して 4.5:1 以上、枠線とアイコンは 3:1 以上のコントラストにする。

## 決まり具合

この文書のうち、まだ実装に入っていないものです。実装したら行を消します。

| 項目                               | 今の実装                                           | 扱う Issue   |
| ---------------------------------- | -------------------------------------------------- | ------------ |
| 主色・文字と面の色をトークンにする | shadcn/ui 既定の無彩色                             | #876         |
| 注目をオレンジにする               | 注目・決定ともに緑                                 | #876         |
| 日本語フォント                     | Geist（ラテン文字のみ）                            | #876         |
| 角丸・影の段階を絞る               | 7種類以上が混在                                    | #876         |
| 色・角丸の直書きをどこまで許すか   | 未定                                               | #877         |
| 選択枠を付箋から離して描く         | 付箋に接して描いている（青い付箋の上で見えにくい） | #876         |
| 部品の型（ダイアログ・ボタン）     | 未記載                                             | #841 Phase 2 |
