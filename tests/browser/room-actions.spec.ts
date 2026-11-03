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
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function open(story: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
}

for (const width of [390, 1280]) {
  test.each(["success", "participant"])(
    `${width}px / %s: 全員が招待と退出を操作でき、取消後は入口へフォーカスを戻す`,
    async (mode) => {
      await page.setViewportSize({ width, height: 844 });
      await open(`room-activeroomflow--${mode}`);
      const menu = page.getByRole("button", { name: "ルームメニューを開く" });
      await menu.click();
      await page.getByRole("button", { name: "招待", exact: true }).click();
      const invite = page.getByRole("dialog", { name: "ルームに招待" });
      await invite.waitFor();
      expect(
        await page.getByRole("button", { name: "招待URLをコピー" }).isVisible(),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await invite.waitFor({ state: "detached" });
      await expect
        .poll(() =>
          page
            .getByRole("button", { name: "招待", exact: true })
            .evaluate((node) => node === document.activeElement),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await page
        .getByRole("dialog", { name: "ルームメニュー", exact: true })
        .waitFor({ state: "detached" });
      await expect
        .poll(() => menu.evaluate((node) => node === document.activeElement))
        .toBe(true);
      await menu.click();
      await page.getByRole("button", { name: "退出する", exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      await page.evaluate(async () => {
        await Promise.allSettled(
          document.getAnimations().map((animation) => animation.finished),
        );
      });
      expect(await dialog.innerText()).not.toContain("解散");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await expect
        .poll(() => menu.evaluate((node) => node === document.activeElement))
        .toBe(true);
      expect(await page.getByRole("timer").innerText()).toContain("02:18");
    },
  );
}

test("ロビーの退出を取り消すと退出ボタンへ戻り、参加者を維持する", async () => {
  await open("room-roomconnectionflow--success");
  const leave = page.getByRole("button", { name: "退出する", exact: true });
  await leave.click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  expect(await dialog.innerText()).not.toContain("解散");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await expect
    .poll(() => leave.evaluate((node) => node === document.activeElement))
    .toBe(true);
  expect(
    await page
      .getByRole("button", { name: "Hana Sato", exact: true })
      .isVisible(),
  ).toBe(true);
});
