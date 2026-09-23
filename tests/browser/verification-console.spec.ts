import { chromium } from "playwright";
import { beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      // 静的サーバーが接続を閉じる前に応答本文を最後まで消費する。
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1000 },
  );
});
test.each([
  0, 1500,
])("通信モックの起動遅延 %i msでも公開ビルドから2-3、3-1へ切り替えられる", async (startupDelay) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    if (startupDelay > 0) {
      await page.addInitScript((delay) => {
        const register = navigator.serviceWorker.register.bind(
          navigator.serviceWorker,
        );
        navigator.serviceWorker.register = async (...args) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return register(...args);
        };
      }, startupDelay);
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/iframe.html?id=verification-verificationconsole--interactive&viewMode=story`,
    );
    // Storybook の読み込み後も通信モックの登録が続くため、画面の準備完了を待つ。
    await page.getByRole("heading", { name: "検証する状態を選ぶ" }).waitFor();
    expect(errors).toEqual([]);
    for (const checkpoint of ["2-3", "3-1"]) {
      await page
        .getByRole("button", { name: new RegExp(`^${checkpoint} `) })
        .click();
      await vi.waitFor(async () => {
        expect(await page.getByRole("status").textContent()).toContain(
          `検証中：${checkpoint}`,
        );
      });
      const href = await page
        .getByRole("link", { name: /このルームを固定/ })
        .getAttribute("href");
      const status = await page.waitForResponse((response) =>
        response.url().endsWith(`/api/verification${href}`),
      );
      const [phase, step] = checkpoint.split("-").map(Number);
      expect(await status.json()).toMatchObject({
        phase: { kind: "step", phase, step },
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
