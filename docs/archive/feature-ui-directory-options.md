# feature 内 UI の置き方 — 選択肢の比較（決定記録）

> 過去資料：2026年7月の比較・検証全文。現行規約ではない。採用結果は[ADR 0003](../adr/0003-feature-bands.md)。

status: **決定・移行済み（決定 2026-07-13、移行完了 2026-07-14）—
C′「依存権の帯」方式を採用**。決定の要点と運用は
[feature-internal-structure.md](feature-internal-structure-2026-07.md) が真実。
本ファイルは検討過程（案の比較・攻撃的検証・先行事例調査）の記録として
凍結する。
なお本文中の「C′ は nesting 併用が前提」という記述は不採用になった:
チームの判断は「5 箱に分散すれば 1 箱あたりの衛星ノイズは許容範囲」で、
fileNesting 設定は削除済み。以下は話し合い当時の検討内容をそのまま残す。

## 決めたいこと

衛星ファイル（spec / stories / fixture）によって `ui/` の見た目のファイル数が
実装の約 2.7 倍になる問題（実測: `features/room/ui` は実装 7 / 全 19）への
恒久対策として、どの機構を採るか。

先に共有したい前提が 2 つある。

1. **これは正しさの問題ではなく、ナビゲーションの快適さの問題。**
   壊れているものはない。だから判断基準は「移行コスト・規約の複雑化と
   釣り合うか」であって、「どれが正しいか」ではない。
2. **Atomic 階層（案 C）はこの問題を解決しない。** 箱あたりのファイル数は
   減るが、衛星は実装と同居させる規約のため倍率 ×2.7 は不変。案 C を
   選ぶなら「粒度カタログが欲しい」という**別の理由**で選ぶことになり、
   その欲求には Storybook（実物のカタログ）が既に答えている。

## 選択肢

### 案 A: 現状維持（フラットな ui/ + エディタの fileNesting）

`.vscode/settings.json` の `explorer.fileNesting` で衛星を実装ファイルの
配下に畳む（設定済み）。

- 長所: 変更ゼロ。規約・ast-grep ルール・import パスが今のまま。
- 短所: **IDE 依存**。効くのは VS Code の画面だけで、GitHub の Web
  レビュー・他エディタ・ターミナルでは 19 ファイルのまま。

### 案 B: コンポーネントごとのディレクトリ

```
features/room/ui/
  room-timer/
    room-timer.tsx
    room-timer.spec.tsx
    room-timer.stories.tsx
    room-timer.fixture.ts
  room-board/
    room-board.tsx
    room-board.spec.tsx
  ...
```

- 長所:
  - **IDE 非依存**。GitHub でもターミナルでも `ui/` には実装数と同じ
    エントリしか並ばない。
  - **判定器が機械的**（ディレクトリ名 = ステム、中身は同ステムの衛星
    のみ）。Atomic と違い「これはどの箱か」の主観判断が発生せず、
    ast-grep やスクリプトで検査できる。
- 短所・懸念:
  - **ast-grep 境界ルールの改修が必要。** 現行ルールは「feature 内は
    深さ 2 まで」を前提に、サブディレクトリからの `../../` を一律禁止して
    いる（`feature-dependencies-one-way.yml`）。`ui/room-timer/` から
    `../../logic/use-room-state` を import した瞬間 CI が落ちるので、
    「`../../logic/`・`../../ui/` のみ許可、それ以深は禁止」への
    書き換えが要る。書けるが、正規表現が複雑になり fail-closed の
    単純さを少し失う。
  - **クリック深度が 1 段増える**（feature → ui → 箱 → ファイル）。
    2 ファイルしかない dialog にも箱ができる。
  - **git の移動 churn。** 全 UI ファイルの move diff が 1 回入り、
    進行中ブランチとコンフリクトする。

### 案 C: Atomic 階層 + logic/（molecules / organisms / templates + logic）

- 長所: 部品の粒度がディレクトリ名から読める（人間の直感に合う）。
  Atomic 経験者には親しみやすい。
