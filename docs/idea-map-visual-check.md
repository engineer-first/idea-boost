# Idea map visual check

確認日: 2026-09-21\
環境: Chrome、Storybook の standalone iframe (`http://localhost:6009/iframe.html`)、CSS viewport 1280×720。各 story を manager の addon/sidebar 内ではなく iframe で直接開いて確認した。画面表示倍率は各 story で 50%。

## 比較した story

| Story                                               | 付箋数 |                広さ | 確認結果                                                                                                                                                                                              |
| --------------------------------------------------- | -----: | ------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room-roomboardcanvas--idea-map-few-notes`          |      3 | 1/9（size level 0） | 3枚とも表示。端寄りの2枚（8/12、92/88）と中央付近（50/52）を確認。マップ全体は x=248–1048、y=151–601 に収まり、各付箋は 100×75 CSS px。                                                               |
| `room-roomboardcanvas--idea-map-many-notes`         |     40 |                 5/9 | 分散した40枚を確認。最小/最大付箋位置はおよそ x=212–1122、y=96–618、付箋は各100×75 CSS px。下部操作UIとの重なりは0件。マップの外周は50%表示ではviewport外。                                           |
| `room-roomboardcanvas--idea-map-concentrated-notes` |     40 |                 5/9 | 集中配置を確認。付箋群はおよそ x=455–873、y=284–484 に入り、40枚ともviewport内。各100×75 CSS px。意図した密集によるカード同士の重なりはある。マップの外周は50%表示ではviewport外。                    |
| `room-roomboardcanvas--host-can-resize-idea-map`    |      2 |           3/9 → 4/9 | ホスト操作で「マップを広くする」を1回押し、4/9へ変更。zoomは50%のまま、付箋は100×75 CSS pxのまま。マップ表示寸法は1152×648から1382.5×777.5へ増え、外周はviewport外へ広がる。2枚の相対配置は保たれた。 |

多数storyは初回確認時に端のカードが数px切れ、下端のカードがHUDに重なっていたため、分散配置の範囲を中央寄りに調整して再確認した。調整後は40枚すべてがviewport内でHUDとの重なりもなかった。外周が見えない多数/集中storyでは、画面上の付箋群の収まりを確認し、マップ全体のfit操作をしたとは扱っていない。

## 操作可否と状態表示

| Story                                                 | 確認結果                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `room-ideamapsizecontrols--participant-cannot-adjust` | 拡大/縮小の両ボタンがdisabled。理由は「広さを変更できるのはホストだけです。」 |
| `room-ideamapsizecontrols--dragging-blocked`          | 両ボタンがdisabled。理由は「付箋のドラッグ中は変更できません。」              |
| `room-ideamapsizecontrols--at-minimum`                | 1/9。縮小はdisabled、拡大はenabled。「最小の広さです。」                      |
| `room-ideamapsizecontrols--at-maximum`                | 9/9。拡大はdisabled、縮小はenabled。「最大の広さです。」                      |

未初期化時のStorybook状態はこのブラウザ確認では開いていない。RoomDO側では初期化前のresize拒否を既存テストで扱う。

## 座標、ズーム、fit

ブラウザ上では少数storyの端/中央付近の配置と、ホストresize前後の付箋寸法・相対位置を確認した。異なる画面サイズ間の表示比較、およびpan/zoom/fitボタンを操作する一連の手動ブラウザ確認は未実施。ホストstoryのzoom/fit callbackはstorybook用stubである。

自動テストでは `features/room/logic/idea-value-feasibility-map.spec.ts` が0/50/100の座標とzoom 0.5/2での変換を、`features/room/logic/use-canvas-camera.spec.tsx` がresize後のローカルcamera保持、最新サイズへのfitを確認する。座標はマップレベルによらず割合で扱い、付箋の物理寸法には共通定数を使う。

## Storybook warning の調査

以前の `RefObject` serialization cycle warning は、story meta の `args` に含めたrefへ描画済みDOM要素が入り、argsのシリアライズ時にDOMの循環参照へ到達することが原因だった。refをargsから外し、story render wrapper内でlocal `useRef` を生成するように変更した。修正後にhost storyを開いた状態でcycle/RefObject関連ログがないことを確認した。

Storybookには別件のStory Store deprecationとPopoverProviderのariaLabel future warningが残る。誤ったstory slugへアクセスした際のNoStoryMatchはURLを修正して解消し、正しいhost/control storiesの描画を確認した。

最終確認時の撮影対象URL: `http://localhost:6009/iframe.html?id=room-roomboardcanvas--host-can-resize-idea-map&viewMode=story`。1280×720、2枚、広さ4/9、zoom 50%。
