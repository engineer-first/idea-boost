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

test.each([
  ["room-roomnamedialog--editing", "保存する"],
  ["room-nextphaseconfirmdialog--opened", "次へ進む"],
])(
  "%sの主操作はホバー時も白文字とのコントラストを保つ",
  async (story, name) => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    try {
      await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
      const button = page.getByRole("button", { name, exact: true });
      await button.waitFor();
      await button.hover();
      await expect
        .poll(() =>
          button.evaluate((node) => getComputedStyle(node).backgroundColor),
        )
        .toBe("rgb(0, 73, 180)");
      const contrast = await button.evaluate((node) => {
        const style = getComputedStyle(node);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("色の計測に失敗しました");
        const luminance = (color: string): number => {
          context.fillStyle = "white";
          context.fillRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgb = [...context.getImageData(0, 0, 1, 1).data]
            .slice(0, 3)
            .map((value) => {
              const v = value / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const bg = luminance(style.backgroundColor),
          fg = luminance(style.color);
        return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    } finally {
      await page.close();
    }
  },
);

test("Storybookの本文とPortal内の操作にも可変Notoを提供する", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomnamedialog--editing&viewMode=story`,
    );
    const button = page.getByRole("button", { name: "保存する", exact: true });
    await button.waitFor();
    const typography = await button.evaluate(async (node) => {
      await document.fonts.ready;
      return {
        variable: getComputedStyle(document.documentElement).getPropertyValue(
          "--font-noto-sans-jp",
        ),
        family: getComputedStyle(node).fontFamily,
        weights: [...document.fonts]
          .filter(
            (font) =>
              font.family.includes("Noto Sans JP") && font.status === "loaded",
          )
          .map((font) => font.weight),
      };
    });
    expect(typography.variable).toContain("Noto Sans JP");
    expect(typography.family).toContain("Noto Sans JP");
    expect(typography.weights).toContain("100 900");
  } finally {
    await page.close();
  }
});
