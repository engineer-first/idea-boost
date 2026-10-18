import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

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

test.each(
  [
    { phase: "3-2", story: "idea-map-sharing-edges" },
    { phase: "3-3", story: "idea-map-evaluation-edges" },
    { phase: "3-5", story: "idea-map-decision-edges" },
  ].flatMap((phase) => [900, 1440].map((width) => ({ ...phase, width }))),
)("$phase / $width pxで広さ変更後も四隅まで移動し、確定時に跳ねない", async ({
  phase,
  story,
  width,
}) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    for (const level of [0, 4, 8]) {
      for (const corner of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story&args=ideaMapSizeLevel:${level}`,
        );
        await page.getByTestId("idea-map-fixed-position-area").waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (phase === "3-2")
          await page
            .getByRole("button", { name: "マイ付箋を閉じる", exact: true })
            .click();
        const plane = await bounds(page, "idea-map-fixed-position-area");
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
        expect(await bounds(page, "idea-map-fixed-position-area")).toEqual(
          plane,
        );
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
});

test("3-4では四隅の付箋を同じ座標で表示し、投票中の移動禁止を維持する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    for (const level of [0, 4, 8]) {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--idea-map-voting-edges&viewMode=story&args=ideaMapSizeLevel:${level}`,
      );
      await page.getByTestId("idea-map-fixed-position-area").waitFor();
      const plane = await bounds(page, "idea-map-fixed-position-area");
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

test.each([
  { phase: "3-2", story: "idea-map-workspace" },
  { phase: "3-3", story: "idea-map-only" },
  { phase: "3-4", story: "idea-map-voting" },
  { phase: "3-5", story: "idea-map-result" },
])("$phaseの角丸の外側にグリッドの直線を描画しない", async ({ story }) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story`,
    );
    await page.getByTestId("idea-value-feasibility-map-plane").waitFor();
    const plane = await bounds(page, "idea-value-feasibility-map-plane");
    for (const corner of [
      {
        x: plane.x,
        y: plane.y,
        points: [
          [1, 6],
          [6, 1],
        ],
      },
      {
        x: plane.x + plane.width - 16,
        y: plane.y,
        points: [
          [14, 6],
          [9, 1],
        ],
      },
      {
        x: plane.x,
        y: plane.y + plane.height - 16,
        points: [
          [1, 9],
          [6, 14],
        ],
      },
      {
        x: plane.x + plane.width - 16,
        y: plane.y + plane.height - 16,
        points: [
          [14, 9],
          [9, 14],
        ],
      },
    ]) {
      const screenshot = await page.screenshot({
        clip: { x: corner.x, y: corner.y, width: 16, height: 16 },
      });
      const colors = await page.evaluate(
        async ({ encoded, points }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("画像を読み込めません");
          context.drawImage(image, 0, 0);
          return points.map(([x, y]) =>
            Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3),
          );
        },
        { encoded: screenshot.toString("base64"), points: corner.points },
      );
      for (const color of colors)
        expect(Math.min(...color)).toBeGreaterThanOrEqual(250);
    }
  } finally {
    await page.close();
  }
});
