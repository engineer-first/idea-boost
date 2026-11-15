import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutcomePng } from "./outcome-png";

type FillTextCall = { text: string; x: number; y: number; font: string };

/**
 * jsdom は Canvas を描画できないため、描いた文字と位置だけを記録する
 * 2D コンテキストに差し替える。
 */
function stubCanvas(): {
  fillTextCalls: FillTextCall[];
  shapeBottom: () => number;
  cssHeight: () => number;
} {
  const fillTextCalls: FillTextCall[] = [];
  let shapeBottom = 0;
  let lastCanvas: HTMLCanvasElement | null = null;
  let scale = 1;

  const context = {
    font: "",
    fillStyle: "",
    textAlign: "left",
    textBaseline: "top",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText(text: string, x: number, y: number) {
      fillTextCalls.push({ text, x, y, font: this.font });
    },
    scale: (x: number) => {
      scale = x;
    },
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: (_x: number, y: number) => {
      shapeBottom = Math.max(shapeBottom, y);
    },
    quadraticCurveTo: () => {},
    closePath: () => {},
    fill: () => {},
    fillRect: () => {},
  };

  let lastHeight = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      lastCanvas = this;
      return context as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement["getContext"],
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    lastHeight = this.height;
    callback(new Blob(["png"], { type: "image/png" }));
  });

  return {
    fillTextCalls,
    shapeBottom: () => shapeBottom,
    cssHeight: () => (lastCanvas ? lastHeight / scale : 0),
  };
}

describe("createOutcomePng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("成果の付箋より下、画像の下端にアプリ名とURLを12pxで描く", async () => {
    const canvas = stubCanvas();

    await createOutcomePng({
      issue: "課題の本文",
      hmw: "問いの本文",
      idea: "アイデアの本文",
    });

    const brand = canvas.fillTextCalls.find(
      (call) => call.text === "Idea Boost ideaboost.dev",
    );
    expect(brand).toBeDefined();
    expect(brand?.font).toMatch(/\b12px\b/);

    const ideaBody = canvas.fillTextCalls.find(
      (call) => call.text === "アイデアの本文",
    );
    const lowestNoteTextY = Math.max(
      ...canvas.fillTextCalls
        .filter((call) => call !== brand)
        .map((call) => call.y),
    );
    expect(ideaBody).toBeDefined();
    expect(brand?.y).toBeGreaterThan(lowestNoteTextY);
    expect(brand?.y).toBeGreaterThan(canvas.shapeBottom());
    expect(brand?.y).toBeLessThan(canvas.cssHeight());
  });
});
