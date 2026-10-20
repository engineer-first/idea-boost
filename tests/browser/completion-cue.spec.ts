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

test.each([1280, 360])(
  "%ipx：本人へ注目してから完了を表示し、フォーカスとアイコン位置を維持する",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--completion-cue&viewMode=story`,
      );
      const next = page.getByRole("button", {
        name: "次のステップへ",
        exact: true,
      });
      const hud = page.getByTestId("board-control-hud");
      const self = hud.locator("[data-cue-self]");
      await next.waitFor();
      const before = await self.boundingBox();
      expect(before).not.toBeNull();
      expect(before?.x).toBeGreaterThanOrEqual(0);
      expect((before?.x ?? 0) + (before?.width ?? 0)).toBeLessThanOrEqual(
        width,
      );
      await next.press("Enter");
      await expect
        .poll(() => hud.getAttribute("data-completion-cue"), {
          timeout: 5000,
          interval: 20,
        })
        .toBe("button");
      expect(await self.getByTestId("member-voting-complete").count()).toBe(0);
      await expect
        .poll(() => hud.getAttribute("data-completion-cue"), {
          timeout: 5000,
          interval: 20,
        })
        .toBe("self");
      expect(await self.getByTestId("member-voting-complete").count()).toBe(0);
      await expect
        .poll(() => hud.getAttribute("data-completion-cue"), {
          timeout: 5000,
          interval: 20,
        })
        .toBe("check");
      expect(await self.getByTestId("member-voting-complete").count()).toBe(1);
      await expect
        .poll(() => hud.getAttribute("data-completion-cue"), {
          timeout: 5000,
          interval: 20,
        })
        .toBe("others");
      const waiting = hud.locator("[data-cue-waiting]");
      expect(await waiting.count()).toBe(3);
      if (width === 1280) {
        expect(
          await waiting
            .first()
            .evaluate((el) => getComputedStyle(el).boxShadow),
        ).not.toBe("none");
      } else {
        expect(
          await hud
            .getByTestId("member-overflow-indicator")
            .evaluate((el) => getComputedStyle(el).boxShadow),
        ).not.toBe("none");
      }
      expect(await page.getByRole("alertdialog").count()).toBe(0);
      expect(
        await page
          .getByRole("button", { name: "参加者 5人" })
          .getAttribute("aria-expanded"),
      ).toBe("false");
      expect(await next.evaluate((el) => el === document.activeElement)).toBe(
        true,
      );
      await expect
        .poll(() => hud.getAttribute("data-completion-cue"), {
          timeout: 5000,
          interval: 20,
        })
        .toBe("idle");
      const after = await self.boundingBox();
      expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "完了を取り消す", exact: true })
        .press("Enter");
      await expect
        .poll(() => self.getByTestId("member-voting-complete").count())
        .toBe(0);
    } finally {
      await page.close();
    }
  },
);

test("動きを減らす設定でもキーボードから完了でき、拡大やチェック描画のアニメーションを出さない", async () => {
  const page = await browser.newPage({
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardheader--completion-cue&viewMode=story`,
    );
    const hud = page.getByTestId("board-control-hud");
    await page
      .getByRole("button", { name: "完了", exact: true })
      .press("Enter");
    expect(
      await hud
        .locator("[data-cue-self]")
        .evaluate((el) => getComputedStyle(el).transform),
    ).toBe("none");
    await expect
      .poll(() => hud.getAttribute("data-completion-cue"), {
        timeout: 5000,
        interval: 20,
      })
      .toBe("check");
    expect(
      await hud
        .locator("[data-cue-self] svg path")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await expect
      .poll(() => hud.getAttribute("data-completion-cue"), {
        timeout: 5000,
        interval: 20,
      })
      .toBe("idle");
    expect(await page.getByRole("alertdialog").count()).toBe(0);
  } finally {
    await page.close();
  }
});

test("完了更新の送信失敗ではチェックや人数待ちの輪郭を出さず、再操作できる", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardheader--completion-update-failed&viewMode=story`,
    );
    const hud = page.getByTestId("board-control-hud");
    const next = page.getByRole("button", {
      name: "次のステップへ",
      exact: true,
    });
    await next.click();
    await expect
      .poll(() => hud.getAttribute("data-completion-cue"), {
        timeout: 5000,
        interval: 20,
      })
      .toBe("idle");
    expect(
      await hud
        .locator("[data-cue-self]")
        .getByTestId("member-voting-complete")
        .count(),
    ).toBe(0);
    expect(await page.getByRole("alertdialog").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: "完了", exact: true }).isEnabled(),
    ).toBe(true);
    expect(
      await hud
        .locator("[data-cue-waiting]")
        .first()
        .evaluate((el) => getComputedStyle(el).boxShadow),
    ).toBe("none");
  } finally {
    await page.close();
  }
});
