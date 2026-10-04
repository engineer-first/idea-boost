# キャンバス操作の比較調査（2026-10-04）

目的は、Idea Boostの進行・非公開メモ・投票を保ったまま、初学者が入力を予測できる最小モデルを選ぶこと。競合の全機能を取り込む調査ではない。規範は[キャンバス操作仕様](../product/canvas-interactions.md)。以下は確認時点の根拠であり、将来の競合変更に追従する正本ではない。

## 方法・確度

2026-10-04に公式ヘルプ/開発者資料を確認。D=公式文書にある挙動、O=表示/取得した媒体の直接確認、I=Idea Boostへの設計推論、U=今回未確認。FigJam/Miroの本番編集画面で同じ操作を実演したものではない。Miroの公式ヘルプと画像/GIFは確認したが、FigJamヘルプのブラウザ表示は一部利用不能で検索取得した公式本文を用いた。Miro Liteも開始/利用規約の前で停止しており、操作検証済みとは呼ばない。

## 比較と選択

| 論点 | FigJam（D） | Miro（D） | Idea Boostでの判断（I） |
| --- | --- | --- | --- |
| 通常の選択 | 既定Select/V、click選択、付箋drag移動、空白drag矩形。触れるobjectが対象、lockedは矩形対象外 | V、通常矩形は触れるobject。一部containerは約90%条件、長押し精密選択/lassoも別条件 | 初期select、矩形接触、Shift-click追加/解除。精密/時間依存/種類例外を増やさない |
| pan | H固定、Space一時、通常wheel縦/Shift横、Ctrl/Command wheel zoom | H/Spaceのほかデバイスmode。mouse wheel zoomとtrackpad pan等が異なる | 2ツール状態を明示。現行wheel-panを継承し、Shiftは水平のみ。自動device切替設定は追加しない |
| 文字/キーボード | Enterで編集等の専用経路、screen readerナビあり | Enter編集/Escape終了、選択時と編集時でナビ分離、context menuへkeyboard到達 | IME/editor優先。V/Hを文字入力から奪わない。Escape一段取消、native button優先を独自に明記 |
| ペン | marker/highlighter/eraser。markerは独立stroke、highlighterはobjectへ紐づく場合あり | pen/highlighter/smart drawing、eraserとprecision eraserは別 | 将来のpen拡張点だけ確保。strokeと付箋/候補/票を区別し、v1ボタンは増やさない |
| touch | iPadは別面。1/2指pan、pinch、描画終了後に選択など | touch drag pan、pinch、long-press選択、stylusの対応範囲に制限 | PC契約をtouchへ自動移植しない。実機で別評価 |
| lock | FigJamではlockedも明示選択/解除/複製可だが矩形から除外 | 通常lockとowner制限のprotected lockは別 | サーバーdrag排他/非公開認可と、汎用object lockを混同しない |

出典: [FigJam選択](https://help.figma.com/hc/en-us/articles/1500004292221-Select-move-and-order-objects-in-FigJam)、[FigJam pan/zoom](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam)、[Miro object選択](https://help.miro.com/hc/en-us/articles/360017730953-Working-with-objects)、[Miro入力デバイス](https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen)、[Miro keyboard navigation](https://help.miro.com/hc/en-us/articles/11997028019858-Keyboard-navigation-while-working-on-boards)、[Miro shortcuts](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys)、[FigJam screen reader](https://help.figma.com/hc/en-us/articles/14477051168791-Use-FigJam-with-a-screen-reader)、[FigJam描画](https://help.figma.com/hc/en-us/articles/1500004414442-Doodle-and-highlight-in-FigJam-with-drawing-tools)、[Miroペン](https://help.miro.com/hc/en-us/articles/360017730573-Pen)、[FigJam iPad](https://help.figma.com/hc/en-us/articles/4502073572247-FigJam-for-iPad)、[FigJam lock](https://help.figma.com/hc/en-us/articles/1500004291361-Lock-and-unlock-objects-in-FigJam)、[Miro lock](https://help.miro.com/hc/en-us/articles/4408887253778-Locking-content-on-the-board)。

競合の「触れる」からゼロ面積境界・左右方向差・Shift矩形の集合演算・cancel時点までを推測しない。これらはIdea Boostの規則と受け入れテストで明文化した。private→sharedの正しいcommit境界も競合資料からは決まらず、ユーザーのdrop確定承認を根拠にした。

## 取捨選択と副作用

採用: 見えるSelect/Hand、直接付箋drag、空白矩形、temporary pan、focus別入力、明示的な取消と確定、対象名のあるUndo。非採用: ペン/シェイプ等の大きな常設palette、時刻依存選択、動的deviceモード、汎用boardの権限、group背景dragを無条件に移植すること。

現在は選択付箋への文字入力が編集開始を意味するため、一般的なV/H全体shortcutをそのまま移植すると本文入力を壊す。今回の背景focus限定はIdea Boost固有の整合判断。移動Undoも共同編集/工程権限/既存group副作用を検証し、競合の機能名だけを根拠に汎用Undoを宣言しない。

## 媒体と人・AIの読取

FigJamは画像/GIFとMP4/MOV/WebMを扱う。GIFは1つ選択時に再生し、複数の常時自動再生は期待できない。埋込プレビューは対応サイト/公開状態に依存し、1人の再生が他者の画面へ同期されるとは限らない。[FigJam媒体](https://help.figma.com/hc/en-us/articles/1500004290881-Place-images-video-and-GIFs-in-FigJam)、[link preview](https://help.figma.com/hc/en-us/articles/4414079911575-Add-link-previews-in-FigJam)

AI向けにはget_figjamのXML/ID/座標・screenshotsが使えるが、動画の時間的理解や埋込記事本文の回収まで保証されない。規則ID、開始状態、入力、結果、取消、失敗、AT-IDをnative textで残し、動画には静止keyframeと代替テキストを添える。図とMarkdownのsource hashを合わせても意味の完全一致は機械証明できず、text/screenshotの読戻しが必要。[Figma MCP](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)、[accessible FigJam](https://help.figma.com/hc/en-us/articles/14477101678359-Create-accessible-FigJam-boards)

媒体ごとの出所・確認日・実装画面/提案図/競合例の区分・代替説明・掲載状態は[manifest](../product/canvas-interactions/visual-map.json)に記録する。公式ヘルプのGIFであることは再配布ライセンスを意味しない。製品素材として再利用せず、出典リンクと限定的な参考表示を扱う。
