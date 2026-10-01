import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-pan-interaction&viewMode=story`,
  );
  await page.getByTestId("board-control-hud").waitFor();
  await page.evaluate(() => document.fonts.ready);
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

async function canvasTransform(): Promise<string> {
  return page.getByTestId("board-canvas").evaluate(async (element) => {
    // カメラはrAFで反映するため、遅れて動く場合も検出する。
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return element.style.transform;
  });
}

async function expectPanEnded(): Promise<void> {
  await vi.waitFor(async () =>
    expect(
      await page
        .getByTestId("board-scroller")
        .evaluate((element) => getComputedStyle(element).cursor),
    ).toBe("grab"),
  );
}

test("右上の操作バーの開閉後は移動だけでパンせず、背景ドラッグは動く", async () => {
  const original = await canvasTransform();
  for (const name of [
    "参加者 3人",
    "招待",
    "ルームメニューを開く",
    "タイマー 未開始 06:00。設定を開く",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.mouse.move(600, 620);
    await expectPanEnded();
    expect(await canvasTransform()).toBe(original);
    await page.mouse.click(600, 620);
    await page.mouse.move(700, 610);
    await expectPanEnded();
    expect(await canvasTransform()).toBe(original);
  }

  await page.mouse.move(600, 620);
  await page.mouse.down();
  await page.mouse.move(680, 660);
  await vi.waitFor(async () =>
    expect(await canvasTransform()).not.toBe(original),
  );
  await page.mouse.up();
  await expectPanEnded();
  const afterPan = await canvasTransform();
  await page.mouse.move(720, 640);
  expect(await canvasTransform()).toBe(afterPan);
});

test("pointerupが別のUIに消費されてもボタンを離すとパンを終了する", async () => {
  await page.mouse.move(600, 620);
  await page.mouse.down();
  await page.mouse.move(680, 660);
  // パネル等のcaptureハンドラがpointerupを消費した状況を再現する。
  await page.evaluate(() => {
    window.addEventListener("pointerup", (event) => event.stopPropagation(), {
      capture: true,
      once: true,
    });
  });
  await page.mouse.up();
  await expectPanEnded();
  const afterRelease = await canvasTransform();
  await page.getByRole("button", { name: "参加者 3人" }).click();
  await page.mouse.move(700, 610);
  expect(await canvasTransform()).toBe(afterRelease);
});

test("押下中にpointer captureを失ってもパン状態を残さない", async () => {
  await page.mouse.move(600, 620);
  await page.mouse.down();
  // setPointerCapture直後の保留状態ではなく、取得済みのcaptureを解除する。
  await page.mouse.move(620, 640);
  expect(
    await page
      .getByTestId("board-scroller")
      .evaluate((element) => element.hasPointerCapture(1)),
  ).toBe(true);
  const beforeLoss = await canvasTransform();
  await page.getByTestId("board-scroller").evaluate((element) => {
    // ChromiumのマウスポインタIDは1。
    element.releasePointerCapture(1);
  });
  await page.mouse.move(680, 660);
  await expectPanEnded();
  const afterLoss = await canvasTransform();
  expect(afterLoss).toBe(beforeLoss);
  await page.mouse.up();
  await page.mouse.move(720, 640);
  expect(await canvasTransform()).toBe(afterLoss);
});
