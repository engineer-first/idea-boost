import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`退出確認をキーボードで確定まで到達できる ${viewport.width}`, async () => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-leaveconfirmdialog--leave&viewMode=story`,
      );
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      expect(await page.getByRole("radio").count()).toBe(0);
      const cancel = page.getByRole("button", {
        name: "キャンセル",
        exact: true,
      });
      await cancel.focus();
      await page.keyboard.press("Tab");
      const confirm = page.getByRole("button", {
        name: "退出する",
        exact: true,
      });
      expect(
        await confirm.evaluate((el) => el === document.activeElement),
      ).toBe(true);
      for (const control of [cancel, confirm]) {
        const box = await control.boundingBox();
        if (!box) throw new Error("退出操作が描画されていません");
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await confirm.click();
    } finally {
      await page.close();
    }
  });
}

test("完了画面のホーム導線は退出要求や確認を出さない", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const leaveRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rooms\/[^/]+\/leave(?:\?|$)/.test(request.url())
    )
      leaveRequests.push(request.url());
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--outcome-published&viewMode=story`,
    );
    const home = page.getByRole("link", { name: "ホームへ戻る", exact: true });
    await home.waitFor();
    expect(
      await page.getByRole("button", { name: /退出|ルームを削除/ }).count(),
    ).toBe(0);
    expect(await page.getByRole("alertdialog").count()).toBe(0);
    await home.click();
    expect(await home.getAttribute("href")).toBe("/home");
    expect(await page.getByRole("alertdialog").count()).toBe(0);
    expect(leaveRequests).toEqual([]);
  } finally {
    await page.close();
  }
});
