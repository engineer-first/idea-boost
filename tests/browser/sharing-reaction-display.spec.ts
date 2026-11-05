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

test.each([1280, 375, 320])(
  "幅%dで最大6画像の全軌跡を左1/3内に収める",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-sharingreactiondisplay--simultaneous-likes&viewMode=story`,
      );
      const reactions = page.getByRole("img", { name: "いいね", exact: true });
      await reactions.first().waitFor({ state: "attached" });
      for (let i = 0; i < 6; i++) {
        for (const time of [0, 180, 360, 900, 1500, 2160, 2999]) {
          await frame(reactions.nth(i), time);
          const bounds = await reactions.nth(i).locator("img").boundingBox();
          if (!bounds) throw new Error("画像が表示されていません");
          expect(bounds.x).toBeGreaterThanOrEqual(7.5);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width / 3 - 7.5);
        }
      }
    } finally {
      await page.close();
    }
  },
);

test("追加受信は表示中画像と重ならない候補を選び、既存画像の動きと入力を保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto(
      `${origin}/iframe.html?id=room-sharingreactiondisplay--successive-reactions&viewMode=story`,
    );
    await page.getByRole("button", { name: "受信を追加" }).click();
    const first = page.getByRole("img", { name: "いいね", exact: true });
    await first.waitFor();
    await frame(first, 360);
    const original = await first.boundingBox();
    await page.getByRole("button", { name: "受信を追加" }).click();
    const second = page.getByRole("img", { name: "拍手", exact: true });
    await second.waitFor();
    await frame(second, 360);
    const added = await second.boundingBox();
    if (!original || !added) throw new Error("受信画像が必要です");
    expect(added.x).toBeGreaterThanOrEqual(original.x + original.width);
    expect(await first.boundingBox()).toEqual(original);
    await page.getByRole("textbox", { name: "入力確認" }).fill("入力を継続");
    expect(
      await page.getByRole("textbox", { name: "入力確認" }).inputValue(),
    ).toBe("入力を継続");
  } finally {
    await page.close();
  }
});

test("表示中のリサイズとモーション低減でも最大6画像を左1/3内に保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-sharingreactiondisplay--simultaneous-likes&viewMode=story`,
    );
    const reactions = page.getByRole("img", { name: "いいね", exact: true });
    await reactions.first().waitFor({ state: "attached" });
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const reducedMotion of ["no-preference", "reduce"] as const) {
        await page.emulateMedia({ reducedMotion });
        for (let i = 0; i < 6; i++) {
          await frame(reactions.nth(i), 360);
          const bounds = await reactions.nth(i).locator("img").boundingBox();
          if (!bounds) throw new Error("画像が必要です");
          expect(bounds.x).toBeGreaterThanOrEqual(7.5);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width / 3 - 7.5);
        }
      }
    }
  } finally {
    await page.close();
  }
});
