import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test.each([320, 1024, 1280])(
  "%ipxでも背景が入口を覆わず、入力・作成・参加・履歴へ到達できる",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width, height: 720 },
        reducedMotion: "reduce",
      });
      await page.goto(
        `${origin}/iframe.html?id=home-homeview--default&viewMode=story`,
      );
      const home = page.getByTestId("home-view");
      const create = page.getByRole("button", {
        name: "新しいルームを作成",
        exact: true,
      });
      await expect.poll(() => create.isEnabled()).toBe(true);
      const art = home.locator('[aria-hidden="true"]').first();
      expect(
        await art.evaluate(async (element) => {
          const images = await Promise.all(
            ["::before", "::after"].map(async (pseudo) => {
              const url = getComputedStyle(
                element,
                pseudo,
              ).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
              if (!url) return false;
              const image = new Image();
              image.src = url;
              await image.decode();
              return image.naturalWidth > 0;
            }),
          );
          return (
            getComputedStyle(element).pointerEvents === "none" &&
            images.every(Boolean)
          );
        }),
      ).toBe(true);
      await page.getByRole("textbox", { name: "招待コード" }).fill("AB12CD");
      await expect
        .poll(() =>
          page
            .getByRole("button", { name: "参加する", exact: true })
            .isEnabled(),
        )
        .toBe(true);
      for (const control of [
        page.getByRole("textbox", { name: "ルーム名（任意）" }),
        create,
        page.getByRole("textbox", { name: "招待コード" }),
        page.getByRole("button", { name: "参加する", exact: true }),
        page.getByRole("link", { name: /過去の成果を見る/ }),
      ]) {
        await control.scrollIntoViewIfNeeded();
        expect(
          await control.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width >= 44 &&
              rect.height >= 44 &&
              element.contains(
                document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                ),
              )
            );
          }),
        ).toBe(true);
      }
      expect(
        await home.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const code = page.getByRole("textbox", { name: "招待コード" });
      await code.focus();
      expect(
        await code.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
      ).toBe("2px");
      await mkdir("test-results/board-layout", { recursive: true });
      await page.screenshot({
        path: `test-results/board-layout/home-pop-${width}.png`,
      });
    } finally {
      await browser.close();
    }
  },
);

test("作成ボタンは押した瞬間に反応し、離した場所で取消でき、文字のコントラストを保つ", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.goto(
      `${origin}/iframe.html?id=roomlifecycle-createroomsection--default&viewMode=story`,
    );
    const button = page.getByRole("button", {
      name: "新しいルームを作成",
      exact: true,
    });
    const before = await button.boundingBox();
    if (!before) throw new Error("作成ボタンが見つかりません。");
    const ratio = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      const luminance = (color: string): number => {
        const channels = color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (channels?.length !== 3)
          throw new Error(`RGB色が必要です: ${color}`);
        const [r, g, b] = channels.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = luminance(style.color);
      const b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(
      before.x + before.width / 2,
      before.y + before.height / 2,
    );
    await page.mouse.down();
    const pressed = await button.boundingBox();
    expect(pressed?.width).toBeLessThan(before.width);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect
      .poll(async () => (await button.boundingBox())?.width)
      .toBe(before.width);
    const reduced = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce",
    });
    await reduced.goto(
      `${origin}/iframe.html?id=roomlifecycle-createroomsection--default&viewMode=story`,
    );
    const reducedButton = reduced.getByRole("button", {
      name: "新しいルームを作成",
      exact: true,
    });
    const staticBounds = await reducedButton.boundingBox();
    if (!staticBounds) throw new Error("作成ボタンが見つかりません。");
    await reduced.mouse.move(
      staticBounds.x + staticBounds.width / 2,
      staticBounds.y + staticBounds.height / 2,
    );
    await reduced.mouse.down();
    expect((await reducedButton.boundingBox())?.width).toBe(staticBounds.width);
    await reduced.mouse.move(1, 1);
    await reduced.mouse.up();
  } finally {
    await browser.close();
  }
});
