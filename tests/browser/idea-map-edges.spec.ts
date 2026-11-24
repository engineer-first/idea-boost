import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/idea-map-edges";
let browser: Browser;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function bounds(page: Page, testId: string) {
  const rect = await page.getByTestId(testId).boundingBox();
  if (!rect) throw new Error(`${testId}がありません`);
  return rect;
}

test.each(widths(390, 900))(
  "%i pxの採用モードでも縮小付箋をマップ右上端まで移動する",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--idea-map-decision-edges&viewMode=story`,
      );
      await page.getByTestId("idea-map-viewport-plane").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
        .click();
      const wrapper = page.getByTestId(
        "idea-value-feasibility-map-note-map-edge-movable",
      );
      const note = wrapper.getByTestId("note-card");
      const before = await note.boundingBox();
      if (!before) throw new Error("移動する付箋がありません");
      const plane = await bounds(page, "idea-map-viewport-plane");
      await page.mouse.move(
        before.x + before.width / 2,
        before.y + before.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        before.x + before.width / 2 + 12,
        before.y + before.height / 2,
        { steps: 3 },
      );
      await page.mouse.move(plane.x + plane.width - 1, plane.y + 1, {
        steps: 12,
      });
      await page.mouse.up();
      await expect
        .poll(async () => {
          const after = await note.boundingBox();
          if (!after) return Infinity;
          return Math.max(
            Math.abs(after.x + after.width - plane.x - plane.width),
            Math.abs(after.y - plane.y),
          );
        })
        .toBeLessThan(0.5);
    } finally {
      await page.close();
    }
  },
);

test.each(
  [
    { phase: "3-2", story: "idea-map-sharing-edges" },
    { phase: "3-3", story: "idea-map-evaluation-edges" },
    { phase: "3-5", story: "idea-map-decision-edges" },
  ].map((phase) => ({ ...phase, width: 1440 })),
)(
  // 狭い幅での端への移動は上の採用モードの検査で見る。左上と右下で縦横の両端を確かめる。
  "$phase / $width pxで広さ変更後も対角の隅まで移動し、確定時に跳ねない",
  async ({ phase, story, width }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      for (const level of [0, 4, 8]) {
        for (const corner of ["top-left", "bottom-right"]) {
          await page.goto(
            `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story&args=ideaMapSizeLevel:${level}`,
          );
          await page.getByTestId("idea-map-viewport-plane").waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.keyboard.press("Escape");
          if (phase === "3-2")
            expect(
              await page.getByRole("textbox", { name: "付箋を書く" }).count(),
            ).toBe(0);
          const plane = await bounds(page, "idea-map-viewport-plane");
          const note = page
            .getByTestId("idea-value-feasibility-map-note-map-edge-movable")
            .getByTestId("note-card");
          const before = await note.boundingBox();
          if (!before) throw new Error("移動する付箋がありません");
          const start = {
            x: before.x + before.width * 0.35,
            y: before.y + before.height * 0.3,
          };
          await page.mouse.move(start.x, start.y);
          await page.mouse.down();
          await page.mouse.move(start.x + 12, start.y + 8, { steps: 3 });
          await page.mouse.move(
            corner.endsWith("left") ? plane.x + 1 : plane.x + plane.width - 1,
            corner.startsWith("top") ? plane.y + 1 : plane.y + plane.height - 1,
            { steps: 12 },
          );
          await expect
            .poll(async () => {
              const rect = await note.boundingBox();
              if (!rect) return Number.POSITIVE_INFINITY;
              return Math.max(
                Math.abs(
                  corner.endsWith("left")
                    ? rect.x - plane.x
                    : rect.x + rect.width - plane.x - plane.width,
                ),
                Math.abs(
                  corner.startsWith("top")
                    ? rect.y - plane.y
                    : rect.y + rect.height - plane.y - plane.height,
                ),
              );
            })
            .toBeLessThan(0.5);
          const preview = await note.boundingBox();
          await page.mouse.up();
          await expect.poll(() => note.boundingBox()).toEqual(preview);
          expect(await bounds(page, "idea-map-viewport-plane")).toEqual(plane);
          if (level === 4 && corner === "bottom-right" && phase !== "3-5") {
            const edge = await note.boundingBox();
            if (!edge) throw new Error("端に置いた付箋がありません");
            await page
              .getByRole("button", { name: "マップを広くする", exact: true })
              .click();
            await expect
              .poll(async () => (await note.boundingBox())?.width ?? Infinity)
              .toBeLessThan(edge.width);
            await expect
              .poll(async () => {
                const smaller = await note.boundingBox();
                if (!smaller) return Infinity;
                return Math.max(
                  Math.abs(
                    smaller.x + smaller.width / 2 - edge.x - edge.width / 2,
                  ),
                  Math.abs(
                    smaller.y + smaller.height / 2 - edge.y - edge.height / 2,
                  ),
                );
              })
              .toBeLessThan(0.5);
            await page
              .getByRole("button", { name: "マップを狭くする", exact: true })
              .click();
            await expect.poll(() => note.boundingBox()).toEqual(edge);
          }
          await page.screenshot({
            path: `${output}/${phase}-${width}-${level}-${corner}.png`,
          });
        }
      }
    } finally {
      await page.close();
    }
  },
);

test("3-4では四隅の付箋を同じ座標で表示し、投票中の移動禁止を維持する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    for (const level of [0, 4, 8]) {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--idea-map-voting-edges&viewMode=story&args=ideaMapSizeLevel:${level}`,
      );
      await page.getByTestId("idea-map-viewport-plane").waitFor();
      const plane = await bounds(page, "idea-map-viewport-plane");
      for (let index = 0; index < 4; index++) {
        const note = page
          .getByTestId(`idea-value-feasibility-map-note-map-edge-${index}`)
          .getByTestId("note-card");
        const rect = await note.boundingBox();
        if (!rect) throw new Error("投票候補の付箋がありません");
        expect(
          Math.abs(
            index < 2
              ? rect.x - plane.x
              : rect.x + rect.width - plane.x - plane.width,
          ),
        ).toBeLessThan(0.5);
        expect(
          Math.abs(
            index % 2 === 0
              ? rect.y + rect.height - plane.y - plane.height
              : rect.y - plane.y,
          ),
        ).toBeLessThan(0.5);
        await page.mouse.move(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          plane.x + plane.width / 2,
          plane.y + plane.height / 2,
          { steps: 8 },
        );
        await page.mouse.up();
        expect(await note.boundingBox()).toEqual(rect);
      }
    }
  } finally {
    await page.close();
  }
});
