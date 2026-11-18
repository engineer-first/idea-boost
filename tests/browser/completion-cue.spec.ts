import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { stepGuideSeenStorageKey } from "../../features/room/logic/step-guide-seen";

const FIRST_STEP_GUIDE_KEY = stepGuideSeenStorageKey(
  "11111111-1111-4111-8111-111111111111",
  "1-1",
);

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});
test.each([1280, 360])(
  "幅%dの時間切れ後は未チェックのまま確認してキーボードで進める",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await page.addInitScript(
        (key) => localStorage.setItem(key, "seen"),
        FIRST_STEP_GUIDE_KEY,
      );
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--time-up-progress&viewMode=story`,
      );
      const next = page.getByRole("button", {
        name: "次のステップへ",
        exact: true,
      });
      await next.waitFor();
      expect(await page.getByTestId("phase-next-count").innerText()).toBe("0");
      expect(await page.getByTestId("member-voting-complete").count()).toBe(0);
      await next.press("Enter");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "次へ進む", exact: true })
        .press("Enter");
      expect(await page.getByTestId("phase-next-count").innerText()).toBe("1");
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
      await expect
        .poll(() => next.evaluate((el) => document.activeElement === el))
        .toBe(true);
      expect(
        await page
          .getByRole("button", { name: "できた！", exact: true })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    } finally {
      await page.close();
    }
  },
);
test("進行の送信中は二重操作を止める", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.addInitScript(
      (key) => localStorage.setItem(key, "seen"),
      FIRST_STEP_GUIDE_KEY,
    );
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardheader--time-up-progress-pending&viewMode=story`,
    );
    const next = page.getByRole("button", {
      name: "次のステップへ",
      exact: true,
    });
    await next.waitFor();
    expect(await next.isDisabled()).toBe(true);
  } finally {
    await page.close();
  }
});
