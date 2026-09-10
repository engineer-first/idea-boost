import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await vi.waitFor(
    async () => {
      expect((await fetch(`${origin}/index.json`)).ok).toBe(true);
    },
    { timeout: 90_000, interval: 1000 },
  );
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function expectLayout(): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const boxes = await page
    .locator(
      [
        '[data-testid="board-context-hud"]',
        '[data-testid="board-control-hud"]',
        '[data-testid="board-control-hud"] > [role="status"]',
        '[data-testid="board-carryovers"]',
        '[data-testid="board-guide-region"]:visible',
        '[data-testid="board-help-panel"] > div',
        '[data-testid="private-notes-toolbar"]',
        '[data-testid="board-tools-hud"]',
        '[data-testid="vote-palette-hud"] > *',
      ].join(","),
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute("data-testid") ?? "help",
        ...element.getBoundingClientRect().toJSON(),
      })),
    );
  for (const box of boxes) {
    expect(box.left, box.id).toBeGreaterThanOrEqual(0);
    expect(box.top, box.id).toBeGreaterThanOrEqual(0);
    expect(box.right, box.id).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom, box.id).toBeLessThanOrEqual(720);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (const other of boxes.slice(i + 1)) {
      const box = boxes[i];
      const overlap =
        Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
        Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1;
      expect(overlap, `${box.id} / ${other.id}`).toBe(false);
    }
  }
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual(viewport);
}

const steps = [
  "1-1",
  "1-2",
  "1-3",
  "1-4",
  "1-5",
  "2-1",
  "2-2",
  "2-3",
  "2-4",
  "3-1",
  "3-2",
  "3-3",
  "3-4",
  "3-5",
];
test.each(
  steps,
)("1280×720: %s の主要領域が重ならず画面内に収まる", async (step) => {
  const [phase, number] = step.split("-");
  await openStory(`room-roomboardlayout--phase-${phase}-step-${number}`);
  await page.getByTestId("board-context-hud").waitFor();
  // 集計ステップは結果ダイアログを閉じたボード本体も検査する。
  await page.keyboard.press("Escape");
  await expectLayout();
  await page.screenshot({ path: `${output}/${step}.png` });
});

