import { describe, expect, it } from "vitest";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "./note-color";

function relativeLuminance(hexColor: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function compositeHexColor(
  overlayColor: string,
  backgroundColor: string,
  opacity: number,
): string {
  const channels = [1, 3, 5].map((offset) => {
    const overlay = Number.parseInt(overlayColor.slice(offset, offset + 2), 16);
    const background = Number.parseInt(
      backgroundColor.slice(offset, offset + 2),
      16,
    );
    return Math.round(overlay * opacity + background * (1 - opacity));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

describe("NOTE_COLOR_STYLES", () => {
  it("20色それぞれに異なる背景色と4.5:1以上の文字色を持つ", () => {
    const styles = Object.values(NOTE_COLOR_STYLES);
    expect(styles).toHaveLength(20);
    expect(new Set(styles.map((style) => style.backgroundColor)).size).toBe(20);
    for (const style of styles) {
      expect(style.foregroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(style.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(
        contrastRatio(style.foregroundColor, style.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("採用フォーカスの薄緑を重ねた後も20色すべてで本文が4.5:1以上を保つ", () => {
    const focusGreen = "#10B981";
    const focusOpacity = 0.12;

    for (const color of NOTE_COLOR_PALETTE) {
      const style = NOTE_COLOR_STYLES[color];
      const focusedBackground = compositeHexColor(
        focusGreen,
        style.backgroundColor,
        focusOpacity,
      );
      expect(
        contrastRatio(style.foregroundColor, focusedBackground),
        color,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(NOTE_COLOR_PALETTE)("%s のアバターに常時枠線を付けない", (color) => {
    expect(NOTE_COLOR_STYLES[color].avatarClassName).toBe("border-transparent");
  });
});
