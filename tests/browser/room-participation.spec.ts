import { mkdir } from "node:fs/promises";
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
  await mkdir("test-results/room-participation", { recursive: true });
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
  "%ipx: 長い名称の確認は画面内で読め、キーボードで取消と決定へ到達する",
  async (width) => {
    await page.setViewportSize({ width, height: 667 });
    await open("long-room-names");
    const dialog = page.getByRole("alertdialog");
    const box = await dialog.boundingBox();
    if (!box) throw new Error("dialogなし");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    const cancel = page.getByRole("button", { name: "キャンセル" }),
      confirm = page.getByRole("button", { name: "退出して参加する" });
    expect(
      await cancel.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await confirm.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    expect(await confirm.isEnabled()).toBe(true);
    await page.screenshot({
      path: `test-results/room-participation/long-names-${width}.png`,
    });
  },
);
test("一部退出後の再確認は取消と成果の変更を提供せず、続行の決定へ到達する", async () => {
  await page.setViewportSize({ width: 390, height: 667 });
  await open("partially-left");
  expect(await page.getByRole("button", { name: "キャンセル" }).count()).toBe(
    0,
  );
  expect(await page.getByRole("radio").first().isDisabled()).toBe(true);
  const confirm = page.getByRole("button", {
    name: "変更した内容を確認して続ける",
  });

  expect(
    await confirm.evaluate((node) => node === document.activeElement),
  ).toBe(true);
  expect(await confirm.isEnabled()).toBe(true);
});

test("処理中の復帰は自然に結果確認へフォーカスし、Tabで画面外へ抜けない", async () => {
  await open("recovered-pending");
  const retry = page.getByRole("button", { name: "結果を確認・再試行" });
  expect(await retry.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
  await page.keyboard.press("Tab");
  expect(await retry.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
});

test("取消で元の参加確認操作へフォーカスが戻り、再度開ける", async () => {
  await page.goto(
    `${origin}/iframe.html?id=roomlifecycle-participationswitch--reopenable&viewMode=story`,
  );
  const trigger = page.getByRole("button", { name: "参加先を確認する" });
  await trigger.click();
  const cancel = page.getByRole("button", { name: "キャンセル" });
  expect(await cancel.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await expect
    .poll(() => trigger.evaluate((node) => node === document.activeElement))
    .toBe(true);
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").waitFor();
  expect(await cancel.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
});

test.each(["terminal-failure", "source-maintained-failure"])(
  "%s: 終了結果で元へ戻ったと案内せず、安全なホーム操作に自然focusする",
  async (story) => {
    await open(story);
    expect(await page.getByRole("button", { name: "キャンセル" }).count()).toBe(
      0,
    );
    expect(
      await page.getByRole("button", { name: "結果を確認・再試行" }).count(),
    ).toBe(0);
    const home = page.getByRole("link", { name: "ホームで別のルームを選ぶ" });
    expect(await home.evaluate((node) => node === document.activeElement)).toBe(
      true,
    );
    expect(await home.getAttribute("href")).toBe("/home");
    if (story === "terminal-failure")
      expect(await page.getByText("元のルーム：解散済み").count()).toBe(1);
    else expect(await page.getByText("ルームA：参加中").count()).toBe(1);
  },
);
