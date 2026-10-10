import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/step-guide";
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

test.each([
  1440, 390,
])("%ipxで案内内は縦だけスクロールでき、開いたまま背景の移動・ズームもできる", async (width) => {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, "room-roomboardview--voting-guide-scroll-interaction");
    await settled(page, "detail");
    const canvas = page.getByTestId("board-canvas");
    const transform = () =>
      canvas.evaluate(async (element) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return element.style.transform;
      });
    const before = await transform();
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    await detail.hover();
    await page.mouse.wheel(120, 1600);
    await vi.waitFor(async () =>
      expect(
        await detail.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0),
    );
    await vi.waitFor(async () =>
      expect(
        await detail.evaluate(
          (element) =>
            element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      ).toBeLessThanOrEqual(1),
    );
    expect(await detail.evaluate((element) => element.scrollLeft)).toBe(0);
    expect(await transform()).toBe(before);

    await page.mouse.move(width / 2, 550);
    await page.mouse.wheel(120, 240);
    await vi.waitFor(async () => expect(await transform()).not.toBe(before));
    const afterPan = await transform();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await vi.waitFor(async () => expect(await transform()).not.toBe(afterPan));
    expect(
      await page.getByTestId("step-guide").getAttribute("data-state"),
    ).toBe("detail");
    await page.keyboard.press("Escape");
    await settled(page, "compact");
  } finally {
    await page.close();
  }
});

test.each([
  390, 768, 901, 1180, 1440,
])("%ipxで常時表示のスクロールバーを隠し、長い語句も横に移動せず全文を読める", async (width) => {
  const classicBrowser = await chromium.launch({
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  const page = await classicBrowser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, "room-stepguide--long-text");
    await settled(page, "detail");
    // OSがスクロールバーを常時表示する環境を、幅を持つネイティブバーで再現する。
    await page.addStyleTag({
      content: "*::-webkit-scrollbar { width: 14px; height: 14px; }",
    });
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    expect(
      await detail.evaluate((element) => {
        if (!(element instanceof HTMLElement))
          throw new Error("ガイドがHTML要素ではありません");
        return element.offsetWidth - element.clientWidth;
      }),
    ).toBe(0);
    expect(await detail.evaluate((element) => element.scrollWidth)).toBe(
      await detail.evaluate((element) => element.clientWidth),
    );
    await detail.hover();
    await page.mouse.wheel(800, 400);
    await vi.waitFor(async () =>
      expect(
        await detail.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0),
    );
    expect(await detail.evaluate((element) => element.scrollLeft)).toBe(0);
    await detail.press("End");
    await vi.waitFor(async () =>
      expect(
        await detail.evaluate(
          (element) =>
            element.scrollTop + element.clientHeight >=
            element.scrollHeight - 1,
        ),
      ).toBe(true),
    );
    const last = detail.locator("dl > div").last();
    const lastBox = await last.boundingBox();
    const bounds = await detail.boundingBox();
    expect(lastBox).not.toBeNull();
    expect(bounds).not.toBeNull();
    expect((lastBox?.x ?? 0) + (lastBox?.width ?? 0)).toBeLessThanOrEqual(
      (bounds?.x ?? 0) + (bounds?.width ?? 0),
    );
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
      (bounds?.y ?? 0) + (bounds?.height ?? 0),
    );
  } finally {
    await classicBrowser.close();
  }
});

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
    await page.getByRole("button", { name: "決定した課題" }).click();
    // 参照欄への外側クリックで閉じたガイドを再度開いて同時表示を検証する。
    await settled(page, "compact");
    await page.getByRole("button", { name: "進め方", exact: true }).click();
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

test("390pxでは初回も説明を閉じ、入口から詳細を全文参照して操作へ戻れる", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, "room-roomboardview--phase-1-first-step-intro");
    await settled(page, "compact");
    const shell = page.getByTestId("step-guide");
    expect(
      await shell.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(false);
    expect(await page.getByRole("status", { name: "最初の一歩" }).count()).toBe(
      0,
    );
    expect((await shell.boundingBox())?.width).toBeLessThanOrEqual(126);
    await page.getByRole("button", { name: "進め方", exact: true }).click();
    await settled(page, "detail");
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    await page.keyboard.press("End");
    await page.waitForTimeout(5500);
    expect(await shell.getAttribute("data-state")).toBe("detail");
    expect(
      await detail.evaluate(
        (e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 1,
      ),
    ).toBe(true);
    expect(
      await shell.evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("0s");
    await page.keyboard.press("Escape");
    await settled(page, "compact");
    await page.keyboard.press("Enter");
    await settled(page, "detail");
    await page.keyboard.press("Tab");
    await settled(page, "compact");
    await page.getByRole("button", { name: "進め方", exact: true }).click();
    await settled(page, "detail");
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await settled(page, "compact");
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
  } finally {
    await page.close();
  }
});

