import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { byViewport, includeMobile } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/private-note-layout";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

for (const viewport of byViewport(
  { width: 414, height: 635 },
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
)) {
  test(`${viewport.width}×${viewport.height}: 個人付箋ワークスペースを操作できる`, async () => {
    page = await browser.newPage({ viewport });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-3-step-1&viewMode=story`,
    );
    await page.getByTestId("board-header-row").waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    ).toEqual(viewport);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    expect(await toolbar.getAttribute("data-presentation")).toBe("workspace");
    expect(await page.getByTestId("board-scroller").isVisible()).toBe(false);
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(toolbarBox?.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBox?.y).toBeGreaterThanOrEqual(0);

    expect((toolbarBox?.x ?? 0) + (toolbarBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    );

    expect(
      (toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0),
    ).toBeLessThanOrEqual(viewport.height);
    if (viewport.width < 640) {
      const reference = page.getByRole("button", { name: "決定した問い" });
      expect(await reference.isVisible()).toBe(true);
      await page.getByRole("button", { name: "考えるヒントを開く" }).click();
      expect(await reference.isVisible()).toBe(false);
      expect(
        await page.getByTestId("board-reference-hmw-content").isVisible(),
      ).toBe(false);
    }
    if (viewport.width >= 640) {
      await page.getByRole("button", { name: "考えるヒントを開く" }).click();
    }
    const help = page.locator("#board-help-content");
    expect(
      await help.evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(48);
    const expand = page.getByRole("tab", { name: "発想を広げる" });
    await expand.click();
    expect(await expand.getAttribute("aria-selected")).toBe("true");
    const write = page.getByRole("tab", { name: "書き出し" });
    await write.focus();
    await page.keyboard.press("Enter");
    expect(await write.getAttribute("aria-selected")).toBe("true");
    await page.getByRole("button", { name: "考えるヒントを閉じる" }).click();
    if (viewport.width < 640) {
      expect(
        await page.getByRole("button", { name: "決定した問い" }).isVisible(),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "考えるヒントを開く" }).click();
    expect(
      await help.evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(48);
    const note = toolbar
      .getByRole("button", { name: "付箋", exact: true })
      .first();
    await note.scrollIntoViewIfNeeded();
    await note.focus();
    await page.keyboard.press("Enter");
    expect(await note.getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press("Enter");
    const editor = toolbar.locator(
      '[data-testid="note-card"] textarea:not([readonly])',
    );
    expect(await editor.getAttribute("readonly")).toBeNull();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `${output}/${viewport.width}x${viewport.height}-expanded.png`,
    });
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    await expand.click();
    expect(await expand.getAttribute("aria-selected")).toBe("true");
    await page.screenshot({
      path: `${output}/${viewport.width}x${viewport.height}-workspace.png`,
    });
  });
}

for (const phase of [2, 3]) {
  test(`フェーズ${phase}の個人作業では参照情報があっても付箋の開始位置を下げない`, async () => {
    const viewport = { width: 1280, height: 720 };
    page = await browser.newPage({ viewport });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-1&viewMode=story`,
    );
    await page.getByTestId("private-notes-toolbar").waitFor();

    const spacing = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="private-notes-scroll"]',
      );
      const list = document.querySelector('[data-testid="private-notes-list"]');
      if (!scroll || !list) return null;
      return (
        list.getBoundingClientRect().top - scroll.getBoundingClientRect().top
      );
    });

    // 一覧上部の余白と問いの文例1行分までを許容し、参照情報で一覧全体が下がらないことを確かめる。
    expect(spacing).not.toBeNull();
    expect(spacing).toBeLessThan(200);
  });
}

// 2-1 の 1280・1440 は参照情報を避けて列が5つ入らない。1-1 と 1920 は5列が入る。
for (const { step, viewport } of [
  { step: "2-1", viewport: { width: 1280, height: 800 } },
  { step: "2-1", viewport: { width: 1440, height: 900 } },
  { step: "2-1", viewport: { width: 1920, height: 1080 } },
  { step: "1-1", viewport: { width: 1440, height: 900 } },
]) {
  test(`${viewport.width}×${viewport.height}・${step}: 入力欄と付箋一覧が左右対称にそろう`, async () => {
    page = await browser.newPage({ viewport });
    const [phase, phaseStep] = step.split("-");
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${phaseStep}&viewMode=story`,
    );
    // Windows・Linux のように幅を取るスクロールバーでも中心がずれないことを確かめる。
    await page.addStyleTag({ content: "::-webkit-scrollbar { width: 15px; }" });
    await page.getByTestId("private-notes-list").waitFor();
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
      const bounds = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect() ?? null;
      const list = bounds('[data-testid="private-notes-list"]');
      const controls = bounds('[data-testid="private-notes-controls"]');
      const notes = Array.from(
        document.querySelector('[data-testid="private-notes-list"]')
          ?.children ?? [],
        (child) => child.getBoundingClientRect(),
      );
      if (!list || !controls || notes.length === 0) return null;
      const notesLeft = Math.min(...notes.map((note) => note.left));
      const notesRight = Math.max(...notes.map((note) => note.right));
      return {
        leftSpace: notesLeft - list.left,
        rightSpace: list.right - notesRight,
        centerGap: Math.abs(
          (notesLeft + notesRight) / 2 - (controls.left + controls.right) / 2,
        ),
      };
    });

    // 一覧に収まらない列の余りを右だけに寄せず、入力欄と同じ中心に付箋を並べる。
    // 付箋は左の列から詰まるので、1行目が埋まる付箋20枚の story で列全体の端を測る。
    expect(layout).not.toBeNull();
    expect(
      Math.abs((layout?.leftSpace ?? 0) - (layout?.rightSpace ?? 0)),
    ).toBeLessThanOrEqual(2);
    expect(layout?.centerGap).toBeLessThanOrEqual(2);
  });
}

for (const step of [2, 3]) {
  test.skipIf(!includeMobile)(
    `390px・1-${step}: 上部欄の下の空白でボードを操作できる`,
    async () => {
      page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--phase-1-step-${step}&viewMode=story`,
      );
      const column = page.getByTestId("board-context-column");
      await column.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const close = page.getByRole("button", { name: "マイ付箋を閉じる" });
      if (await close.count()) await close.click();
      const blank = await column.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const contentBottom = Math.max(
          ...Array.from(
            element.children,
            (child) => child.getBoundingClientRect().bottom,
          ),
        );
        return {
          x: bounds.x + 10,
          y: contentBottom + 10,
        };
      });
      // コンテンツの直下が同じ高さの透明な上部欄で覆われない。
      const target = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return {
          blocked: Boolean(
            element?.closest('[data-testid="board-context-column"]'),
          ),
          board: Boolean(element?.closest('[data-testid="board-frame"]')),
        };
      }, blank);
      expect(target).toEqual({ blocked: false, board: true });
    },
  );
}
