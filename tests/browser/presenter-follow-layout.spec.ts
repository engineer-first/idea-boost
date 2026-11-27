import { type Browser, chromium, type Locator, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { sizes } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

/** 要素の中心で一番上にある要素が、その要素自身か子孫かを返す。 */
async function isTopmostAtCenter(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("要素が表示されていません");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const handle = await target.elementHandle();
  return page.evaluate(
    ([element, px, py]) => {
      const hit = document.elementFromPoint(px as number, py as number);
      return hit !== null && (element as Element).contains(hit);
    },
    [handle, x, y] as const,
  );
}

test.each(sizes([1180, 820], [1024, 768], [768, 1024], [1280, 800]))(
  "%i × %i : 発表者をフォロー中でも、帯がツールバーに重ならず、リアクションとフォローを外すを押せる",
  async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--sharing-following-presenter&viewMode=story`,
      );
      const reaction = page.getByRole("button", {
        name: "リアクション",
        exact: true,
      });
      const unfollow = page.getByRole("button", {
        name: "フォローを外す",
        exact: true,
      });
      await reaction.waitFor();
      await unfollow.waitFor();
      await page.evaluate(() => document.fonts.ready);
      // 帯がツールバーの端に少しでもかかると、端のボタンの一部が押せなくなる。
      const toolbar = await page
        .getByTestId("canvas-zoom-controls")
        .boundingBox();
      const banner = await unfollow.locator("..").boundingBox();
      if (!toolbar || !banner)
        throw new Error("ツールバーか帯が表示されていません");
      const separated =
        banner.x >= toolbar.x + toolbar.width ||
        banner.x + banner.width <= toolbar.x ||
        banner.y >= toolbar.y + toolbar.height ||
        banner.y + banner.height <= toolbar.y;
      expect(separated).toBe(true);
      expect(await isTopmostAtCenter(page, reaction)).toBe(true);
      expect(await isTopmostAtCenter(page, unfollow)).toBe(true);
      await reaction.click();
      const bar = page.getByRole("dialog", { name: "リアクションを選ぶ" });
      await bar.waitFor({ state: "visible" });
      await bar.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      // 開いたリアクションの選択肢も、上へ逃がした帯に覆われない。
      for (const choice of await bar.getByRole("button").all())
        expect(await isTopmostAtCenter(page, choice)).toBe(true);
    } finally {
      await page.close();
    }
  },
);