- 短所・懸念:
  - **今回の課題（衛星倍率）を解決しない**（前提 2）。
  - molecule / organism 境界に機械判定器がなく、AI がコードを書く前提で
    CI 強制できない（[feature-internal-structure.md](feature-internal-structure-2026-07.md) §2）。
  - 分類判断が 2 重になる（粒度の箱 + ui / logic の役割）。同 §1。
  - container（room-board.tsx 等）に箱がない。同 §1。

## 比較表

C′（依存権の帯方式。後述）を含めた 4 案で比較する。

| 観点                               | 案 A 現状 + nesting | 案 B component dir          | 案 C Atomic 素朴                | 案 C′ 依存権の帯           |
| ---------------------------------- | ------------------- | --------------------------- | ------------------------------- | -------------------------- |
| 衛星の見通し（VS Code）            | ○                   | ○                           | △（倍率不変）                   | ○（nesting 併用が前提）    |
| 衛星の見通し（GitHub・他エディタ） | ✕                   | ○                           | ✕                               | ✕                          |
| 境界の機械検査                     | ○（現行のまま）     | ○（要・検査スクリプト新設） | ✕                               | ○（ast-grep 4 規則の追加） |
| 新規ファイル 1 つあたりの分類判断  | 1 回（ui か logic） | 1 回                        | 2 回（役割 + 粒度）             | 1〜2 回（既定: 最下帯）    |
| クリック深度（実装ファイルまで）   | 2                   | 3                           | 2                               | 2                          |
| 導入コスト                         | 0                   | 中（ルール改修 + 一括移動） | 大（移動 + 境界基準の合意文書） | 中（移動 + ルール 4 本）   |

## 実地検証: room に両案を当てて、弱点を全部並べる

抽象論だと好みの争いになるので、最大の feature である room
（UI 実装 7 / logic 実装 7）に B と C を実際に当てて、起きることを
両方とも容赦なく並べる。行数は実測
（force-next-phase-dialog 60 / leave-confirm-dialog 84 / room-lobby 124 /
room-board 187 / room-lobby-view 242 / room-timer 357 / room-board-view 613）。

### C を room に当てると

```
features/room/
  molecules/   leave-confirm-dialog, force-next-phase-dialog   … 部品 2 + 衛星 3
  organisms/   room-timer                                      … 部品 1 + 衛星 3
  templates/   room-board-view, room-lobby-view                … 部品 2 + 衛星 4
  ???/         room-board, room-lobby（container。箱がない）   … 部品 2 + 衛星 2
  logic/       実装 7 + spec 6
```

1. **分類が確定しない。** leave-confirm-dialog（84 行、shadcn の
   AlertDialog に文言を被せただけ）は molecule か、それとも
   「ラッパーは atom 相当」か。room-timer（357 行、表示 + ホスト操作）は
   organism か molecule か。旧構成（PR #128 以前）で room-timer は
   organisms/ にいたが、それは基準があったからではなく誰かがそう
   置いたからで、当時の基準文書は存在しない。
2. **container の箱が Atomic に存在しない。** `containers/` を発明すれば
   Atomic 語彙の外の 6 箱目。`templates/` に同居させれば「Storybook に
   載る view」と「載らない配線」が同じ箱に混ざり、箱の意味が壊れる。
   **経験者の直感が通用しない場所（container / view、logic、feature
   縦割り）こそ、このリポジトリの規約の本体**で、そこでは全員が初心者になる。
3. **import の実測が「箱の階段 = 流れ」を否定する。**
   `room-board-view.tsx`（C では template）の実物の import は:
   LeaveConfirmDialog（molecule を**直**。organisms を飛ばす）、
   RoomTimer（organism）、shadcn の Button / AlertDialog / Dialog
   （atom 相当を**生で**）、他 feature の部品 8 個（StickyNote、NoteCard、
   PrivateNotesToolbar…）、logic 2 ファイル。
   templates → organisms → molecules → atoms の階段を順に通る import は
   **1 本もない**。しかもこれは実装の手抜きではなく、Brad Frost の
   Atomic でも正しい形（階層を経由させる方がアンチパターン）。
   箱を作っても import は箱を無視して飛び交うので、「箱の並びで流れが
   見える」は room の実物で既に嘘になっている。
