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
async function story(page: Page, id: string) {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.getByTestId("timer-floating").waitFor({ state: "attached" });
}
async function rect(page: Page, id: string) {
  const r = await page.getByTestId(id).boundingBox();
  if (!r) throw new Error(`${id}が表示されません`);
  return r;
}

test.each([1280, 390])(
  "幅%dで時間切れ後の1分延長とドラッグを操作できる",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      hasTouch: width === 390,
    });
    try {
      await story(page, "room-roomtimer--interactive");
      const circle = page.getByTestId("room-timer");
      await circle.click();
      expect(await circle.getAttribute("data-status")).toBe("running");
      await circle.click();
      expect(await circle.getAttribute("data-status")).toBe("running");
      const extend = page.getByRole("button", { name: "＋1分" });
      await extend.waitFor();
      await expect
        .poll(async () => (await rect(page, "timer-floating")).width)
        .toBeCloseTo(112, 0);
      expect(await extend.locator("svg").count()).toBe(0);
      expect(
        await page
          .getByTestId("timer-floating")
          .evaluate((node) => node.getAnimations({ subtree: true }).length),
      ).toBe(0);
      const bounds = await rect(page, "timer-floating");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await extend.click();
      await circle.waitFor();
      expect(await circle.getAttribute("data-status")).toBe("running");
      await expect
        .poll(() => page.getByRole("timer").getAttribute("aria-label"))
        .toMatch(/00:5[0-9]|01:00/);
    } finally {
      await page.close();
    }
  },
);

test.each([1280, 390])(
  "幅%dで実行中の円をドラッグしても一時停止しない",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await story(page, "room-roomtimer--interactive-running");
      const circle = page.getByTestId("room-timer");
      await circle.click();
      const before = await rect(page, "timer-floating");
      expect(before.width).toBeCloseTo(72);
      expect(before.height).toBeCloseTo(72);
      await page.mouse.move(before.x + 28, before.y + 28);
      await page.mouse.down();
      await page.mouse.move(before.x - 100, before.y + 100, { steps: 10 });
      await page.mouse.up();
      const after = await rect(page, "timer-floating");
      expect(after.x).toBeLessThan(before.x);
      expect(after.y).toBeGreaterThan(before.y);
      expect(await circle.getAttribute("data-status")).toBe("running");
    } finally {
      await page.close();
    }
  },
);

test("延長後の時間切れでは空の円を表示しない", async () => {
  const page = await browser.newPage();
  try {
    await story(page, "room-roomtimer--ended-after-extension");
    expect(await page.getByRole("button", { name: "＋1分" }).count()).toBe(0);
    expect(await page.getByTestId("timer-floating").isVisible()).toBe(false);
  } finally {
    await page.close();
  }
});

test("390pxの問い共有でタイマー下のマイ付箋が下部の操作欄を覆わない", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await story(page, "room-roomboardlayout--phase-2-step-2");
    const notes = await rect(page, "private-notes-toolbar");
    const operations = await rect(page, "board-operation-matrix");
    expect(notes.y + notes.height).toBeLessThanOrEqual(operations.y - 12);
    const close = page.getByRole("button", { name: "マイ付箋を閉じる" });
    expect(
      await close.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        );
      }),
    ).toBe(true);
    await close.click();
    expect(
      await page.getByRole("button", { name: "マイ付箋を開く" }).isVisible(),
    ).toBe(true);
  } finally {
    await page.close();
  }
});

test.each([1280, 768, 390])(
  "幅%dでHUD・タイマー・開いたマイ付箋を重ねず、移動先も画面内に収める",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await story(page, "room-roomboardview--floating-timer-running");
      const hud = await rect(page, "board-control-hud");
      const timer = await rect(page, "timer-floating");
      expect(timer.y).toBeGreaterThanOrEqual(hud.y + hud.height + 11);
      const openNotes = page.getByRole("button", {
        name: "マイ付箋を開く",
        exact: true,
      });
      if (await openNotes.count()) await openNotes.click();
      const notes = await rect(page, "private-notes-toolbar");
      expect(notes.y).toBeGreaterThanOrEqual(timer.y + timer.height + 11);
      await page.mouse.move(timer.x + 28, timer.y + 28);
      await page.mouse.down();
      await page.mouse.move(notes.x + 40, notes.y + 40, { steps: 12 });
      await page.mouse.up();
      const parked = await rect(page, "timer-floating");
      const overlaps =
        parked.x < notes.x + notes.width &&
        parked.x + parked.width > notes.x &&
        parked.y < notes.y + notes.height &&
        parked.y + parked.height > notes.y;
      expect(overlaps).toBe(false);
      expect(parked.x).toBeGreaterThanOrEqual(0);
      expect(parked.x + parked.width).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  },
);

test("幅982pxでマイ付箋を開いてもタイマーを右上HUDの下に保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 982, height: 390 },
    reducedMotion: "reduce",
  });
  try {
    await story(page, "room-roomboardview--floating-timer-running");
    const openNotes = page.getByRole("button", {
      name: "マイ付箋を開く",
      exact: true,
    });
    if (await openNotes.count()) await openNotes.click();
    await expect
      .poll(async () => {
        const [root, timer] = await Promise.all([
          rect(page, "room-board-view-root"),
          rect(page, "timer-floating"),
        ]);
        return Math.abs(root.x + root.width - 12 - timer.x - timer.width);
      })
      .toBeLessThanOrEqual(1);
    const timer = await rect(page, "timer-floating");
    const hud = await rect(page, "board-control-hud");
    const notes = await rect(page, "private-notes-toolbar");
    expect(timer.y).toBeGreaterThanOrEqual(hud.y + hud.height + 11);
    expect(notes.y).toBeGreaterThanOrEqual(timer.y + timer.height + 11);
  } finally {
    await page.close();
  }
});

test.each([1280, 390])(
  "幅%dの共有完了の操作は画面内で押せ、再共有で円へ戻る",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await story(page, "room-roomboardview--floating-timer-sharing-complete");
      const timer = await rect(page, "timer-floating");
      expect(timer.x).toBeGreaterThanOrEqual(0);
      expect(timer.x + timer.width).toBeLessThanOrEqual(width);
      expect(timer.height).toBeCloseTo(72);
      expect(timer.width).toBeCloseTo(Math.min(288, width - 24), 0);
      for (const name of ["共有を続ける", "付箋を書き足す"]) {
        const b = page.getByRole("button", { name, exact: true });
        expect(await b.isVisible()).toBe(true);
        const r = await b.boundingBox();
        expect(r?.height).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole("button", { name: "共有を続ける" }).click();
      await page.getByTestId("room-timer").waitFor();
      expect(
        await page.getByTestId("room-timer").getAttribute("data-status"),
      ).toBe("running");
    } finally {
      await page.close();
    }
  },
);
