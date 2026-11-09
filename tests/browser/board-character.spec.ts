import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
  await mkdir("test-results/board-layout", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});

async function checkPlacement(page: Page): Promise<void> {
  const character = page.getByTestId("board-character").locator("img");
  await page.getByTestId("board-character-bubble").waitFor();
  await character.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  const box = await character.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  const location = await page.getByTestId("board-location-slot").boundingBox();
  expect(location).not.toBeNull();
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    expect(
      Math.abs(
        (box?.x ?? 0) - ((location?.x ?? 0) + (location?.width ?? 0) + 12),
      ),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs((box?.y ?? 0) - (location?.y ?? 0))).toBeLessThanOrEqual(1);
    const context = page.getByTestId("board-context-column");
    for (const element of await context.locator("*").all()) {
      if (!(await element.isVisible())) continue;
      const bounds = await element.boundingBox();
      if (!bounds?.width || !bounds.height) continue;
      expect(
        (box?.x ?? 0) + (box?.width ?? 0) <= bounds.x ||
          (box?.x ?? 0) >= bounds.x + bounds.width ||
          (box?.y ?? 0) + (box?.height ?? 0) <= bounds.y ||
          (box?.y ?? 0) >= bounds.y + bounds.height,
      ).toBe(true);
    }
  } else {
    expect(box?.x).toBeLessThanOrEqual(16);
    expect(box?.y).toBeGreaterThanOrEqual(
      (location?.y ?? 0) + (location?.height ?? 0),
    );
    expect(box?.y).toBeLessThanOrEqual(
      (location?.y ?? 0) + (location?.height ?? 0) + 24,
    );
  }
  const bubble = page.getByTestId("board-character-bubble");
  if (await bubble.isVisible()) {
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox?.y).toBeGreaterThanOrEqual(0);
    if ((page.viewportSize()?.width ?? 0) >= 640) {
      const central = await page
        .getByTestId("step-one-onboarding-trigger")
        .boundingBox();
      expect(central).not.toBeNull();
      expect(
        (bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0) <=
          (central?.x ?? 0) - 8 ||
          (bubbleBox?.y ?? 0) >= (central?.y ?? 0) + (central?.height ?? 0),
      ).toBe(true);
      const availableWidth =
        (central?.x ?? 0) - ((box?.x ?? 0) + (box?.width ?? 0) + 6) - 8;
      if (availableWidth < 160) {
        expect(bubbleBox?.x).toBe(box?.x);
        expect(bubbleBox?.y).toBeGreaterThanOrEqual(
          (box?.y ?? 0) + (box?.height ?? 0),
        );
      } else {
        expect(bubbleBox?.x).toBeGreaterThanOrEqual(
          (box?.x ?? 0) + (box?.width ?? 0),
        );
      }
    } else {
      expect(bubbleBox?.x).toBeGreaterThanOrEqual(
        (box?.x ?? 0) + (box?.width ?? 0),
      );
    }
    expect((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  }
  const zoom = page.getByTestId("canvas-zoom-hud");
  if (await zoom.isVisible()) {
    const zoomBox = await zoom.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(zoomBox?.y ?? 0);
  }
}

test.each([
  [1280, 720],
  [1440, 900],
  [390, 844],
  [320, 568],
])(
  "%i×%iで個人・共有・評価中の一言が出ている間、先生と吹き出しが配置条件を満たす",
  async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(15_000);
    try {
      for (const [phase, step] of [
        [1, 1],
        [1, 2],
        [3, 3],
      ]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
        );
        await page.getByTestId("board-character").waitFor();
        await page.keyboard.press("Escape");
        await checkPlacement(page);
        await page.screenshot({
          path: `test-results/board-layout/character-${width}-${phase}-${step}.png`,
        });
      }
    } finally {
      await page.close();
    }
  },
);

test("残り時間の一言と先生が8秒後に一緒に消える", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-1-step-2&viewMode=story`,
    );
    const character = page.getByTestId("board-character");
    await character.waitFor();
    await page.clock.runFor(110_000);
    expect(
      await character.getByTestId("board-character-bubble").textContent(),
    ).toContain("残り30秒");
    await page.screenshot({
      path: "test-results/board-layout/character-bubble.png",
    });
    await page.clock.fastForward(8_000);
    expect(await character.getByTestId("board-character-bubble").count()).toBe(
      0,
    );
    expect(await character.count()).toBe(0);
  } finally {
    await page.close();
  }
});

test.each(["no-preference", "reduce"] as const)(
  "動きの設定が%sのとき、先生と吹き出しの登場が設定に従う",
  async (reducedMotion) => {
    const page = await browser.newPage({ reducedMotion });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-boardcharacter--opening&viewMode=story`,
      );
      const character = page.getByTestId("board-character");
      await character.waitFor();
      const teacher = await character.locator("img").evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          name: style.animationName,
          duration: style.animationDuration,
          delay: style.animationDelay,
        };
      });
      const bubble = await character
        .getByTestId("board-character-bubble")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            name: style.animationName,
            duration: style.animationDuration,
            delay: style.animationDelay,
          };
        });
      if (reducedMotion === "reduce") {
        expect(teacher.name).toBe("none");
        expect(bubble.name).toBe("none");
      } else {
        expect(teacher.name).not.toBe("none");
        expect(bubble.name).toBe(teacher.name);
        expect(teacher.duration).toBe("0.3s");
        expect(bubble.duration).toBe("0.3s");
        expect(teacher.delay).toBe("0s");
        expect(bubble.delay).toBe("0.06s");
      }
    } finally {
      await page.close();
    }
  },
);
