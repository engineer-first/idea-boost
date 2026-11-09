import { describe, expect, it } from "vitest";
import { placeSharedNotePreview } from "./shared-note-preview";

describe("共有付箋の全文表示位置", () => {
  const viewport = { left: 0, top: 80, right: 1280, bottom: 720 };
  const panel = { left: 20, top: 376, right: 1260, bottom: 636 };
  it.each([
    { left: 20, top: 100, right: 220, bottom: 250 },
    { left: 1080, top: 100, right: 1280, bottom: 250 },
    { left: 550, top: 300, right: 750, bottom: 450 },
  ])("画面端とマイ付箋パネルを避けて表示する: %j", (anchor) => {
    const result = placeSharedNotePreview(anchor, viewport, panel);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.left).toBeGreaterThanOrEqual(viewport.left);
    expect(result.top).toBeGreaterThanOrEqual(viewport.top);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.right);
    expect(result.top + result.height).toBeLessThanOrEqual(panel.top);
  });
  it("付箋がパネルの裏か画面外へ出たら閉じる", () => {
    expect(
      placeSharedNotePreview(
        { left: 20, top: 400, right: 220, bottom: 550 },
        viewport,
        panel,
      ),
    ).toBeNull();
    expect(
      placeSharedNotePreview(
        { left: -220, top: 100, right: -20, bottom: 250 },
        viewport,
        panel,
      ),
    ).toBeNull();
  });
});