test("左右の開閉は独立し、多数の付箋とヒントは内部スクロールで末尾に到達できる", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  const canvas = page.getByTestId("board-canvas");
  const before = await canvas.boundingBox();
  await page.getByRole("button", { name: "マイ付箋を開く" }).click();
  const scroll = page.getByTestId("private-notes-scroll");
  const size = await scroll.evaluate((e) => ({
    height: e.clientHeight,
    scroll: e.scrollHeight,
  }));
  expect(size.height).toBeLessThan(size.scroll);
  expect(size.height).toBeLessThan(544);
  await scroll.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  expect(await scroll.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  const last = await scroll
    .locator('[data-testid="note-card"]')
    .last()
    .boundingBox();
  const bounds = await scroll.boundingBox();
  expect(last ? last.y + last.height : Infinity).toBeLessThanOrEqual(
    (bounds?.y ?? 0) + (bounds?.height ?? 0),
  );
  await page.getByRole("tab", { name: "発想を広げる" }).click();
  const help = page.locator("#board-help-content");
  expect(await help.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await help.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  expect(await help.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expectLayout();
  await page.screenshot({ path: `${output}/both-panels.png` });
  await page.getByRole("button", { name: "考えるヒントを閉じる" }).click();
  expect(
    await page
      .getByTestId("private-notes-toolbar")
      .getAttribute("data-expanded"),
  ).toBe("true");
  expect(await canvas.boundingBox()).toEqual(before);
  expect(
    await page.evaluate(
      () =>
        document
          .elementFromPoint(180, 500)
          ?.closest('[data-testid="board-help-panel"]') === null,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "考えるヒントを開く" }).click();
  expect(
    await page
      .getByRole("tab", { name: "発想を広げる" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  await expectLayout();
});

test.each([
  "reconnecting",
  "participant",
])("%s でも配置を保ち長い決定文の全文を読める", async (variant) => {
  await openStory(`room-roomboardlayout--${variant}`);
  await page.getByTestId("board-carryovers").waitFor();
  await expectLayout();
  await page.getByRole("button", { name: "決定した課題の全文を表示" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  expect(await dialog.innerText()).toContain("全員が自分の考えを伝え");
  const bounds = await dialog.boundingBox();
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(720);
});

async function expectOpaqueAndReadable(locator: Locator): Promise<void> {
  const style = await locator.evaluate((element) => {
    const css = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    function rgba(color: string): number[] {
      if (!context) throw new Error("Canvas unavailable");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }
    function luminance(color: number[]): number {
      const rgb = color
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    const bg = rgba(css.backgroundColor);
    const fg = rgba(css.color);
    const a = luminance(bg),
      b = luminance(fg);
    let opacity = 1;
    for (let e: Element | null = element; e; e = e.parentElement)
      opacity *= Number(getComputedStyle(e).opacity);
    return {
      alpha: bg[3],
      opacity,
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    };
  });
  expect(style.alpha).toBe(255);
  expect(style.opacity).toBe(1);
  expect(style.contrast).toBeGreaterThanOrEqual(4.5);
}

for (const theme of ["light", "dark"]) {
  for (const transparency of ["no-preference", "reduce"]) {
    test(`${theme}/${transparency}: タイマー全状態の不透明度・コントラスト・寸法`, async () => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-reduced-transparency", value: transparency },
          { name: "prefers-color-scheme", value: theme },
        ],
      });
      for (const state of ["idle", "running", "paused", "ended"]) {
        await openStory(`room-roomtimer--${state}-host`);
        expect(
          await page.evaluate(
            () => matchMedia("(prefers-color-scheme: dark)").matches,
          ),
        ).toBe(theme === "dark");
        const timer = page.getByTestId("room-timer");
        await timer.waitFor();
        await expectOpaqueAndReadable(timer);
        const bounds = await timer.boundingBox();
        expect({ width: bounds?.width, height: bounds?.height }).toEqual({
          width: 112,
          height: 40,
        });
        await timer.click();
        const panel = page.getByTestId("room-timer-panel");
        await panel.waitFor();
        // Radix の登場アニメーションが完了してから実効 opacity を調べる。
        await expect
          .poll(() =>
            panel.evaluate((e) =>
              e
                .getAnimations()
                .every((animation) => animation.playState === "finished"),
            ),
          )
          .toBe(true);
        await expectOpaqueAndReadable(panel);
        await page.screenshot({
          path: `${output}/timer-${theme}-${transparency}-${state}.png`,
        });
      }
    });
  }
}

test("HMW例は内部スクロールで読め、閉じるとボードを操作できる", async () => {
  await openStory("room-roomboardlayout--phase-2-step-1");
  const content = page.locator("#board-help-content");
  expect(await content.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await content.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  expect(await content.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "考えるヒントを閉じる" }).focus();
  await page.keyboard.press("Escape");
  expect(
    await page
      .getByRole("button", { name: "考えるヒントを開く" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  await expectLayout();
});

test("接続中断時と参加者表示でもタイマーを薄くしない", async () => {
  for (const state of ["idle", "running", "paused", "ended"]) {
    await openStory(`room-roomtimer--${state}-host&args=disabled:true`);
    const timer = page.getByTestId("room-timer");
    await timer.waitFor();
    expect(await timer.isDisabled()).toBe(true);
    await expectOpaqueAndReadable(timer);
    if (state !== "idle") {
      await openStory(`room-roomtimer--${state}-member`);
      await page.getByTestId("room-timer").waitFor();
      await expectOpaqueAndReadable(page.getByTestId("room-timer"));
    }
  }
});

test("透明効果を減らす設定ではボード上のHUD全体が不透明", async () => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await openStory("room-roomboardlayout--reconnecting");
  await page.getByTestId("board-context-hud").waitFor();
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
    ),
  ).toBe(true);
  for (const hud of await page.locator(".board-hud:visible").all()) {
    await expectOpaqueAndReadable(hud);
  }
});

test("アイデア決定後も完了操作と決定結果が画面内で読める", async () => {
  await openStory("room-roomboardlayout--completed");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  expect(await dialog.getByText("決定済み", { exact: true }).isVisible()).toBe(
    true,
  );
  const box = await dialog.boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
  await page.screenshot({ path: `${output}/completed-result.png` });
  await page.keyboard.press("Escape");
  await page.getByText("スプリント完了", { exact: true }).waitFor();
  await expectLayout();
});

test.each([
  1280, 1024, 768,
])("幅 %i でも現在地を省略せず、タイマーと次への操作を保つ", async (width) => {
  await page.setViewportSize({ width, height: 720 });
  await openStory("room-roomboardlayout--phase-3-step-1");
  const hud = page.getByTestId("board-context-hud");
  await hud.waitFor();
  const step = hud.getByText("アイデアを書き出す（個人）", { exact: true });
  expect(await step.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await hud.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const timer = await page.getByTestId("room-timer").boundingBox();
  expect({ width: timer?.width, height: timer?.height }).toEqual({
    width: 112,
    height: 40,
  });
  const next = page.getByRole("button", {
    name: "次のステップへ",
    exact: true,
  });
  const box = await next.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  await page.getByRole("button", { name: "マイ付箋を開く" }).click();
  expect(
    (await page.getByTestId("private-notes-toolbar").boundingBox())?.width,
  ).toBe(240);
  await expectLayout();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    width,
  );
  await page.screenshot({ path: `${output}/refreshed-${width}.png` });
});

test("考えるヒントは白地のタブにし、スクロールしても大分類を切り替えられる", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.getByRole("tab", { name: "発想を広げる", exact: true }).click();
  const panel = page.getByTestId("board-help-panel");
  expect(await panel.evaluate((e) => getComputedStyle(e).fontFamily)).toContain(
    "sans-serif",
  );
  expect(
    await panel
      .locator("[data-help-toggle]")
      .evaluate(
        (e) =>
          getComputedStyle(e).backgroundColor ===
          getComputedStyle(e.parentElement as Element).backgroundColor,
      ),
  ).toBe(true);
  for (const tabs of await panel.getByRole("tablist").all()) {
    expect(await tabs.getAttribute("data-variant")).toBe("line");
  }
  await page.locator("#board-help-content").evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  const tab = panel.getByRole("tab", { name: "書き出し", exact: true });
  const box = await tab.boundingBox();
  expect(
    await tab.evaluate((e) => {
      const rect = e.getBoundingClientRect();
      return e.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    }),
  ).toBe(true);
  expect(box?.height).toBeGreaterThanOrEqual(32);
});

test.each([
  1024, 768,
])("幅 %i の全ステップで現在地と進行操作を隠さない", async (width) => {
  await page.setViewportSize({ width, height: 720 });
  for (const step of steps) {
    const [phase, number] = step.split("-");
    await openStory(`room-roomboardlayout--phase-${phase}-step-${number}`);
    const hud = page.getByTestId("board-context-hud");
    await hud.waitFor();
    await page.keyboard.press("Escape");
    expect(
      await hud
        .locator(".truncate")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
      step,
    ).toBe(true);
    expect(
      await hud.evaluate((e) => e.scrollWidth <= e.clientWidth),
      step,
    ).toBe(true);
    for (const next of await page
      .getByTestId("board-control-hud")
      .getByRole("button", { name: /次の/ })
      .all()) {
      const box = await next.boundingBox();
      expect(box, step).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0), step).toBeLessThanOrEqual(
        width,
      );
    }
    await expectLayout();
  }
});

test.each([
  1280, 1024, 768,
])("幅 %i でも進捗バーと参加者の省略表示を残す", async (width) => {
  await page.setViewportSize({ width, height: 720 });
  await openStory("room-roomboardlayout--phase-3-step-1");
  const progress = page.getByTestId("board-progress-rail");
  await progress.waitFor({ state: "attached" });
  expect(await progress.isVisible()).toBe(true);
  const members = page.getByRole("button", {
    name: "参加者 12人",
    exact: true,
  });
  expect(
    await members
      .locator(
        ':scope > span[aria-hidden="true"] > span:not([data-testid="member-overflow-indicator"]):visible',
      )
      .count(),
  ).toBe(width >= 1280 ? 10 : width >= 1024 ? 3 : 1);
  const more = members.getByTestId("member-overflow-indicator");
  expect(await more.isVisible()).toBe(true);
  expect((await more.innerText()).trim()).toBe(
    width >= 1280 ? "+2" : width >= 1024 ? "+9" : "+11",
  );
  const moreBox = await more.boundingBox();
  expect({ width: moreBox?.width, height: moreBox?.height }).toEqual({
    width: 28,
    height: 28,
  });
  expect(
    await more.evaluate((e) =>
      Number.parseFloat(getComputedStyle(e).borderRadius),
    ),
  ).toBeGreaterThanOrEqual(14);
  await more.click();
  const dialog = page.getByRole("dialog", { name: "参加者一覧" });
  await dialog.waitFor();
  expect(await dialog.locator("li").count()).toBe(12);
});

test("発想支援は切替より本文を優先し、スクロール前に3項目以上読める", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.getByRole("tab", { name: "発想を広げる", exact: true }).click();
  const panel = await page.getByTestId("board-help-panel").boundingBox();
  const content = await page.locator("#board-help-content").boundingBox();
  expect((content?.height ?? 0) / (panel?.height ?? 1)).toBeGreaterThanOrEqual(
    0.68,
  );
  const third = await page
    .locator("#board-help-content li")
    .nth(2)
    .boundingBox();
  expect((third?.y ?? 0) + (third?.height ?? 0)).toBeLessThanOrEqual(
    (content?.y ?? 0) + (content?.height ?? 0),
  );
});

test("参加者が全員表示される幅では省略マークを出さない", async () => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await openStory("room-roomboardview--with-notes");
  const members = page.getByRole("button", { name: "参加者 3人", exact: true });
  await members.waitFor();
  expect(
    await members.getByTestId("member-overflow-indicator").isVisible(),
  ).toBe(false);
  await page.setViewportSize({ width: 768, height: 720 });
  expect(
    await members.getByTestId("member-overflow-indicator").isVisible(),
  ).toBe(true);
});
