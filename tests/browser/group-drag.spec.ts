import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

/** グループ移動用ストーリーを開き、枠とフォントの描画が完了するまで待つ。 */
async function open(story = "group-background-move"): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--${story}&viewMode=story`,
  );
  await page.getByTestId("note-group-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
/** 各付箋の配置用要素からワールド座標を読み、共通移動量と領域外の維持を検証する。 */
async function positions(page: Page) {
  return page.getByTestId("note-card").evaluateAll((elements) =>
    elements.map((element) => ({
      x: Number.parseFloat(element.parentElement?.style.left ?? ""),
      y: Number.parseFloat(element.parentElement?.style.top ?? ""),
    })),
  );
}
/** 描画フレームの反映後にカメラ変換を読み、移動中の固定や画面移動を検証する。 */
async function transform(page: Page) {
  return page.getByTestId("board-canvas").evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return element.style.transform;
  });
}
/** 付箋や名前編集に重ならないグループ背景上の操作開始点を求める。 */
async function backgroundPoint(page: Page) {
  const box = await page.getByTestId("note-group-card").first().boundingBox();
  if (!box) throw new Error("グループ枠がありません");
  return { x: box.x + 5, y: box.y + box.height / 2 };
}
/** グループの背景を指定した距離とマウスボタンでドラッグする。 */
async function drag(
  page: Page,
  dx = 80,
  dy = 50,
  button: "left" | "middle" = "left",
) {
  const start = await backgroundPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up({ button });
}

test.each([
  "group-background-move",
  "saved-group-background-move",
])("%s: 背景で領域内の付箋を配置を保って移動する", async (story) => {
  const page = await open(story);
  try {
    const before = await positions(page);
    const camera = await transform(page);
    await drag(page);
    await vi.waitFor(async () =>
      expect((await positions(page))[0].x).not.toBe(before[0].x),
    );
    const after = await positions(page);
    expect(after[0].x - before[0].x).toBeCloseTo(after[1].x - before[1].x);
    expect(after[0].y - before[0].y).toBeCloseTo(after[1].y - before[1].y);
    expect(after[2]).toEqual(before[2]);
    expect(await transform(page)).toBe(camera);
    expect(await page.getByTestId("group-start-count").textContent()).toBe("1");
    await vi.waitFor(async () =>
      expect(await page.locator("[data-group-moving='true']").count()).toBe(0),
    );
  } finally {
    await page.close();
  }
});

test("ズーム後は画面の移動量をワールド座標へ換算し、移動中はカメラを固定する", async () => {
  const page = await open();
  try {
    await page.getByRole("button", { name: "キャンバスを拡大" }).click();
    const camera = await transform(page);
    const zoom = await page
      .getByTestId("board-canvas")
      .evaluate((element) =>
        Number(element.style.transform.match(/scale\(([^)]+)\)/)?.[1]),
      );
    const before = await positions(page);
    const start = await backgroundPoint(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 15, start.y + 10);
    await vi.waitFor(async () =>
      expect(await page.getByTestId("group-start-count").textContent()).toBe(
        "1",
      ),
    );
    await page.mouse.wheel(0, -100);
    expect(await transform(page)).toBe(camera);
    await page.mouse.move(start.x + 80, start.y + 50, { steps: 5 });
    await page.mouse.up();
    await vi.waitFor(async () =>
      expect((await positions(page))[0].x - before[0].x).toBeCloseTo(80 / zoom),
    );
    expect((await positions(page))[1].y - before[1].y).toBeCloseTo(50 / zoom);
  } finally {
    await page.close();
  }
});

test.each([
  "space",
  "middle",
])("%sで背景を掴むと一括移動せずパンする", async (mode) => {
  const page = await open();
  try {
    const before = await positions(page);
    const camera = await transform(page);
    if (mode === "space") await page.keyboard.down("Space");
    await drag(page, 80, 50, mode === "middle" ? "middle" : "left");
    if (mode === "space") await page.keyboard.up("Space");
    expect(await positions(page)).toEqual(before);
    expect(await page.getByTestId("group-start-count").textContent()).toBe("0");
    expect(await transform(page)).not.toBe(camera);
  } finally {
    await page.close();
  }
});

test("名前の編集と付箋の個別ドラッグで一括移動を開始しない", async () => {
  const page = await open();
  try {
    await page.getByTestId("group-name-display").click();
    expect(await page.getByTestId("group-name-input").isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    const before = await positions(page);
    const note = await page.getByTestId("note-card").first().boundingBox();
    if (!note) throw new Error("付箋がありません");
    await page.mouse.move(note.x + note.width / 2, note.y + note.height - 15);
    await page.mouse.down();
    await page.mouse.move(
      note.x + note.width / 2 + 40,
      note.y + note.height + 15,
      { steps: 5 },
    );
    await page.mouse.up();
    await vi.waitFor(async () =>
      expect((await positions(page))[0].x).not.toBe(before[0].x),
    );
    expect((await positions(page))[1]).toEqual(before[1]);
    expect(await page.getByTestId("group-start-count").textContent()).toBe("0");
  } finally {
    await page.close();
  }
});

test("クリックと拒否された移動は付箋の配置を変えない", async () => {
  const page = await open("group-background-move-rejected");
  try {
    const before = await positions(page);
    const point = await backgroundPoint(page);
    await page.mouse.click(point.x, point.y);
    expect(await page.getByTestId("group-start-count").textContent()).toBe("0");
    await drag(page);
    await vi.waitFor(async () =>
      expect(await page.getByTestId("group-start-count").textContent()).toBe(
        "1",
      ),
    );
    expect(await positions(page)).toEqual(before);
  } finally {
    await page.close();
  }
});