4. **元の課題（衛星倍率）が丸ごと残る。** C の `molecules/` を開くと
   実装 2 + spec 2 + stories 1 の 5 ファイルが並ぶ。つまり
   **C は B の対抗案ではない**。C を選んでも「spec / stories で見通しが
   悪い」は未解決のまま残り、A（nesting）か B（箱）かの議論が
   もう一周来る。両方やる（molecules/leave-confirm-dialog/…）なら
   深さ 4 の二重箱で、さすがに誰も守れない。
5. **粒度情報はすでにファイル名が持っている。** `-dialog`、`-view`、
   `-card`、`-timer` のサフィックス規約が粒度と役割を名前で運んでいる。
   molecules と organisms のどちらが大きいかは Atomic の語彙を知らないと
   分からない（分子 < 生物、は自明ではない）ので、新メンバーにとっては
   箱の方がむしろ暗号になる。

### B を room に当てると

```
features/room/ui/
  force-next-phase-dialog/ (3)   leave-confirm-dialog/ (2)
  room-board/ (2)                room-board-view/ (3)
  room-lobby/ (2)                room-lobby-view/ (3)
  room-timer/ (4)
```

1. **買えるものは「19 行が 7 行になる」だけ。** フラットな ui/ は既に
   ステム順ソートで、衛星は実装の真下に並んでいる。散らかっているのでは
   なく縦に長いだけで、その圧縮のために全ファイル移動と ast-grep 改修を払う。
2. **どの質問にも新しく答えない。** 「タイマーはどこ」→ 今も
   `room-timer.tsx` で一目。「room-timer は大きい部品か」→ B でも
   分からない（これに答えるのは C だけ。ただし C 側の 5 の通り
   サフィックスと Storybook が既に答えている）。「誰が誰を使うか」→ B でも分からない
   （依存図の仕事）。B は情報を増やさない。ノイズを減らすだけ。
3. **パスが吃音になる。** `features/room/ui/room-timer/room-timer.tsx`。
   room が 2 回、timer が 2 回。import は `./room-timer/room-timer`。
   毎日書く行が確実に不格好になる。
4. **判定器はあるが、検査装置はタダではない。** 「箱名 = 中身のステム」は
   ast-grep では書けない（import 文の検査器で、ファイル配置の検査器では
   ない）。CI 用の検査スクリプトを新規に書いて保守することになる。
   書かなければ `ui/helpers/` のような雑な箱の発生を止められない。
   現行構成では「規約外サブディレクトリ = 即 CI 落ち」という fail-closed が
   **タダで**手に入っており、B はこの安全装置を自作し直す話でもある。
5. **クリック +1 は永続コスト。** 2 ファイルしかない
   `leave-confirm-dialog/` の箱を、この先ずっと開き続ける。

### 「Atomic に慣れた 2 人には見通しが良い」への正面回答

1. その直感は本物の資産。ただし**移転できない**。linter にも、コードの
   相当量を書く AI にも、Atomic を知らない新メンバーにも宿らない。
   判定を直感に置いた瞬間、規約の強制手段は「2 人のレビュー注意力」だけになる。
2. 2 人が慣れているのは標準の Atomic。このリポジトリで動かすのは
   container / view・logic・feature 縦割りが混ざった**方言**で、
   直感が一番必要な場所（container の箱、logic との境界）ほど
   標準の経験が効かない。
3. 「見通しが良い」を分解すると: 粒度ラベル（サフィックス + Storybook が
   提供済み）、部品カタログ（Storybook）、流れ（箱では原理的に見えない。
   依存図が提供）。**欲しいものが本当に「箱」なのか、話し合いで中身を
   特定したい。**
