export type PreviewBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type SharedNotePreviewPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// パネルより上の可視領域に収める。カメラ移動後に付箋が隠れた場合は閉じる。
export function placeSharedNotePreview(
  anchor: PreviewBounds,
  viewport: PreviewBounds,
  panel: PreviewBounds | null,
): SharedNotePreviewPlacement | null {
  const gap = 12;
  const left = viewport.left + gap;
  const right = viewport.right - gap;
  const top = viewport.top + gap;
  const bottom = Math.min(viewport.bottom, panel?.top ?? viewport.bottom) - gap;
  if (
    anchor.right <= left ||
    anchor.left >= right ||
    anchor.bottom <= top ||
    anchor.top >= bottom ||
    bottom - top < 72 ||
    right - left < 80
  )
    return null;
  const width = Math.min(360, right - left);
  const height = Math.min(280, bottom - top);
  const beside =
    anchor.right + gap + width <= right
      ? anchor.right + gap
      : anchor.left - gap - width >= left
        ? anchor.left - gap - width
        : anchor.left;
  return {
    left: Math.max(left, Math.min(beside, right - width)),
    top: Math.max(top, Math.min(anchor.top, bottom - height)),
    width,
    height,
  };
}