test.each([
  { name: "問い作成", story: "phase-2-step-1" },
  { name: "アイデア作成", story: "phase-3-step-1" },
])("390pxの$nameガイドは付箋操作を覆わず末尾まで読める", async ({ story }) => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, `room-roomboardlayout--${story}`);
    await settled(page, "detail");
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    await detail.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const last = await detail.locator("dl > div").last().boundingBox();
    const box = await detail.boundingBox();
    expect(last).not.toBeNull();
    expect(box).not.toBeNull();
    expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual(
      (box?.y ?? 0) + (box?.height ?? 0),
    );
    const add = page.getByRole("button", { name: "付箋を追加", exact: true });
    expect(
      await add.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      }),
    ).toBe(true);
  } finally {
    await page.close();
  }
});

test.each([
  390, 1280,
])("%ipxで短い作業と例を読み、初回案内から直接開いて操作へ戻れる", async (width) => {
  const page = await browser.newPage({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await open(page, "room-roomboardview--phase-1-first-step-intro");
    await page
      .getByRole("button", {
        name: width <= 639 ? "進め方" : "進め方を見る",
        exact: true,
      })
      .click();
    await settled(page, "detail");
    const detail = page.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    expect(
      await detail
        .getByRole("heading", { name: "困ったことを書く" })
        .isVisible(),
    ).toBe(true);
    expect(
      await detail
        .getByText("「付箋を追加」を押し、最近あった困ったことを1つ書く。")
        .isVisible(),
    ).toBe(true);
    await page.screenshot({ path: `${output}/clear-first-step-${width}.png` });
    const actionBounds = await detail
      .getByText("「付箋を追加」を押し、最近あった困ったことを1つ書く。")
      .boundingBox();
    const detailBounds = await detail.boundingBox();
    if (!actionBounds || !detailBounds)
      throw new Error("最初の操作の表示範囲を取得できません");
    expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
      detailBounds.y + detailBounds.height,
    );

    await page.keyboard.press("Escape");
    await settled(page, "compact");
    const trigger = page.getByRole("button", { name: "進め方", exact: true });
    expect((await trigger.textContent())?.trim()).toBe("進め方");
    const compactBounds = await page.getByTestId("step-guide").boundingBox();
    if (width <= 639) {
      expect(compactBounds?.width).toBeLessThanOrEqual(126);
      expect(compactBounds?.width).toBeGreaterThanOrEqual(44);
    } else {
      expect(compactBounds?.width).toBe(126);
    }
    expect(compactBounds?.height).toBe(42);
    await page.screenshot({ path: `${output}/simple-compact-${width}.png` });
    expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(
      true,
    );
    await trigger.press("Enter");
    await settled(page, "detail");
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await settled(page, "compact");
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
    await page.screenshot({
      path: `${output}/clear-first-action-${width}.png`,
    });
  } finally {
    await page.close();
  }
});

test.each([
  390, 1180, 1280,
])("%ipxでスクロールバーを常時表示する環境でも各工程の案内が横にはみ出さない", async (width) => {
  // headlessの非表示設定を外し、OSの常時表示に相当する幅を指定して検証する。
  const classicBrowser = await chromium.launch({
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  const page = await classicBrowser.newPage({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    for (const story of [
      "detail",
      "sharing",
      "grouping",
      "voting",
      "question",
      "comparing",
      "host",
      "sharing-host",
    ]) {
      await open(page, `room-stepguide--${story}`);
      await settled(page, "detail");
      await page.addStyleTag({
        content: "*::-webkit-scrollbar { width: 14px; height: 14px; }",
      });
      const detail = page.getByRole("region", {
        name: "ファシリテーションガイド",
      });
      await page.screenshot({
        path: `${output}/clear-${story}-first-${width}.png`,
      });
      const figure = detail.getByRole("figure");
      await figure.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/clear-${story}-${width}.png` });
      const box = await figure.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      expect(await detail.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({ path: `${output}/clear-${story}-${width}.png` });
      if (story === "host" || story === "sharing-host") {
        await detail
          .getByText("ホストへ", { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/clear-${story}-timer-${width}.png`,
        });
      }
    }
  } finally {
    await classicBrowser.close();
  }
});