4. 検証可能な提案 → チェックリスト 1 の分類クイズ。主観か客観かを
   その場で 10 分で決着できる。

### 生き残り判定

- **C**: 元の課題（衛星）を解決せず、「流れが見える」は room の実測
  import と矛盾し、境界は 2 人の直感にしか宿らない。選んでも
  衛星問題の議論がもう一周残る。
- **B**: 効果は本物だが薄い（19 行 → 7 行）。代償は移動 churn +
  ルール改修 + 検査スクリプト新設 + 永続クリック。
- どちらも無傷ではないが、性質が違う。**B の弱点は「費用」（払えば
  終わる）、C の弱点は「構造」（払っても解決しない）**。ただし C の
  構造欠陥の大半は、次節の C′ で「費用」に変換できる。

## C を成立させる設計 — C′「依存権の帯」方式

「それでも Atomic の箱を使いたい」場合の、成立しうる唯一の形を設計した。
鍵は、C の急所（分類の機械判定不能）を**判定対象のすり替え**で外すこと。

### 発想の転換: 「何であるか」ではなく「何に依存してよいか」

素朴な C は箱を**本質の分類**として使う（「これは molecule で
ある」）。この命題は大きさ・複雑さという連続量の主観判定なので、
機械検査できず腐る。C′ は箱を**依存権の宣言**に変える:
molecules に置くことは「この部品は organisms / templates /
containers に依存しない」という宣言であり、宣言の真偽（上向き
import の有無）は ast-grep が検査できる。

「これは本当に molecule か」という答えのない問いが、「この import は
宣言に違反していないか」という機械の問いに変換される。レイヤード
アーキテクチャが「これは本当に domain 層か」を機械判定せず、
層間 import 制約だけで運用されて機能しているのと同じ理屈。

### C′ の形（room に当てた実物）

```
features/room/
  index.ts          ← root には公開境界だけが残る
  containers/       room-board, room-lobby
  templates/        room-board-view, room-lobby-view
  organisms/        room-timer
  molecules/        force-next-phase-dialog, leave-confirm-dialog
  logic/            room-reducer, use-* ×3, actions, room-notify, connection-status
```

import 規則は 3 つだけ: **上向き禁止・skip 合法・同帯合法**。

| 箱         | import してよいもの                             |
| ---------- | ----------------------------------------------- |
| containers | templates / organisms / molecules / logic 全部  |
| templates  | organisms / molecules / logic（+ 同帯）         |
| organisms  | molecules / logic（+ 同帯）                     |
| molecules  | logic（+ 同帯）                                 |
| logic      | どの箱も不可（既存の JSX 禁止と合わせて最下層） |

atoms は作らない（リポジトリ全体の atoms は `components/ui/`。
旧構成で atoms/ が空だった実測に従う）。containers は Atomic 語彙の
外だと**方言として明示**する第 4 の箱。

重要な実測が 2 つある。第一に、**現在の room のコードはこの規則に
違反ゼロでそのまま入る**。第二に、帯構造は既にコードの中に存在する:
notes は `private-notes-toolbar → note-card → sticky-note`、
vote-totaling は `panel → row → badge`、dot-vote は
`controls → button` という実測 3〜2 段の依存を持つ。C′ はこの
既存の依存方向に名前のついた箱を与えるもので、新しい秩序を発明しない。
ただし正確には、箱は「依存の**上限**の宣言」であって実測段数の写像では
ない: notes の 3 段チェーンは templates 未満の箱が 2 つしかないため、
note-card は sticky-note と同帯に吸収されうる（同帯合法なので違反では
ない。帯は方向を保証するが、段数までは保存しない）。

