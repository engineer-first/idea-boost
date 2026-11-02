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

test.each([1280, 390])(
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
      const first = await presenter.innerText();
      expect(
        await page
          .getByRole("button", { name: /次の人へ|共有を終える|次のステップへ/ })
          .count(),
      ).toBe(0);
      await complete.click();
      await expect.poll(() => presenter.innerText()).not.toBe(first);
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

test.each([1280, 390])(
  "幅%dで進行待ちのボタンに面と枠があり、完了をチェックすると状態が切り替わる",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--progress-controls&viewMode=story`,
      );
      const next = page.getByRole("button", { name: "次のステップへ" });
      await next.waitFor();
      expect(await next.isDisabled()).toBe(true);
      const pending = await next.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          opacity: style.opacity,
        };
      });
      expect(pending.opacity).toBe("1");
      expect(pending.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(pending.border).not.toBe("rgba(0, 0, 0, 0)");
      const complete = page.getByRole("button", {
        name: "できた！",
        exact: true,
      });
      const uncheckedBackground = await complete.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      await complete.click();
      await expect.poll(() => next.isEnabled()).toBe(true);
      const checked = page.getByRole("button", { name: "準備OK！を取り消す" });
      expect(await checked.getAttribute("aria-pressed")).toBe("true");
      expect(
        await checked.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        ),
      ).not.toBe(uncheckedBackground);
      expect(
        await next.evaluate((node) => getComputedStyle(node).backgroundColor),
      ).not.toBe(pending.background);
      const hud = await page.getByTestId("board-control-hud").boundingBox();
      expect(hud).not.toBeNull();
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
