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
    fontSize: 30px
    fontWeight: 700
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
  marker-highlight:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  stamp-decided:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.state-decided}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
---

# IdeaBoost DESIGN.md

IdeaBoost の画面を、人も AI エージェントも同じ基準で作るための文書です。本文が意図と使い方、先頭の YAML がその値です。
形式は [Google Labs の DESIGN.md](https://github.com/google-labs-code/design.md)（alpha）に合わせ、`npx @google/design.md lint DESIGN.md` で検査できます。
まだ実装に入っていない項目は、末尾の「決まり具合」にまとめています。

## Overview

**ひらめきが次々に出て、チームで選び切れる。** 見た目はこの体験を支えるためにあります。
対象はアイデア出しに慣れていない初学者のチームで、自由なホワイトボードではなく「道案内」を提供します（[PRD](docs/prd.md)）。

- **主役は付箋と人。** 白いボードの上で、作者色の付箋がいちばん目立つようにします。付箋は現実の付箋と同じく、枠や飾りを付けません。ボタンやパネルなどの操作部品は白と灰色を基本にし、付箋より目立たせません。
- **主色は「次にやること」を照らす。** 青は主ボタン・現在のステップ・選択・投票など、今触る場所だけに使います。面積が小さいほど道案内として効きます。
- **基本はシンプルに、ワクワクは角の丸さで出す。** 色や飾りは足さず、丸みのある部品で硬すぎない印象にします。LP では丸ゴシックの見出しなどで表現を足してよいです。

LP・成果画面は表現を豊かにしてよく、作業ボードは付箋と次の行動を主役にして装飾を控えます。テーマはライトだけです（PRD §9）。

## Colors

色は役割で選びます。同じ値でも意味が違えば別のトークンにし、後から片方だけ変えられるようにします。

- **主色（`primary` `#035EDE`）：** 色相 260° の青。主ボタン、現在のステップ、選択枠、投票、リンクに使います。「とっつきやすく、目に優しい」という理由で、紫寄りの案から選びました（[#841](https://github.com/engineer-first/idea-boost/issues/841)）。
- **濃い色・淡い色（`primary-strong` / `primary-soft`）：** ホバーと淡い面の文字、現在のステップなど小さな面の背景に使います。
- **アクセントの黄（`accent`）：** 基本は使いません。LP の見出しのマーカーなど、必要なときだけ小さな面に使い、文字は濃い色（`on-accent`）を乗せます。
- **文字と面：** 本文（`ink`）は主色の色相を少し含んだ濃紺、補足は `muted`。パネルは白（`surface`）、ボードはわずかに青みのある白（`canvas`）です。

### 状態

状態色は役割ごとに1色にします。鮮やかな色が同時にいくつも出ると、やかましく見えるためです。

| 状態             | 色                 | 理由                                               |
| ---------------- | ------------------ | -------------------------------------------------- |
| 選択（操作）     | 主色と同じ青       | 「今触っている」は主色の役割                       |
| 注目（採用候補） | オレンジ `#C2410C` | 注意を向ける色として一般的。黄より好まれた         |
| 決定             | 緑 `#16803F`       | 成功・完了は緑、という多くの人の共通認識に合わせる |
| 候補外           | 青みの灰 `#5F6C81` | 作者色を薄く残し、消えたようには見せない           |

### 作者色（付箋）

付箋の色は、誰が書いたかを示します。表示色の正本は `features/room-members/logic/note-color.ts`、割り当て順は `contracts/room-protocol.ts` で、ここには値を写しません。

- **付箋には名前を出さない。** 誰の意見かより中身で「いいな」と思えるように、付箋は色だけで書き手を示します。誰がどこにいるかを知りたいカーソルや参加者一覧には名前を出します。
- **少人数ほど見分けやすい色から割り当てる。** 6人程度までは色の系統が重ならない順にしています。
- 付箋に入力した文字は、どの色でも同じ濃い色（`note-color.ts` の `FOREGROUND_COLOR`）にします。

## Typography

日本語の読みやすさを最優先にします。

- **アプリ内は Noto Sans JP の1書体。** 太さ（400・700）とサイズだけで差をつけます。LP の大見出しだけ丸ゴシックの Zen Maru Gothic を使います。
- **標準は 16px。** 本文・ボタン・入力欄に使います（デジタル庁・SmartHR・Miro と同じ）。付箋の文字は利用者が 12〜24px で変えられ、初期値を 16px にします（`contracts/board.ts` の `NOTE_DEFAULT_FONT_SIZE`）。入力欄は、スマホで画面が拡大されないよう 16px 未満にしません。
- **場所が足りない部品は 14px、最小は 12px。** ボード上のツールバーや HUD は 14px、補足やバッジは 12px です。
- **段階は 12・14・16・18・20・24px**（Tailwind の `text-xs`〜`text-2xl`）。足りなければ、用途と一緒にここへ追加します。

## Layout

4px を最小単位にして余白を取ります。付箋は幅 200px で、高さは 150px から文字量に合わせて伸びます（`contracts/board.ts`）。
作業ボードは画面いっぱいに広げ、操作部品（HUD）は四隅に浮かべて、付箋と重ならないよう端に余白を取ります。
20人の参加、長文の付箋、縮小表示、狭い画面幅でも崩れないことを確かめます。

## Elevation & Depth（影と重なり）

奥行きは「紙」と「浮いた道具」の2種類だけにします。

- **付箋＝机に貼った紙。** 下辺からだけ影が出て、端がわずかに浮いて見えます（`features/notes/logic/note-shadow.ts`）。
- **HUD・メニュー・ダイアログ＝ボードの上に浮いた道具。** 柔らかく広い影を1種類だけ使います。
- **候補外の付箋** は影を消し、点線の縁にします。

## Shapes

付箋は角をほぼ立て（2px）、UI の部品は丸くします。付箋は「紙」、部品は「道具」として見分けがつくようにするためです。
入力欄は 8px、ボタン・パネルは 12px、HUD・ダイアログは 16px、バッジ・チップは丸にします。

## Components

### 付箋の状態

| 状態   | 見た目                                                        |
| ------ | ------------------------------------------------------------- |
| 選択   | 青い枠を付箋に密着させて描く                                  |
| 注目   | オレンジの点線の枠                                            |
| 決定   | 付箋を 1.1 倍に浮かせ、緑の枠で囲み、右上に丸い「決定」はんこ |
| 候補外 | 影を消し、灰色の点線の縁にする                                |

- **決定は、ボードの中でいちばん目立たせる。** チームで選び切った結果なので、離れて見ても分かるようにします。はんこは白地に緑（`stamp-decided`）で、ラベルや光は足しません。
- **決定の動きは短く。** はんこは大きい状態から約 0.3 秒で縮みながら濃くなり、行き過ぎて戻る動きは付けません。外れるときは静かに消します。決定を次々に押し替えても待たされないようにするためです。
- **枠が重なるときは、選択がいちばん内側。** その外側に決定・注目の枠を描きます。
- **状態は色だけで伝えない。** 点線・はんこの文字・浮き上がりも組にして、色の見え方に差がある人にも伝わるようにします。

### ダイアログ

- **確認型：** 取り消せない操作の前に使います（`AlertDialog`）。見出し・結果の説明・「キャンセル」と実行のボタンで構成します。削除などは実行ボタンを `button-danger` にします。
- **入力型：** 名前の変更など、入力して確定するときに使います（`Dialog`）。見出し・入力欄・確定ボタンで構成します。
- ボタンは右下に「キャンセル → 実行」の順で並べます。

### ボタン

- **主ボタン（`button-primary`）は、画面で次にやること1つだけ。** それ以外の操作やキャンセルは `button-outline`、ツールバーのように並ぶ操作は背景なし（shadcn/ui の `ghost`）にします。
- **押せる部品は高さ 44px 以上。** タッチ操作でも押し間違えないようにするためです。

## Do's and Don'ts（やること・避けること）

- 主色は「次にやること」が分かる場所に絞る。広い面に色を付けたくなったら、`primary-soft` か白にする。
- フェーズが変わっても、主ボタンと選択の色は変えない。フェーズの違いはステップの番号や見出しで示す。
- 付箋には常時の枠線を付けず、作者色と影で見分ける（PRD §9）。枠は状態を示すときだけに使う。
- 文字は背景に対して 4.5:1 以上、状態を示す枠線は 3:1 以上のコントラストにする。

## 決まり具合

この文書のうち、まだ実装に入っていないものです。実装したら行を消します。

| 項目                               | 今の実装                               | 扱う Issue |
| ---------------------------------- | -------------------------------------- | ---------- |
| 主色・文字と面の色をトークンにする | shadcn/ui 既定の無彩色                 | #876       |
| 注目をオレンジにする               | 注目・決定ともに緑                     | #876       |
| 日本語フォント                     | Geist（ラテン文字のみ）                | #876       |
| 角丸・影の段階を絞る               | 7種類以上が混在                        | #876       |
| 色・角丸の直書きをどこまで許すか   | 未定                                   | #877       |
| 12px 未満の文字をなくす            | `text-[10px]` などが数か所             | #876       |
| 文字の標準を 16px にする           | 14px が中心。付箋の文字の初期値も 14px | #876       |
| 決定をはんこと浮き上がりで示す     | 太い緑の枠と右下の丸いチェック         | #876       |
| 決定・注目の付箋にも選択の枠を出す | 決定・注目のときは選択の枠が出ない     | #876       |
