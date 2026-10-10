import { chromium } from "playwright";
import { expect, test } from "vitest";

const storybook = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test("再ログイン案内は狭い画面と200%相当の幅でもキーボードで両操作に到達できる", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [375, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 420 } });
      await page.goto(
        `${storybook}/iframe.html?id=roomlifecycle-roomreauthentication--ready&viewMode=story`,
      );
      const proceed = page.getByRole("button", {
        name: "Googleでログインして続ける",
      });
      const back = page.getByRole("button", { name: "戻る" });
      await proceed.waitFor();
      await expect
        .poll(() =>
          proceed.evaluate((element) => element === document.activeElement),
        )
        .toBe(true);
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          back.evaluate((element) => element === document.activeElement),
        )
        .toBe(true);
      await page.keyboard.press("Tab");
      expect(
        await proceed.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await back.scrollIntoViewIfNeeded();
      const bounds = await back.boundingBox();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 420) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
        420,
      );
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("Googleへの準備中は二重操作を防ぎ、保存障害ではコピーの次操作を示す", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 420 },
    });
    await page.goto(
      `${storybook}/iframe.html?id=roomlifecycle-roomreauthentication--pending&viewMode=story`,
    );
    expect(
      await page.getByRole("button", { name: "準備中…" }).isDisabled(),
    ).toBe(true);
    expect(await page.getByRole("button", { name: "戻る" }).isDisabled()).toBe(
      true,
    );
    await page.goto(
      `${storybook}/iframe.html?id=roomlifecycle-roomreauthentication--storage-unavailable&viewMode=story`,
    );
    await page.getByRole("status").waitFor();
    expect(await page.getByRole("status").textContent()).toContain(
      "確認・コピー",
    );
    expect(
      await page
        .getByRole("button", { name: "Googleでログインして続ける" })
        .isEnabled(),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

test("ルームの認証案内は背景を残し、接続を開始せず、背景へフォーカスを逃がさない", async () => {
  const browser = await chromium.launch();
  try {
    for (const surface of ["board", "lobby"]) {
      const page = await browser.newPage({
        viewport: { width: 375, height: 667 },
      });
      const roomConnections: string[] = [];
      page.on("websocket", (socket) => {
        if (socket.url().includes("/api/rooms/"))
          roomConnections.push(socket.url());
      });
      await page.goto(
        `${storybook}/iframe.html?id=home-roomentryreauthentication--${surface}&viewMode=story`,
      );
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      expect(await page.getByTestId("room-entry-preview").isVisible()).toBe(
        true,
      );
      expect(
        await page.getByTestId("room-entry-preview").getAttribute("inert"),
      ).not.toBeNull();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      expect(roomConnections).toEqual([]);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
