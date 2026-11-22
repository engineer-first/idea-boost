import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each(widths(1280, 390))(
  "幅%dの共有は完了だけで交代し、最後の人の完了で次工程へ進む",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--sharing-completion&viewMode=story`,
      );
      const complete = page.getByRole("button", {
        name: "できた！",
        exact: true,
      });
      await complete.waitFor();
      const presenter = page.getByRole("button", {
        name: "発表者と全体の順番を確認",
      });
      const first = await presenter.textContent();
      expect(
        await page
          .getByRole("button", { name: /次の人へ|共有を終える|次のステップへ/ })
          .count(),
      ).toBe(0);
      await complete.click();
      await expect.poll(() => presenter.textContent()).not.toBe(first);
      expect(await complete.isEnabled()).toBe(true);
      await complete.click();
      await page.getByRole("button", { name: "次のステップへ" }).waitFor();
      expect(await presenter.count()).toBe(0);
      const hud = await page.getByTestId("board-control-hud").boundingBox();
      if (!hud) throw new Error("HUDが表示されません");
      expect(hud.x).toBeGreaterThanOrEqual(0);
      expect(hud.x + hud.width).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  },
);

test.each(widths(1280, 390))(
  "幅%dで進行待ちの次へは押せず、完了をチェックすると押せるようになり、取り消すと戻る",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--progress-controls&viewMode=story`,
      );
      const next = page.getByRole("button", {
        name: /^(次のステップへ|あと\d+人で次へ)$/,
      });
      await next.waitFor();
      expect(await next.isDisabled()).toBe(true);
      const complete = page.getByRole("button", {
        name: "できた！",
        exact: true,
      });
      await complete.click();
      await expect.poll(() => next.isEnabled()).toBe(true);
      const checked = page.getByRole("button", { name: "準備OK！を取り消す" });
      expect(await checked.getAttribute("aria-pressed")).toBe("true");
      const hud = await page.getByTestId("board-control-hud").boundingBox();
      if (!hud) throw new Error("HUDが表示されません");
      expect(hud.x).toBeGreaterThanOrEqual(0);
      expect(hud.x + hud.width).toBeLessThanOrEqual(width);
      await checked.click();
      expect(await next.isDisabled()).toBe(true);
      expect(await complete.getAttribute("aria-pressed")).toBe("false");
    } finally {
      await page.close();
    }
  },
);
