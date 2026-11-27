// 付箋移動の計測（note-move-probe.mts）が、ブラウザのページの中で実行する関数。
// Playwright が関数の本文を文字列にしてページへ送るので、各関数は外の変数を参照しない。
// scripts の型検査は Worker の型を読み DOM の型を読まないため、ここだけ JS で書く。

/** 読み込んだフォントの適用を待つ（付箋の寸法が決まってから測るため）。 */
export function fontsReady() {
  return document.fonts.ready.then(() => undefined);
}

/**
 * 付箋のボード上の座標と、その座標系の拡大率。
 * @param {Element} card 付箋カードの要素
 * @returns {{ x: number, y: number, scale: number } | null}
 */
export function noteWorldPosition(card) {
  const placed = card.closest(
    '[data-testid^="board-note-"], [data-testid^="idea-value-feasibility-map-note-"]',
  );
  if (!(placed instanceof HTMLElement)) return null;
  const style = getComputedStyle(placed);
  const parent = placed.offsetParent;
  return {
    x: Number.parseFloat(style.left),
    y: Number.parseFloat(style.top),
    // left / top の座標系（親）の拡大率。2軸マップは付箋自身も縮むので親で測る。
    scale:
      parent instanceof HTMLElement && parent.offsetWidth > 0
        ? parent.getBoundingClientRect().width / parent.offsetWidth
        : 1,
  };
}

/**
 * 画面の中央寄りにあり、ほかの付箋や HUD に隠れていないボードの付箋の ID。
 * @returns {string[]}
 */
export function draggableNoteIds() {
  const ids = [];
  for (const card of document.querySelectorAll(
    '[data-testid="note-card"][data-note-id]',
  )) {
    if (!(card instanceof HTMLElement)) continue;
    if (card.closest('[data-testid="private-notes-toolbar"]')) continue;
    const rect = card.getBoundingClientRect();
    if (
      rect.left < 160 ||
      rect.top < 200 ||
      rect.right > window.innerWidth - 300 ||
      rect.bottom > window.innerHeight - 160
    )
      continue;
    const hit = document
      .elementFromPoint(
        rect.left + rect.width * 0.4,
        rect.top + rect.height * 0.4,
      )
      ?.closest("[data-note-id]");
    const id = card.dataset.noteId;
    if (id && hit?.getAttribute("data-note-id") === id) ids.push(id);
  }
  return ids;
}

/**
 * 画面上の点のいちばん手前にある付箋の ID。
 * @param {[number, number]} point clientX と clientY
 * @returns {string | null}
 */
export function noteIdAtPoint([x, y]) {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest("[data-note-id]")
      ?.getAttribute("data-note-id") ?? null
  );
}

/** 動画にはマウスカーソルが写らないので、押している間だけ濃くなる印を重ねる。 */
export function showPointerDot() {
  const show = () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid #111;background:rgba(255,255,255,.7);pointer-events:none;left:-99px;top:-99px";
    document.documentElement.append(dot);
    const follow = (event) => {
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
      dot.style.background =
        event.buttons & 1 ? "rgba(220,38,38,.85)" : "rgba(255,255,255,.7)";
    };
    for (const type of ["pointermove", "pointerdown", "pointerup"])
      window.addEventListener(type, follow, true);
  };
  if (document.documentElement) show();
  else window.addEventListener("DOMContentLoaded", show);
}