実地検証 C-3 の「箱の階段は import 実測と矛盾」という批判は、C′ には
当たらない。room-board-view（templates）が molecules を直 import
するのは skip 合法で正しい形。帯が約束するのは「**上向き import が
存在しないことの CI 保証**」だけで、これは嘘をつかない本物の情報。
「ディレクトリ（木）は DAG を表現できない」という原理批判も、完全な
DAG は無理でも**トポロジカルな帯なら木で表現でき、CI で保証できる**、
というのが C′ の回答になる。

### 機械検査: ast-grep で書ける。しかも B より軽い

- 箱は `ui/` の**置き換え**であって入れ子ではないので、深さは 2 の
  まま。既存の「`../../` で feature の外に出ない」ルールが無改修で
  生きる。B が必要とした深さ 3 対応は不要。
- 素案はエッジ禁止 4 本（molecules/ で
  `../(organisms|templates|containers)/` を禁止、以下同型）だが、
  攻撃的検証でブラックリスト regex の穴が実証された（次項）。
  **採用条件はホワイトリスト型に格上げする**: 各箱で「許可プレフィックス
  （`./`、`../logic/`、`../<同帯以下の箱>/`、`@/`）に一致しない import を
  すべて禁止」を ast-grep の `not` 合成で書く。lookahead は不要。
  ただしこの書き方はまだ PoC しておらず、**移行 PR の最初の作業として
  実証すること**（書けなければ C′ は成立しない、が go/no-go 条件）。
- 規約外サブディレクトリの fail-closed は、ignores の
  `ui|logic` を 5 箱に差し替えるだけで維持される。
- containers を root でなく箱にするのはこの検査可能性のため
  （root 配置だと「箱から root への import 禁止」に否定形 lookahead が
  必要になり書けない。箱なら肯定形で塞げる）。root に index.ts だけが
  残り、公開境界が際立つ副作用もある。
- B と違い、「箱名 = ステム」検査スクリプトの新設も不要。

### 攻撃的検証の結果（2026-07 実施）

C′ の素案を、独立のレビュー（リポジトリの実ファイルでの実証つき）で
本気で壊しに行かせた。結果は「骨格は生存、ただし実穴 4 つ」。

**実証された穴（→ 前項のホワイトリスト化と追加検査で塞ぐ）**

- 【高】**`../index` ロンダリング**: molecules から `../index`（公開境界。
  containers を re-export している）を import すると、帯規則の素案 regex を
  素通しして containers に届く。実際に ast-grep を走らせて無検出を確認済み。
- 【中】**regex 回避 3 形**: `.././containers/`、`..//containers/`、
  barrel（`organisms/index.ts`）を新設しての `"../organisms"`
  （末尾スラッシュなし）。いずれも TS としては正常に解決される。
- 【中】**動的 import は全ルールの死角**: `import("../ui/room-board")` は
  既存の境界ルール全部が見ていない（`import_statement` しか照合して
  いないため）。これは **C′ 固有でなくリポジトリ既存の穴**で、現状の
  実使用はゼロ。A / B を選んでも塞ぐ価値がある独立の改善。
- 【中】**移行過渡期の混在**: `ui/` と `molecules/` が同一 feature に
  共存しても止める検査がない。全 feature 一斉移行とし、
  「旧層と新箱の共存で fail」の検査を移行 PR に先行して入れる。
- 【低】帯検査のカバレッジは features/・app/ 発の import に限る
  （.storybook や scripts からの deep import は未検査。現状該当ゼロ確認済み）。

**塞がっていることが実証された面**

- alias 経由のすり抜け（`@/features/room/molecules/...`）は既存 2 ルールが
  同時捕捉。自 feature の公開境界 `@/features/room` の import も捕捉済み。
- 「room は違反ゼロでそのまま入る」は spec / stories / fixture 込みで真。
- .storybook / vitest / biome / CI に ui・logic のパス前提はなし。stories の
  タイトルは明示指定なので、昇格（箱の移動）で Chromatic は揺れない。

### 先行事例が示すこと（2026-07 調査）

