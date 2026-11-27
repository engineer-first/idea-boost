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
  "%i × %i : 発表者をフォロー中でも、リアクションとフォローを外すの中心を押せる",
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
      expect(await isTopmostAtCenter(page, reaction)).toBe(true);
      expect(await isTopmostAtCenter(page, unfollow)).toBe(true);
      await reaction.click();
      await page
        .getByRole("dialog", { name: "リアクションを選ぶ" })
        .waitFor({ state: "visible" });
    } finally {
      await page.close();
    }
  },
);
