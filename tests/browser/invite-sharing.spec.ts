import { mkdir } from "node:fs/promises";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const inviteUrl = "https://idea-flow.example/invite/AB12CD";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

for (const width of [390, 1280]) {
  for (const surface of ["lobby", "popover"] as const) {
    test(`${surface}: ${width}px で文字列・アイコンのコピーと共有がレイアウトを変えずに使える`, async () => {
      await mkdir("test-results/board-layout", { recursive: true });
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        // 実操作の録画。OS共有シートや本物のクリップボード権限の検証ではない。
        ...(width === 390 && surface === "lobby"
          ? {
              recordVideo: {
                dir: "test-results/board-layout",
                size: { width, height: 844 },
              },
            }
          : {}),
      });
      const page = await context.newPage();
      const video = page.video();
      try {
        // fake APIで内容と失敗を制御する。ブラウザへの権限付与は行わない。
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (value: string) => {
                if (document.documentElement.dataset.copyFailure === "true")
                  throw new DOMException("denied", "NotAllowedError");
                document.documentElement.dataset.copiedValue = value;
              },
            },
          });
          Object.defineProperty(navigator, "share", {
            configurable: true,
            value: async (data: ShareData) => {
              document.documentElement.dataset.sharedPayload =
                JSON.stringify(data);
              if (document.documentElement.dataset.shareFailure === "true") {
                throw new DOMException("denied", "NotAllowedError");
              }
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
        const copy = page.getByRole("button", { name: "招待URLをコピー" });
        const code = page.getByRole("button", { name: "招待コードをコピー" });
        const share = page.getByRole("button", { name: "招待URLを共有" });
        await copy.waitFor();
        await page
          .getByTestId(
            surface === "lobby"
              ? "room-lobby-view-invite"
              : "board-view-invite",
          )
          .scrollIntoViewIfNeeded();
        const initialCopyBox = await copy.boundingBox();
        const initialCodeBox = await code.boundingBox();
        expect(
          await page.getByText("URLを手動でコピー", { exact: true }).count(),
        ).toBe(0);
        expect(
          await page
            .getByRole("textbox", { name: "手動コピー用の招待URL" })
            .count(),
        ).toBe(0);
        expect(
          await page.evaluate(
            () => document.documentElement.dataset.sharedPayload,
          ),
        ).toBeUndefined();
        expect(
          await page.evaluate(
            () => document.documentElement.dataset.copiedValue,
          ),
        ).toBeUndefined();
        await page.screenshot({
          path: `test-results/board-layout/invite-copy-${surface}-${width}-idle.png`,
        });
        // 表示テキストと右側アイコンの双方が同じボタン操作になる。
        await copy.locator("span").click();
        await expect
          .poll(() => copy.getAttribute("data-copy-state"))
          .toBe("success");
        expect(
          await page.evaluate(
            () => document.documentElement.dataset.copiedValue,
          ),
        ).toBe(inviteUrl);
        expect(await copy.innerText()).toBe(inviteUrl);
        expect(
          await copy
            .locator("svg")
            .evaluate((el) => getComputedStyle(el).color),
        ).toBe(await copy.evaluate((el) => getComputedStyle(el).color));
        expect(await copy.boundingBox()).toEqual(initialCopyBox);
        expect(await code.boundingBox()).toEqual(initialCodeBox);
        await page.screenshot({
          path: `test-results/board-layout/invite-copy-${surface}-${width}-success.png`,
        });
        await expect
          .poll(() => copy.getAttribute("data-copy-state"), { timeout: 3000 })
          .toBe("idle");
        await code.locator("svg").click();
        await expect
          .poll(() => code.getAttribute("data-copy-state"))
          .toBe("success");
        expect(
          await page.evaluate(
            () => document.documentElement.dataset.copiedValue,
          ),
        ).toBe("AB12CD");
        await page.evaluate(() => {
          document.documentElement.dataset.copyFailure = "true";
        });
        await copy.locator("svg").click();
        await expect
          .poll(() => copy.getAttribute("data-copy-state"))
          .toBe("error");
        expect(await copy.boundingBox()).toEqual(initialCopyBox);
        expect(await code.boundingBox()).toEqual(initialCodeBox);
        const errorColor = await copy
          .locator("svg")
          .evaluate((el) => getComputedStyle(el).color);
        const neutralColor = await copy.evaluate(
          (el) => getComputedStyle(el).color,
        );
        expect(errorColor).not.toBe(neutralColor);
        await page.screenshot({
          path: `test-results/board-layout/invite-copy-${surface}-${width}-failure.png`,
        });
        await expect
          .poll(() => copy.getAttribute("data-copy-state"), { timeout: 3000 })
          .toBe("idle");
        await page.evaluate(() => {
          delete document.documentElement.dataset.copyFailure;
        });
        await copy.focus();
        await page.keyboard.press("Enter");
        await expect
          .poll(() => copy.getAttribute("data-copy-state"))
          .toBe("success");
        await page.keyboard.press("Tab");
        expect(
          await share.evaluate((el) => el === document.activeElement),
        ).toBe(true);
        const shareBox = await share.boundingBox();
        await page.keyboard.press("Enter");
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.dataset.sharedPayload),
          )
          .toBe(JSON.stringify({ url: inviteUrl }));
        await expect.poll(() => share.isEnabled()).toBe(true);
        await expect.poll(() => share.boundingBox()).toEqual(shareBox);
        expect(
          await page
            .getByText(
              "共有できませんでした。URLをコピーして送ってください。",
              { exact: true },
            )
            .count(),
        ).toBe(0);
        await page.evaluate(() => {
          document.documentElement.dataset.shareFailure = "true";
        });
        await share.click();
        await expect
          .poll(() => share.getAttribute("data-share-state"))
          .toBe("error");
        await expect.poll(() => share.boundingBox()).toEqual(shareBox);
        expect(await share.innerText()).toBe("共有");
        expect(
          await share
            .locator("svg")
            .evaluate((el) => getComputedStyle(el).color),
        ).not.toBe(await share.evaluate((el) => getComputedStyle(el).color));
        await expect
          .poll(() => share.getAttribute("data-share-state"), { timeout: 3000 })
          .toBe("idle");
        await page.keyboard.press("Tab");
        expect(await code.evaluate((el) => el === document.activeElement)).toBe(
          true,
        );
        for (const control of [copy, code, share]) {
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box?.x).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? Infinity) + (box?.width ?? 0)).toBeLessThanOrEqual(
            width,
          );
          expect(box?.y).toBeGreaterThanOrEqual(0);
          expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(
            844,
          );
        }
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
        await context.close();
        if (video)
          await video.saveAs(
            "test-results/board-layout/invite-copy-lobby-390-operation.webm",
          );
      }
    });
  }
}