- **C′ と同型の前例が実在する。** `eslint-plugin-atomic-design` の
  `hierarchical-import` ルールは「下位レベルは上位を import 禁止・
  上位は任意の下位を直接 import 可（skip 合法）・`=` 指定で同帯合法」
  という、まさに帯方式（levels はディレクトリ名で宣言）。ただし
  メンテが 2021 年で停滞しているので、採用するなら ast-grep で
  自作するのが妥当。
- **汎用ツールも同じ割り切りをしている。** eslint-plugin-boundaries も
  dependency-cruiser も「所属 = ディレクトリ名（作者の宣言）を真実と
  して、方向だけを機械検査する」設計。一方で**「所属の判定」自体を
  静的解析で機械化した先行事例は見つからなかった**。つまり素朴 C を
  救う技術は存在せず、C′ の「宣言 + 方向検査」への転換が業界の
  収束点と同型ということ。
- **原典も箱を要求していない。** Brad Frost は Atomic を
  "mental model" と位置づけ、分類語彙は他のものでもよいと明言。
  FSD が Atomic を採らなかった公式理由は「ビジネスロジックの置き場を
  定めないから」で、これは C′ が logic/ を残す理由と同じ診断。
- 日本語圏の失敗談（食べログ SP 版での廃止、organisms 約 300 個への
  肥大など）はいずれも**グローバル Atomic ツリー**の失敗で、C′ の
  ような「feature 内の帯 + logic/」構成の長期運用実績は成功例も
  失敗例も見つかっていない。前例のある部品（帯・方向検査）の
  組み合わせではあるが、組み合わせ自体は前例がない——ここは正直に
  共有しておく。

### 置き方のアルゴリズム: 迷ったら一番下、昇格は CI が教える

新規コンポーネントの既定は「**まず molecules に置く**」。上の帯の
部品が必要になった瞬間に上向き import で CI が落ち、昇格を教えて
くれる。判断ゼロで始められ、置き場は使用実態に収束する。

直感で最初から organisms に置くのも**合法**（帯は権利であって義務では
ないので、権利を使わないことに害はない）。つまり分類クイズで 2 人の
答えが割れても、**どちらの答えも合法**でレビューは止まらない。主観は
「間違えると腐る分類」から「どちらでもよい配置の好み」に格下げされる。
分類クイズ（チェックリスト 1）の位置づけも変わる: C′ では不一致が
出ても致命傷ではなく、「既定最下帯アルゴリズムを使う動機の確認」になる。

### 従来の反論は C′ でどうなるか

| 実地検証での反論                 | C′ での状態                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| C-1 分類が確定しない             | **ほぼ解消**: どの箱も合法なら選択は好み。違反だけ CI が止める  |
| C-2 container の箱がない         | **解消**: containers/ を第 4 の箱として方言宣言                 |
| C-3 箱の階段が import 実測と矛盾 | **解消**: 階段を約束せず帯だけを約束する。帯は実測と整合        |
| C-4 衛星倍率が残る               | **残る**: nesting 併用が前提。ここだけは B が構造的に勝つ       |
| C-5 粒度はサフィックスが持つ     | **半分残る**: 箱は冗長だが「CI 保証つき」という点で名前より強い |

### それでも残る費用（正直に）

1. **衛星問題は未解決。** nesting（IDE 依存）を受け入れることが C′ の
   前提条件になる。GitHub の Web では molecules/ に 5 ファイル並ぶ。
2. **昇格の churn は残る。** X を organisms に上げると X を import
   していた molecules も違反になり連鎖する。同帯合法で頻度は下がるが
   ゼロではない。CI が違反を全部列挙するので追従は機械的にできる。
3. **帯の保証は feature 内限定。** 他 feature の部品は index.ts 経由で
   molecules からでも import できる（feature 間は feature DAG が真実）。
   「molecule が他 feature の大きなツールバーを含む」ことは合法なので、
   帯を「大きさの保証」と読むとズレる。帯は依存方向の保証であって
   大きさの保証ではない、と全員が了解しておく必要がある。
