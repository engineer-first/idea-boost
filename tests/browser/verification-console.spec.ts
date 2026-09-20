import { chromium } from "playwright";
import { beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
beforeAll(async () => {
  await vi.waitFor(
    async () => {
      expect((await fetch(`${origin}/index.json`)).ok).toBe(true);
    },
    { timeout: 90_000, interval: 1000 },
  );
});
test("公開ビルドの検証コンソールから2-3、3-1へ切り替えられる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/iframe.html?id=verification-verificationconsole--interactive&viewMode=story`,
    );
    await vi.waitFor(async () => {
      expect(errors).toEqual([]);
      expect(
        await page
          .getByRole("heading", { name: "検証する状態を選ぶ" })
          .isVisible(),
      ).toBe(true);
    });
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
