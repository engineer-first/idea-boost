import { mkdir } from "node:fs/promises";
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

for (const width of [390, 1280]) {
  for (const surface of ["lobby", "popover"] as const) {
    test(`${surface}: ${width}px で共有・手動コピー・キーボードが使える`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      try {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "share", {
            configurable: true,
            value: async (data: ShareData) => {
              document.documentElement.dataset.sharedPayload =
                JSON.stringify(data);
              throw new DOMException("cancel", "AbortError");
            },
          });
        });
        const story =
          surface === "lobby"
            ? "room-roomlobbyview--host-solo"
            : "room-roomboardheader--host";
        await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
        if (surface === "popover")
          await page.getByRole("button", { name: "招待", exact: true }).click();
        const share = page.getByRole("button", { name: "招待URLを共有" });
        await share.waitFor();
        expect(
          await page.evaluate(
            () => document.documentElement.dataset.sharedPayload,
          ),
        ).toBeUndefined();
        await share.focus();
        await page.keyboard.press("Enter");
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.dataset.sharedPayload),
          )
          .toBe(
            JSON.stringify({ url: "https://idea-flow.example/invite/AB12CD" }),
          );
        await expect.poll(() => share.isEnabled()).toBe(true);
        expect(await page.getByRole("status").count()).toBe(0);
        await page.keyboard.press("Tab");
        expect(
          await page
            .getByText("URLを手動でコピー", { exact: true })
            .evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        const input = page.getByRole("textbox", {
          name: "手動コピー用の招待URL",
        });
        expect(await input.inputValue()).toBe(
          "https://idea-flow.example/invite/AB12CD",
        );
        expect(
          await input.evaluate((el) => el === document.activeElement),
        ).toBe(true);
        expect(
          await input.evaluate((el) => (el as HTMLInputElement).selectionEnd),
        ).toBe((await input.inputValue()).length);
        await share.scrollIntoViewIfNeeded();
        const box = await share.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? Infinity) + (box?.width ?? 0)).toBeLessThanOrEqual(
          width,
        );
        expect(box?.y).toBeGreaterThanOrEqual(0);
        expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(
          844,
        );
        await mkdir("test-results/board-layout", { recursive: true });
        await page.screenshot({
          path: `test-results/board-layout/invite-sharing-${surface}-${width}.png`,
        });
        if (surface === "popover") {
          await page.keyboard.press("Escape");
          await expect
            .poll(() =>
              page.getByRole("dialog", { name: "ルームに招待" }).isVisible(),
            )
            .toBe(false);
          await expect
            .poll(() =>
              page
                .getByRole("button", { name: "招待", exact: true })
                .evaluate((el) => el === document.activeElement),
            )
            .toBe(true);
        }
      } finally {
        await page.close();
      }
    });
  }
}