4. **移行作業**: ホワイトリスト規則の PoC（go/no-go 条件）→ 導入、
   旧層・新箱の共存禁止検査の先行導入、全 UI ファイルの git mv、
   ignores 差し替え、既存ルール内メッセージ文言の改訂（「コンポーネントは
   ui/ へ」等）、AGENTS.md と feature-internal-structure.md の改訂、
   dependency-graph.mts の layerOrder を帯順
   （containers → templates → organisms → molecules → logic）へ変更。
   stories のタイトルは既に明示指定なので追加作業なし（昇格で
   Chromatic は揺れない。攻撃的検証で確認済み）。
5. **フラット feature の扱いの決め**が要る。推し: feature 単位で
   「フラット or 5 箱」の二択にし、混在を禁止する（「molecules/ が
   存在する feature の root に .tsx を置かない」は機械検査できる）。

### C′ 判定

C の「構造の問題」（検査不能・container 不在・流れの嘘）は C′ で
費用の問題に変換できる。B との残差はこうなる:

- **C′ が B に勝る点**: ルール改修が軽い（深さ不変・スクリプト新設
  不要）、パスの吃音なし、クリック深度は現状同等、そして Atomic に
  慣れた 2 人の直感資産が活きる。
- **C′ が B に劣る点**: 衛星問題を解決しない（nesting = IDE 依存の
  受容が前提条件）。

つまり最終判断は 1 点に絞られる:
**「GitHub 等の素のファイル一覧で衛星が畳まれていないことを許容
できるか」。許容できるなら C′ は成立する。できないなら B。**

## 案 B を採る場合の実装メモ（懸念の潰し方）

1. **箱は一律に作る**（閾値制にしない）。「衛星 N 個以上なら箱」は
   ファイルが増えるたびに再分類が発生し、Atomic の弱点（成長のたびの
   移動コスト）の縮小再生産になる。一律なら判断ゼロ。
2. **container と view は別箱**（`room-board/` と `room-board-view/`）。
   view は container の衛星ではなく、stories を持つ独立部品。ステムの
   前方一致でソート上は隣に並ぶので、往復の実害は小さい。
3. **箱ごとの index.ts は作らない。** feature ルートの `index.ts`
   （公開境界）と意味が紛れる。feature 内 import は
   `./room-timer/room-timer` とフルで書く。
4. **`index.tsx` 方式（箱の中のファイル名を index にする）は採らない。**
   エディタのタブが index.tsx だらけになり、grep も効かなくなる。
   `room-timer/room-timer.tsx` の重複は許容する。
5. **logic/ は当面フラット維持。** stories / fixture がないため倍率が低い
   （room で実装 7 / 全 13）。ui/ で運用して良ければ広げる。
   「ui/ 配下だけ箱」も機械的な条件なので判断は増えない。
6. `scripts/dependency-graph.mts`（依存図生成）と Storybook の glob が
   深さ 3 を扱えるかを移行前に確認する。
7. **移行は 1 PR で全 feature 一括。** 「試しに 1 feature だけ」を merge
   すると 2 流派が併存し、人にも AI にも「どちらに合わせるか」の判断が
   毎回発生する。見た目を試すだけならブランチで room を移行して確認し、
   merge は一括で。
8. 採用したら `.vscode` の fileNesting 設定は削除する（役目が終わる）。

## 私の考え

- **Atomic の語彙を使いたいなら、素朴 C ではなく C′ を土台に議論する
  こと。** 素朴 C（本質分類）は検査不能で救う技術も存在しない（先行
  事例調査）。C′（依存権の帯）なら機械検査でき、現行コードも違反ゼロで
  入る。そのうえで最終分岐は 1 点:
  **衛星の見通しを GitHub 等の素の一覧でも欲しいなら B、
  VS Code の nesting で足りるなら C′ か A**。ここは思想でなく
  「どこでファイル一覧を見るか」の事実で決まる。
