import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage();
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function open(story: string) {
  await page.goto(
    `${origin}/iframe.html?id=roomlifecycle-participationswitch--${story}&viewMode=story`,
  );
  await page.getByRole("alertdialog").waitFor();
}
test.each([390, 1280])(
  "%ipx: 移動中に追加確認を出さず、失敗したら再試行へ到達できる",
  async (width) => {
    await page.setViewportSize({ width, height: 667 });
    await open("pending");
    expect(await page.getByRole("button").count()).toBe(0);
    expect(await page.getByRole("radio").count()).toBe(0);
    await open("connection-failure");
    const dialog = page.getByRole("alertdialog");
    const box = await dialog.boundingBox();
    if (!box) throw new Error("dialogなし");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(await page.getByText(/もう一度お試しください。/).count()).toBe(1);
    const retry = page.getByRole("button", { name: "もう一度試す" });
    expect(
      await retry.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await retry.evaluate((node) => node === document.activeElement),
    ).toBe(true);
  },
);
test("終了した移動で内部IDを見せずホームへ戻れる", async () => {
  await open("terminal-failure");
  const home = page.getByRole("link", { name: "ホームへ戻る" });
  expect(await home.getAttribute("href")).toBe("/home");
  expect(await home.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
  expect(await page.getByRole("button", { name: "もう一度試す" }).count()).toBe(
    0,
  );
});
