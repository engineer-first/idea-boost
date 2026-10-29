import { type Browser, chromium, type Locator } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function frame(reaction: Locator, time: number) {
  return reaction.evaluate((element, currentTime) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error("リアクションのアニメーションが必要です");
    animation.pause();
    animation.currentTime = currentTime;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      opacity: Number(style.opacity),
      transform: style.transform,
    };
  }, time);
}

test("5種類の受信画像を読み込み、読み上げ名と表示する種類を一致させる", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-sharingreactiondisplay--all-kinds&viewMode=story`,
    );
    for (const [label, kind] of [
      ["いいね", "like"],
      ["拍手", "clap"],
      ["おお！", "surprised"],
      ["なるほど", "insight"],
      ["どうして？", "question"],
    ]) {
      const reaction = page.getByRole("img", { name: label, exact: true });
      await reaction.waitFor({ state: "attached" });
      const image = reaction.locator("img");
      expect(
        await image.evaluate(async (element: HTMLImageElement) => {
          await element.decode();
          return element.naturalWidth;
        }),
      ).toBeGreaterThan(0);
      expect(
        decodeURIComponent((await image.getAttribute("src")) ?? ""),
      ).toContain(`/reactions/${kind}-3d.webp`);
      expect((await frame(reaction, 2250)).opacity).toBeGreaterThan(0.8);
      expect((await frame(reaction, 2999)).opacity).toBeLessThan(0.02);
    }
  } finally {
    await page.close();
  }
});

test.each([
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
])(
  "$width × $height : 画面下端から中央の高さまで上がり、その場でフェードする",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-sharingreactiondisplay--single-like&viewMode=story`,
      );
      const reaction = page.getByRole("img", { name: "いいね", exact: true });
      await reaction.waitFor({ state: "attached" });
      const image = reaction.locator("img");
      expect(await image.count()).toBe(1);
      expect(
        await image.evaluate(async (element: HTMLImageElement) => {
          await element.decode();
          return element.naturalWidth;
        }),
      ).toBeGreaterThan(0);
      await reaction.evaluate((element) => {
        const container = element.closest("#storybook-root");
        if (container instanceof HTMLElement) {
          container.style.transform = "translate(100px, -80px)";
          container.style.overflow = "hidden";
        }
      });
      const start = await frame(reaction, 300);
      expect(start.y).toBeGreaterThan(viewport.height * 0.85);
      const middle = await frame(reaction, 2_250);
      expect(middle.y).toBeGreaterThan(viewport.height * 0.4);
      expect(middle.y).toBeLessThan(viewport.height * 0.6);
      expect(middle.opacity).toBeGreaterThan(0.8);
      const end = await frame(reaction, 2_999);
      expect(end.opacity).toBeLessThan(0.02);
      expect(Math.abs(end.y - middle.y)).toBeLessThan(8);
      expect(
        await page.evaluate(({ x, y }) => {
          return !document
            .elementFromPoint(x, y)
            ?.closest('[aria-label="届いたリアクション"]');
        }, middle),
      ).toBe(true);
      await page.getByRole("button", { name: "もう一度表示" }).click();
      expect(await reaction.count()).toBe(1);
    } finally {
      await page.close();
    }
  },
);

test("動きを減らす設定では上昇せず、中央の高さでフェードだけにする", async () => {
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-sharingreactiondisplay--single-like&viewMode=story`,
    );
    const reaction = page.getByRole("img", { name: "いいね", exact: true });
    await reaction.waitFor({ state: "attached" });
    const start = await frame(reaction, 300);
    const middle = await frame(reaction, 2_250);
    expect(middle.y).toBeGreaterThan(812 * 0.4);
    expect(middle.y).toBeLessThan(812 * 0.6);
    expect(middle.y).toBe(start.y);
    expect(middle.transform).toBe("none");
    expect((await frame(reaction, 2_999)).opacity).toBeLessThan(0.02);
  } finally {
    await page.close();
  }
});
