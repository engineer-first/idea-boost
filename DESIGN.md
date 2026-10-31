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
  grid-dot: "#D6E2F5"
  state-select: "#035EDE"
  state-focus: "#C2410C"
  state-decided: "#16803F"
  state-excluded: "#5F6C81"
  warning: "#B45309"
  danger: "#D92D4A"
  success: "#16803F"
  note-ink: "#0F172A"
  note-yellow: "#F4D35E"
  note-green: "#94C97E"
  note-blue: "#88BDF2"
  note-pink: "#F39AB5"
  note-orange: "#F5AA63"
  note-purple: "#B6A0E2"
  note-red: "#E8817B"
  note-lime: "#C3D76B"
  note-teal: "#6BC7BC"
  note-cyan: "#8BD5E5"
  note-indigo: "#8996D8"
  note-violet: "#CDACEA"
  note-fuchsia: "#D991CF"
  note-rose: "#DB7698"
  note-amber: "#DDB65A"
  note-emerald: "#66B994"
  note-sky: "#65ACCE"
  note-slate: "#A993C6"
  note-stone: "#C69B72"
  note-zinc: "#9BAE68"
typography:
  headline-display:
    fontFamily: Zen Maru Gothic
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.3
  headline-lg:
    fontFamily: Zen Maru Gothic
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.4
  headline-md:
    fontFamily: Zen Maru Gothic
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.5
  body-lg:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
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
  numeric:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.4
    fontFeature: '"tnum" 1'
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  note-width: 200px
  note-height: 150px
  note-gap: 24px
rounded:
  none: 0px
  note: 2px
  sm: 6px
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
  chip-current-step:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
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
  sticky-note:
    backgroundColor: "{colors.note-yellow}"
    textColor: "{colors.note-ink}"
    typography: "{typography.note-body}"
    rounded: "{rounded.note}"
    width: "{spacing.note-width}"
    height: "{spacing.note-height}"
  sticky-note-yellow:
    backgroundColor: "{colors.note-yellow}"
    textColor: "{colors.note-ink}"
  sticky-note-green:
    backgroundColor: "{colors.note-green}"
    textColor: "{colors.note-ink}"
  sticky-note-blue:
    backgroundColor: "{colors.note-blue}"
    textColor: "{colors.note-ink}"
  sticky-note-pink:
    backgroundColor: "{colors.note-pink}"
    textColor: "{colors.note-ink}"
  sticky-note-orange:
    backgroundColor: "{colors.note-orange}"
    textColor: "{colors.note-ink}"
  sticky-note-purple:
    backgroundColor: "{colors.note-purple}"
    textColor: "{colors.note-ink}"
  sticky-note-red:
    backgroundColor: "{colors.note-red}"
    textColor: "{colors.note-ink}"
  sticky-note-lime:
    backgroundColor: "{colors.note-lime}"
    textColor: "{colors.note-ink}"
  sticky-note-teal:
    backgroundColor: "{colors.note-teal}"
    textColor: "{colors.note-ink}"
  sticky-note-cyan:
    backgroundColor: "{colors.note-cyan}"
    textColor: "{colors.note-ink}"
  sticky-note-indigo:
    backgroundColor: "{colors.note-indigo}"
    textColor: "{colors.note-ink}"
  sticky-note-violet:
    backgroundColor: "{colors.note-violet}"
    textColor: "{colors.note-ink}"
  sticky-note-fuchsia:
    backgroundColor: "{colors.note-fuchsia}"
    textColor: "{colors.note-ink}"
  sticky-note-rose:
    backgroundColor: "{colors.note-rose}"
    textColor: "{colors.note-ink}"
  sticky-note-amber:
    backgroundColor: "{colors.note-amber}"
    textColor: "{colors.note-ink}"
  sticky-note-emerald:
    backgroundColor: "{colors.note-emerald}"
    textColor: "{colors.note-ink}"
  sticky-note-sky:
    backgroundColor: "{colors.note-sky}"
    textColor: "{colors.note-ink}"
  sticky-note-slate:
    backgroundColor: "{colors.note-slate}"
    textColor: "{colors.note-ink}"
  sticky-note-stone:
    backgroundColor: "{colors.note-stone}"
    textColor: "{colors.note-ink}"
  sticky-note-zinc:
    backgroundColor: "{colors.note-zinc}"
    textColor: "{colors.note-ink}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
  panel-caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
  board:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  board-selection:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.state-select}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  notice-warning:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
  notice-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