- **一番の懸念は個別案ではなくメタな点。** 構成の議論はこの 1 か月で
  3 回目で、構成替えのたびに全ファイル移動の diff・進行中ブランチとの
  コンフリクト・規約の学び直しが発生している。どの案に決めても
  「1 回で移行し、**数値の再検討トリガーを明文化して蒸し返さない**」を
  セットにしたい（例: feature-internal-structure.md §5 の形式）。
- **AI 開発の観点では A と B はほぼ等価。** エージェントは素の
  ファイルシステムを見るので、nesting の恩恵も箱の深さの害もほぼない。
  素朴 C だけが「新規ファイルごとの粒度判断」という恒常コストを足す。
  C′ は「既定は最下帯、CI が昇格を教える」のアルゴリズムで
  この判断コストを定数化できるので、AI 観点でも許容範囲に入る。
- **見通しへの効きが一番大きいのは、実はどの案でもない可能性がある。**
  `room-board-view.tsx` は 1 ファイルで 613 行あり、ここの分割
  （ツールバー・ボード面の切り出し）の方が「room が見通せない」体感への
  効果は大きいはず。ディレクトリ機構の議論と混ぜず、別作業として
  積んでおきたい。

## 話し合いで決めるチェックリスト

1. **最初に分類クイズ（10 分）**: room の UI 実装 7 ファイル
   （60〜613 行）を、Atomic に慣れた 2 人が**相談なしで**それぞれ
   molecules / organisms / templates（+ container の置き場）に分類し、
   突き合わせる。**全問一致なら「境界は主観」という本ドキュメントの
   主張は弱まるので、C の検討を続けてよい。** 1 問でも割れたら、
   その割れは今後の毎 PR で起きるものとして C を判断する。
   なお C′ を採る場合、このクイズは致命判定ではなくなる
   （どちらの答えも合法になるため。「既定最下帯」アルゴリズムを
   使う動機の確認として実施する価値は残る）。
2. GitHub Web レビュー・VS Code 以外の環境をどれだけ使うか
   （= IDE 非依存の重み。ここが B か、A / C′ かの分岐点。
   C′ は nesting 併用＝IDE 依存の受容が前提条件）
3. B の場合: 箱は一律か、閾値制か（推し: 一律）
4. B の場合: container と view は同箱か別箱か（推し: 別箱）
5. B の場合: logic/ にも適用するか（推し: 当面 ui/ のみ）
6. C′ の場合: 同帯 import 合法・既定最下帯・「フラット or 5 箱」の
   feature 単位二択、の 3 点を規約として確認する
7. 決定の再検討トリガーを数値でどう書くか

## 関連する未解決事項（このスコープの外）

- `room-board-view.tsx`（613 行）の分割。どの案を選んでも別途必要。
- `leave-confirm-dialog.tsx` に stories がない（props in / callback out の
  純粋な view なのに「全 UI に stories 必須」の規約とズレている。
  ついでに直せる）。

## 参考（先行事例・出典）

- eslint-plugin-atomic-design（帯方式の import 強制の前例）:
  <https://github.com/RyoNkmr/eslint-plugin-atomic-design>
- eslint-plugin-boundaries / dependency-cruiser（層宣言 + 方向検査の汎用形）:
  <https://github.com/javierbrea/eslint-plugin-boundaries> /
  <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>
- Brad Frost, *Atomic Design* Chapter 2（mental model の一次情報）/
  Atomic Design and Storybook（分類語彙は任意との明言）:
  <https://atomicdesign.bradfrost.com/chapter-2/> /
  <https://bradfrost.com/blog/post/atomic-design-and-storybook/>
- Feature-Sliced Design が Atomic を採らない公式理由:
  <https://feature-sliced.design/docs/about/alternatives>
- グローバル Atomic ツリーの失敗談: 食べログ
  <https://note.com/tabelog_frontend/n/n07b4077f5cf3> /
  organisms 肥大の実例 <https://zenn.dev/kazuyakk/articles/3cda9e11454613>
