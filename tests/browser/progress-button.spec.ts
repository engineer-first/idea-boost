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
  "幅%dの共有は「次の人へ」だけで交代し、最後の人が押すと次工程へ進める",
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
        name: "次の人へ",
        exact: true,
      });
      await complete.waitFor();
      const presenter = page.getByRole("button", {
        name: "発表者と全体の順番を確認",
      });
      const first = await presenter.textContent();
      expect(
        await page
          .getByRole("button", { name: /共有を終える|次のステップへ/ })
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
  "幅%dで「次のステップへ」は確認なしで押せ、横の次のステップ名ごと操作欄に収まる",
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
        name: "次のステップへ",
        exact: true,
      });
      await next.waitFor();
      expect(await next.isEnabled()).toBe(true);
      const hud = await page.getByTestId("board-control-hud").boundingBox();
      if (!hud) throw new Error("HUDが表示されません");
      expect(hud.x).toBeGreaterThanOrEqual(0);
      expect(hud.x + hud.width).toBeLessThanOrEqual(width);
      // 次のステップ名は操作欄からはみ出さず、ボタンと重ならない。
      const hint = await page.getByTestId("next-step-hint").boundingBox();
      const button = await next.boundingBox();
      if (!hint || !button) throw new Error("次のステップの表示がありません");
      expect(hint.x).toBeGreaterThanOrEqual(hud.x);
      expect(hint.x + hint.width).toBeLessThanOrEqual(button.x + 1);
      await next.click();
      expect(await page.getByRole("alertdialog").count()).toBe(0);
    } finally {
      await page.close();
    }
  },
);
