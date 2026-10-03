import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";
const states = [
  { story: "available", exhausted: 0, disabled: 0 },
  { story: "subjective-exhausted", exhausted: 1, disabled: 1 },
  { story: "objective-exhausted", exhausted: 1, disabled: 1 },
  { story: "all-pending", exhausted: 0, disabled: 2 },
  { story: "exhausted", exhausted: 2, disabled: 2 },
  { story: "rejected", exhausted: 1, disabled: 1 },
  { story: "disconnected", exhausted: 0, disabled: 2 },
  { story: "one-vote-returned", exhausted: 1, disabled: 1 },
] as const;

it.each([
  390, 1280,
])("%ipxで残票・使い切り・確認待ちを区別しキーボード選択できる", async (width) => {
  const browser = await chromium.launch();
  try {
    await mkdir(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    for (const state of states) {
      await page.goto(
        `${origin}/iframe.html?id=dotvote-dotvotepaletteview--${state.story}&viewMode=story`,
      );
      const palette = page.getByRole("region", { name: "投票パレット" });
      await palette.waitFor();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await palette.getByText("使い切りました", { exact: true }).count(),
      ).toBe(state.exhausted);
      expect(await palette.locator("button:disabled").count()).toBe(
        state.disabled,
      );
      const box = await palette.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      expect(
        await palette.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      for (const button of await palette.getByRole("button").all()) {
        expect(
          await button.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        const count = button.getByText(/残り\d票/);
        expect(
          await count.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeGreaterThanOrEqual(14);
      }
      for (const kind of ["subjective", "objective"]) {
        expect(
          await palette
            .getByTestId(`dot-vote-sticker-icon-${kind}`)
            .isVisible(),
        ).toBe(true);
      }
      expect(await palette.getByText(/は「/).count()).toBe(2 - state.exhausted);
      expect(
        await palette
          .getByText("貼った自分のシールは移動・取り消しできます。")
          .count(),
      ).toBe(0);
      expect(await palette.getByRole("status").isVisible()).toBe(true);
      if (state.story === "all-pending")
        expect(
          await palette.getByText("確認待ち", { exact: true }).count(),
        ).toBe(2);
      if (state.story === "disconnected")
        expect(await palette.getByRole("status").textContent()).toContain(
          "再接続",
        );
      if (state.story === "one-vote-returned")
        expect(await palette.getByRole("status").textContent()).toContain(
          "取り消しました",
        );
      await page.screenshot({
        path: `${output}/vote-palette-${state.story}-${width}.png`,
      });
    }

    for (const state of states.slice(0, 5)) {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardvotefeedback--${state.story}&viewMode=story`,
      );
      const palette = page.getByRole("region", { name: "投票パレット" });
      await palette.waitFor();
      await page.evaluate(() => document.fonts.ready);
      // 初回hydration中は接続待ちになるため、openに反映された状態を撮る。
      await expect
        .poll(() =>
          palette.getByText("使い切りました", { exact: true }).count(),
        )
        .toBe(state.exhausted);
      await expect
        .poll(() => palette.locator("button:disabled").count())
        .toBe(state.disabled);
      if (state.story === "all-pending") {
        await expect
          .poll(() => palette.getByText("確認待ち", { exact: true }).count())
          .toBe(2);
      }
      const box = await palette.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
      const overlays = page.locator(
        '[data-testid="board-context-hud"], [data-testid="board-control-hud"], [data-testid="board-tools-hud"]',
      );
      for (const overlay of await overlays.all()) {
        const other = await overlay.boundingBox();
        if (!box || !other) continue;
        const overlaps =
          Math.min(box.x + box.width, other.x + other.width) >
            Math.max(box.x, other.x) + 1 &&
          Math.min(box.y + box.height, other.y + other.height) >
            Math.max(box.y, other.y) + 1;
        expect(overlaps).toBe(false);
      }
      await page.screenshot({
        path: `${output}/vote-palette-full-board-${state.story}-${width}.png`,
      });
    }

    // 単体の callback モックで済ませず、ボードが持つ選択状態までつなぐ。
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--stealth-voting&viewMode=story`,
    );
    const palette = page.getByRole("region", { name: "投票パレット" });
    const objective = palette.getByRole("button", {
      name: "客観シール 残り1票",
    });
    await objective.waitFor();
    await expect.poll(() => objective.isEnabled()).toBe(true);
    await objective.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => objective.getAttribute("aria-pressed"))
      .toBe("true");
    expect(await palette.getByText("選択中", { exact: true }).isVisible()).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect
      .poll(() => objective.getAttribute("aria-pressed"))
      .toBe("false");
    const box = await palette.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.screenshot({
      path: `${output}/vote-palette-board-${width}.png`,
    });
  } finally {
    await browser.close();
  }
});
