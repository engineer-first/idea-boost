import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function openBar(page: Page) {
  await page.goto(
    `${origin}/iframe.html?id=room-sharingreactioncontrols--repeated-sending&viewMode=story`,
  );
  await page.getByRole("button", { name: "リアクション", exact: true }).click();
  const bar = page.getByRole("dialog", { name: "リアクションを選ぶ" });
  await bar.waitFor();
  await bar.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  return bar;
}

test.each([1280, 320])(
  "幅%d：画像だけが一度動き、押せる範囲と隣の画像を動かさない",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    try {
      const bar = await openBar(page);
      const like = bar.getByRole("button", {
        name: "いいねを送る",
        exact: true,
      });
      await page.mouse.move(0, 0);
      await like.evaluate((element: HTMLButtonElement) => element.blur());
      const before = await bar.getByRole("button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      expect(
        before.every(({ width, height }) => width === 44 && height === 28),
      ).toBe(true);
      await like.hover();
      await expect
        .poll(() =>
          like.locator("img").evaluate((image) => image.getAnimations().length),
        )
        .toBe(1);
      const during = await bar.getByRole("button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      expect(during).toEqual(before);
      expect(
        await bar
          .locator("img")
          .evaluateAll(
            (images) => images.flatMap((image) => image.getAnimations()).length,
          ),
      ).toBe(1);
      await page.waitForTimeout(1200);
      expect(await page.getByRole("tooltip").count()).toBe(0);
      expect(await bar.locator("[title]").count()).toBe(0);
      expect(
        await bar
          .locator("img")
          .evaluateAll(
            (images) => images.flatMap((image) => image.getAnimations()).length,
          ),
      ).toBe(0);
      expect(
        await page
          .getByRole("status", { name: "リアクションの送信回数" })
          .textContent(),
      ).toBe("0");
      const bounds = await bar.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        width,
      );
      await page.mouse.down();
      expect(await like.boundingBox()).toEqual(before[0]);
      await page.mouse.up();
      await expect
        .poll(() =>
          like.locator("img").evaluate((image) => image.getAnimations().length),
        )
        .toBe(1);
      await page.keyboard.press("Escape");
      await bar.waitFor({ state: "hidden" });
      await expect
        .poll(() =>
          page
            .getByRole("button", { name: "リアクション", exact: true })
            .evaluate((button) => button === document.activeElement),
        )
        .toBe(true);
    } finally {
      await page.close();
    }
  },
);

test("モーション低減では画像とバーを拡縮せず、フォーカスと単発送信を維持する", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    const bar = await openBar(page);
    const like = bar.getByRole("button", { name: "いいねを送る" });
    await like.focus();
    await like.hover();
    await page.waitForTimeout(100);
    expect(
      await bar.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await page.keyboard.down("Enter");
    await page.waitForTimeout(450);
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    expect(
      await page
        .getByRole("status", { name: "リアクションの送信回数" })
        .textContent(),
    ).toBe("1");
    expect(
      await like.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(
      await bar.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
  } finally {
    await page.close();
  }
});

test("タッチは予備タップなしで1件送り、バーを維持する", async () => {
  const page = await browser.newPage({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-sharingreactioncontrols--repeated-sending&viewMode=story`,
    );
    await page.getByRole("button", { name: "リアクション", exact: true }).tap();
    const bar = page.getByRole("dialog", { name: "リアクションを選ぶ" });
    await bar.getByRole("button", { name: "拍手を送る" }).tap();
    expect(
      await page
        .getByRole("status", { name: "リアクションの送信回数" })
        .textContent(),
    ).toBe("1");
    expect(
      await page
        .getByRole("status", { name: "最後に送ったリアクション" })
        .textContent(),
    ).toBe("拍手");
    expect(await bar.isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

test.each([
  ["room-canvaszoomcontrols--tools", "キャンバスを拡大"],
  ["notes-privatenotestoolbar--collapsed", "マイ付箋を開く"],
])(
  "%s：ツールのアイコンだけが反応し、押下中も操作範囲は動かない",
  async (story, name) => {
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
      const button = page.getByRole("button", { name, exact: true });
      await button.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const before = await button.boundingBox();
      await button.hover();
      await page.waitForTimeout(160);
      expect(
        await button
          .locator("svg")
          .evaluate(
            (icon) =>
              new DOMMatrixReadOnly(getComputedStyle(icon).transform).m42,
          ),
      ).toBeLessThan(0);
      await page.mouse.down();
      await page.waitForTimeout(100);
      expect(await button.boundingBox()).toEqual(before);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await button.boundingBox()).toEqual(before);
      expect(
        await button
          .locator("svg")
          .evaluate(
            (icon) =>
              new DOMMatrixReadOnly(getComputedStyle(icon).transform)
                .isIdentity,
          ),
      ).toBe(true);
      await page.mouse.up();
    } finally {
      await page.close();
    }
  },
);
