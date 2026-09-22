import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/step-guide";
let browser: Browser;
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
async function open(page: Page, story: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
  await page.getByTestId("step-guide").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function settled(page: Page, state: string): Promise<void> {
  await vi.waitFor(async () => {
    expect(
      await page.getByTestId("step-guide").getAttribute("data-state"),
    ).toBe(state);
    expect(
      await page
        .getByTestId("step-guide")
        .evaluate((e) => e.getAnimations({ subtree: true }).length),
    ).toBe(0);
  });
}

test("同じ枠の変形・キーボード・外側クリックと付箋追加を実ブラウザで確認する", async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: output, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  try {
    await open(page, "room-roomboardview--phase-1-first-step-intro");
    const shell = page.getByTestId("step-guide");
    await settled(page, "intro");
    expect(await page.getByRole("dialog").count()).toBe(0);
    const intro = await shell.boundingBox();
    await page.screenshot({ path: `${output}/after-intro.png` });
    const hud = await page.getByTestId("board-context-hud").boundingBox();
    const toolbar = await page
      .getByTestId("private-notes-toolbar")
      .boundingBox();
    await vi.waitFor(
      async () =>
        expect(await shell.getAttribute("data-state")).toBe("compact"),
      { timeout: 7000 },
    );
    await settled(page, "compact");
    const compact = await shell.boundingBox();
    await page.screenshot({ path: `${output}/after-compact.png` });
    await page
      .getByRole("button", { name: "進め方", exact: true })
      .press("Enter");
    await settled(page, "detail");
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    expect(await detail.evaluate((e) => e === document.activeElement)).toBe(
      true,
    );
    await detail.click();
    await page.mouse.move(1000, 420);
    await settled(page, "detail");
    const expanded = await shell.boundingBox();
    for (const box of [compact, expanded]) {
      expect(box?.y).toBe(intro?.y);
      expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBe(640);
    }
    expect(await page.getByTestId("board-context-hud").boundingBox()).toEqual(
      hud,
    );
    expect(
      await page.getByTestId("private-notes-toolbar").boundingBox(),
    ).toEqual(toolbar);
    expect(await shell.getByRole("button").count()).toBe(0);
    await page.screenshot({ path: `${output}/after-detail.png` });
    await page.keyboard.press("Escape");
    await settled(page, "compact");
    expect(
      await page
        .getByRole("button", { name: "進め方", exact: true })
        .evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Space");
    await settled(page, "detail");
    await page.keyboard.press("Tab");
    await settled(page, "compact");
    expect(
      await shell.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(false);
    await page.getByRole("button", { name: "進め方", exact: true }).click();
    await settled(page, "detail");
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await settled(page, "compact");
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
  } finally {
    await context.close();
    await page.video()?.saveAs(`${output}/guide-interaction.webm`);
  }
});

test("付箋への最初のクリックでガイドを閉じてその付箋を選択する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await open(page, "room-roomboardview--guide-phase-1-step-3");
    await settled(page, "detail");
    const note = page.getByTestId("note-card").last();
    // 左上の現在地に重ならない、付箋下部の露出した部分を最初にクリックする。
    const bounds = await note.boundingBox();
    if (!bounds) throw new Error("付箋が見つかりません");
    await note.click({
      position: { x: bounds.width / 2, y: bounds.height - 12 },
    });
    await settled(page, "compact");
    expect(await note.getAttribute("data-selected")).toBe("true");
  } finally {
    await page.close();
  }
});

test.each([
  1280, 1024, 768,
])("%ipxでも現在地を覆わず上端を保ち、縮小モーション設定では動かない", async (width) => {
  const page = await browser.newPage({
    viewport: { width, height: 720 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, "room-roomboardview--guide-phase-2-step-1");
    await settled(page, "detail");
    const shell = page.getByTestId("step-guide");
    const detail = await shell.boundingBox();
    expect(detail?.x).toBeGreaterThanOrEqual(0);
    expect((detail?.x ?? 0) + (detail?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(
      await shell.evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("0s");
    expect(
      await page
        .getByRole("region", { name: "ファシリテーションガイド" })
        .evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("0s");
    const material = await page
      .getByTestId("board-reference-issue")
      .boundingBox();
    expect(detail?.x).toBeGreaterThan(
      (material?.x ?? 0) + (material?.width ?? 0),
    );
    await page
      .getByRole("region", { name: "ファシリテーションガイド" })
      .press("Escape");
    await settled(page, "compact");
    const compact = await shell.boundingBox();
    expect(compact?.y).toBe(detail?.y);
    if (width >= 1024) {
      expect((compact?.x ?? 0) + (compact?.width ?? 0) / 2).toBe(width / 2);
    } else {
      // 狭い幅では左の現在地の右へ配置し、展開しても左端を動かさない。
      expect(compact?.x).toBe(detail?.x);
    }
    expect(
      await page.getByTestId("board-reference-issue").boundingBox(),
    ).toEqual(material);
  } finally {
    await page.close();
  }
});