---

# IdeaBoost DESIGN.md

IdeaBoost の画面を、人も AI エージェントも同じ基準で作るための文書です。
先頭の YAML がトークンの値、本文がその使い方と理由です。値を変えるときは両方をそろえます。

各項目には決まり具合を付けています。

- **採用**：決定済み、またはすでに実装されている。
- **仮**：方向は決めたが、実装や実画面での確認がまだ。
- **未検証**：仮説。確かめてから採用か取り下げかを決める。

形式は [Google Labs の DESIGN.md](https://github.com/google-labs-code/design.md)（alpha）に合わせています。`npx @google/design.md lint DESIGN.md` で、参照切れとコントラストを検査できます。

## Overview

**ひらめきが次々に出て、チームで選び切れる。** IdeaBoost の見た目は、この体験を支えるためにあります。

対象は、アイデア出しに慣れていない初学者のチームです（[PRD](docs/prd.md)）。自由なホワイトボードではなく、迷わず進める「道案内」を提供します。そのため見た目は次の3つを大事にします。

- **主役は付箋と人。** 白いボードの上で、作者色の付箋がいちばん目立ちます。UI の枠は白基調で静かにし、FigJam のような落ち着きを保ちます。
- **主色は「次にやること」を照らす。** 主色の青は、主ボタン・現在のステップ・選択・投票など、今触る場所だけに使います。面積を小さくするほど、道案内として効きます。
- **ワクワクは、角の丸さと小さな黄色で出す。** 見出しの丸ゴシック、丸みのある部品、LP のマーカーの黄色で、硬すぎない楽しさを出します。

画面ごとの比重は次のとおりです。

- **LP・成果画面**は表現を豊かにしてよい。黄色のマーカーや付箋のイラストで、ワクワクを前に出します。
- **ルームの作業ボード**は、付箋と次の行動が主役です。ブランドの装飾は控えます。

テーマはライトだけです。OS の暗色設定には追従しません（PRD §9）。

決まり具合：採用（#840 の投票で C 案、2026-10-31 の選定で主色を青寄りに変更）。

## Colors

色は「役割」で選びます。同じ値でも意味が違えば別のトークンにします。後から片方だけ変えられるようにするためです。

### ブランド

- **主色 Boost Blue（`primary` `#035EDE`）：** OKLCh の色相 260°。主ボタン、現在のステップ、選択枠、投票、リンクに使います。白地とのコントラストは 5.74:1 です。
  - 選んだ理由：「青はとっつきやすく、はっきりしていて目に優しい」という声がありました。紫寄り（279° `#5B4CF0`）は「賢そう」「よくある SaaS の青紫」に見えていました。
  - 決まり具合：採用（[#841 Phase 0](https://github.com/engineer-first/idea-boost/issues/841)）。名前の「Boost Blue」は仮です。
- **主色の濃い色（`primary-strong`）：** ホバー時と、淡い面に乗る文字に使います。
- **主色の淡い色（`primary-soft`）：** 現在のステップや選択中の行など、小さな面の背景に使います。
- **アクセントの黄（`accent` `#FFCF4A`）：** LP の見出しのマーカーなど、ワクワクを出す小さな面に使います。文字は `on-accent` の濃い色を乗せます。白い文字は乗せません（コントラストが足りないため）。決まり具合：仮。

### 文字と面

- **本文（`ink`）** は、黒ではなく主色の色相を少し含んだ濃紺です。主色と並んだときに、本文だけが浮かないようにするためです。
- **補足（`muted`）** は白地で 6.37:1 あり、注記にも使えます。
- **面（`surface` / `canvas`）：** パネルは白、ボードは主色の色相をわずかに含む白です。
- **線（`line`）・ボードの点（`grid-dot`）：** 区切りや格子に使い、主張させません。

決まり具合：仮。現行の実装は shadcn/ui 既定の無彩色です。トークンを `globals.css` に入れる #876 で置き換えます。

### 状態

状態色は役割ごとに1色にし、同時に出る色を増やしません。#840 で「鮮やかな色が4つ同時に出るとやかましい」という声があったためです。

| 状態                   | トークン         | 色                 | 白文字とのコントラスト | 理由                                                                               |
| ---------------------- | ---------------- | ------------------ | ---------------------- | ---------------------------------------------------------------------------------- |
| 選択（操作）           | `state-select`   | 主色と同じ青       | 5.74:1                 | 「今触っている」は主色の役割                                                       |
| 注目（採用フォーカス） | `state-focus`    | オレンジ `#C2410C` | 5.18:1                 | 「注意を向ける」色として一般的。黄より好まれた                                     |
| 決定                   | `state-decided`  | 緑 `#16803F`       | 5.01:1                 | 成功・完了を緑で表すのが多くの人の共通認識（Primer、Atlassian、Carbon なども同じ） |
| 候補外                 | `state-excluded` | 青みの灰 `#5F6C81` | 5.32:1                 | 作者色を薄く残し、誰の案かは追えるようにする                                       |

- 決定を黒や青にしない理由：黒は「重い」、青は主色と区別しにくく「まだ操作中？」に見える、という声がありました。
- `state-select` と `primary` は今は同じ値です。作者色の青・空色・藍色の付箋の上で選択が見えにくくならないかを確かめ、必要なら値を分けます（未検証）。

決まり具合：採用（#841 Phase 0）。現行の実装は、選択が `blue-500`、注目と決定が緑（`emerald`）です。注目のオレンジへの置き換えは #876 で行います。

### 業務状態

注意（`warning`）、危険（`danger`）、成功（`success`）は、通知や削除ボタンに使います。`success` は決定と同じ緑にそろえ、「良い結果＝緑」を画面全体で統一します。決まり具合：仮。

### 作者色（付箋）

付箋の色は、誰が書いたかを示します。保存上の色 ID（`contracts` の `NoteColor` 20種）は変えずに、表示色だけをここで決めます。

- 表示色の正本は `features/room-members/logic/note-color.ts` です。YAML の `note-*` はその写しです。
- 付箋の文字は、すべて共通の濃い色（`note-ink` `#0F172A`）にします。
- 色だけで人を見分けさせません。付箋・アバター・カーソルには名前を必ず添えます。
- 20色を一律に淡くはしません。#840 の検証で、淡くすると見分けがつきにくい組が増えたためです。

決まり具合：採用（現行の実装）。C 案で試した「少しだけ明るくする」は未検証です。

## Typography

日本語の読みやすさを最優先にします。現行の `Geist` はラテン文字だけなので、日本語は OS 任せになっています。

- **見出し：Zen Maru Gothic（丸ゴシック）。** 角の丸さで、硬すぎない楽しさを出します。LP とダイアログの見出しに使い、作業ボードの小さな文字には使いません。
- **本文・ラベル：Noto Sans JP。** 小さいサイズでも潰れにくく、Windows・macOS・Android で見え方がそろいます。
- **数字：** タイマーや票数は `numeric`（等幅数字 `tnum`）にして、桁が変わっても横にずれないようにします。
- **付箋の本文：** 14px、行の高さ 21px（`note-body`）。現行の付箋の寸法と合わせています。
- **太さ：** 400 と 700 の2つに絞ります。

決まり具合：仮。書体の読み込みと、サイズを実画面で確かめるのは #876 で行います。

## Layout

4px を最小単位にし、`xs`〜`2xl` の段階で余白を取ります。間隔をそろえると、付箋の並びと UI の部品の両方が整って見えます。

- **付箋：** 幅 200px・高さ 150px（`contracts/board.ts` の `NOTE_WIDTH` / `NOTE_HEIGHT`）。並べるときの間隔は 24px です。決まり具合：採用（現行の実装）。
- **作業ボード：** ボードを画面いっぱいに広げ、操作部品（HUD）はボードの四隅に浮かべます。HUD とボードの内容が重ならないよう、端に余白を確保します。
- **LP・成果画面：** 読み物として幅を絞り、余白を多めに取ります。

確認する見え方：20人の参加、長文の付箋、縮小表示、狭い画面幅。

決まり具合：仮（付箋の寸法は採用）。

## Elevation & Depth

奥行きは「紙」と「浮いた道具」の2種類だけにします。

- **付箋＝机に貼った紙。** 下辺からだけ影がはみ出し、端がわずかに浮いて見えます。付箋ごとに影の出方を少し変え、並べたときに人工的に見えないようにしています。ドラッグ中は浮きを大きくします。実装は `features/notes/logic/note-shadow.ts` です。決まり具合：採用（現行の実装）。
- **HUD・メニュー・ダイアログ＝ボードの上に浮いた道具。** 柔らかく広い影を1種類だけ使います。主色の色相を含んだ影にすると、白い面になじみます。決まり具合：仮。現行は `shadow-sm`〜`shadow-2xl` と任意値が混在しています。#876 で段階を絞ります。
- **候補外の付箋** は影を消し、点線の縁にします。「今は選ばれていない」ことが、色を変えずに伝わります。

透明度を下げる設定（`prefers-reduced-transparency`）では、HUD のすりガラスを不透明な白にします（`app/globals.css`）。

## Shapes

付箋は角をほぼ立て、UI の部品は丸くします。付箋は「紙」、部品は「道具」として見分けがつくようにするためです。

| 対象                         | トークン | 値     | 決まり具合         |
| ---------------------------- | -------- | ------ | ------------------ |
| 付箋・成果カード             | `note`   | 2px    | 採用（現行の実装） |
| バッジの内側の小さな面       | `sm`     | 6px    | 仮                 |
| 入力欄                       | `md`     | 8px    | 仮                 |
| ボタン・パネル               | `lg`     | 12px   | 仮                 |
| HUD・ダイアログ              | `xl`     | 16px   | 仮                 |
| 状態バッジ・チップ・アバター | `full`   | 9999px | 仮                 |

現行は `rounded-sm` から `rounded-2xl`、任意値まで7種類以上が混在しています。#876 でこの段階に寄せ、#877 で任意値をどう扱うかを決めます。

## Components

部品の型（ダイアログ2種、ボタンの使い分け、付箋の状態の重ね方）は、#841 の Phase 2 で書きます。

先頭の YAML には、コントラストを検査するための最小限の部品だけを入れています。

- 主ボタン・危険ボタン
- 現在のステップのチップ
- 黄色のマーカー
- 状態バッジ3種
- 付箋（作者色20色それぞれと付箋の文字色の組）
- パネル・ボード・通知の文字

### 付箋の状態の示し方（要点）

状態は色だけで伝えません。「✓決定」「注目」「候補外」の文字バッジと、縁の線の種類を組にします。赤と緑の色覚特性がある人にも、決定が伝わるようにするためです。

状態は3つの層に分けて示します。決定済みの付箋を選択しても、両方が見えるようにするためです。

- **結果**（注目・決定・候補外）：付箋の縁の線種と、文字バッジで示す。
- **操作**（選択）：外側の枠と、四隅のハンドルで示す。
- **キーボードフォーカス**：さらに外側のリングで示す。

決まり具合：仮。図の例と、同時に起きたときの優先順位は Phase 2 で書きます。

## Do's and Don'ts

迷ったときの判断の目安です。避けたいことには、代わりにすることを組にしています。

- 主色は、1画面で「次にやること」が分かる場所に絞って使う。装飾や広い面に使いたくなったら、`primary-soft` か白にする。
- 状態は、文字バッジと線種と色の3つを組にして示す。
- フェーズが変わっても、主ボタンと選択の色は変えない。フェーズの違いは、ステップの番号や見出しなど小さな面で示す。
- 付箋には常時の枠線を付けず、作者色と影で見分ける（PRD §9）。枠は状態を示すときだけに使う。
- 文字の色は背景に対して 4.5:1 以上、枠線とアイコンは 3:1 以上にする。白文字のバッジも 4.5:1 を確かめる。
- 色は `className` に直接書かず、このファイルのトークン（`globals.css` に入る変数）から使う。作者色のように表示色の定義元が別にあるものは、そこから参照する。
