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
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      // 静的サーバーが接続を閉じる前に応答本文を最後まで消費する。
      await response.arrayBuffer();
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

async function openStory(id: string, args?: string): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=${id}&viewMode=story${args ? `&args=${args}` : ""}`,
  );
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
        '[data-testid="board-connection-status"]',
        '[data-testid="board-help-panel"] > div',
        '[data-testid="private-notes-toolbar"]',
        '[data-testid="board-tools-hud"]',
        '[data-testid="board-operation-matrix"]',
        '[data-testid="vote-palette-hud"] > *',
      ].join(","),
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute("data-testid") ?? "help",
        presentation: element.getAttribute("data-presentation"),
        ...element.getBoundingClientRect().toJSON(),
      })),
    );
  for (const box of boxes) {
    expect(box.left, box.id).toBeGreaterThanOrEqual(0);
    expect(box.top, box.id).toBeGreaterThanOrEqual(0);
    expect(box.right, box.id).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom, box.id).toBeLessThanOrEqual(viewport.height);
  }
  const collisionBoxes = boxes.filter(
    (box) =>
      !(box.id === "private-notes-toolbar" && box.presentation === "workspace"),
  );

  for (let i = 0; i < collisionBoxes.length; i++) {
    for (const other of collisionBoxes.slice(i + 1)) {
      const box = collisionBoxes[i];
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

test("マイ付箋は0枚・1枚・多数件で展開寸法を固定し、一覧だけをスクロールする", async () => {
  const states = ["empty", "single", "many"] as const;
  const measurements = [];

  for (const state of states) {
    await openStory(`notes-privatenotestoolbar--${state}`);
    const toolbar = page.getByTestId("private-notes-toolbar");
    const scroll = page.getByTestId("private-notes-scroll");
    const box = await toolbar.boundingBox();
    const measurement = await toolbar.evaluate((element) => {
      const title = element.querySelector('[data-slot="card-title"]');
      const css = title ? getComputedStyle(title) : null;
      return {
        height: element.getBoundingClientRect().height,
        width: element.getBoundingClientRect().width,
        titleTextAlign: css?.textAlign,
      };
    });
    measurements.push({
      state,
      ...measurement,
      left: box?.x ?? null,
      top: box?.y ?? null,
      right: box ? box.x + box.width : null,
      bottom: box ? box.y + box.height : null,
      scrollHeight: await scroll.evaluate((element) => element.scrollHeight),
      clientHeight: await scroll.evaluate((element) => element.clientHeight),
      overflowY: await scroll.evaluate(
        (element) => getComputedStyle(element).overflowY,
      ),
    });
    await page.screenshot({ path: `${output}/private-notes-${state}.png` });
  }

  expect(new Set(measurements.map(({ height }) => height)).size).toBe(1);
  expect(new Set(measurements.map(({ width }) => width)).size).toBe(1);
  expect(measurements.every(({ width }) => width <= 240)).toBe(true);
  expect(measurements.every(({ left }) => (left ?? -Infinity) >= 0)).toBe(true);
  expect(measurements.every(({ top }) => (top ?? -Infinity) >= 0)).toBe(true);
  expect(measurements.every(({ right }) => (right ?? Infinity) <= 1280)).toBe(
    true,
  );
  expect(measurements.every(({ bottom }) => (bottom ?? Infinity) <= 720)).toBe(
    true,
  );
  expect(
    measurements.every(({ titleTextAlign }) => titleTextAlign === "start"),
  ).toBe(true);
  expect(measurements.every(({ overflowY }) => overflowY === "auto")).toBe(
    true,
  );

  const many = measurements.find(({ state }) => state === "many");
  expect(many?.scrollHeight).toBeGreaterThan(many?.clientHeight ?? Infinity);
});

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
test.each(steps)(
  "1280×720: %s の主要領域が重ならず画面内に収まる",
  async (step) => {
    const [phase, number] = step.split("-");
    await openStory(`room-roomboardlayout--phase-${phase}-step-${number}`);
    await page.getByTestId("board-context-hud").waitFor();
    // 集計ステップは結果ダイアログを閉じたボード本体も検査する。
    await page.keyboard.press("Escape");
    await expectLayout();
    await page.screenshot({ path: `${output}/${step}.png` });
  },
);

test("現在地・工程進捗カードは上部操作HUDと上端・高さを揃える", async () => {
  await openStory("room-roomboardlayout--phase-1-step-1");
  const location = await page.getByTestId("board-location-card").boundingBox();
  const controls = await page.getByTestId("board-control-hud").boundingBox();
  expect(location).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(location?.y).toBe(controls?.y);
  expect(location?.height).toBe(controls?.height);
});

test("左右の開閉は独立し、多数の付箋とヒントは内部スクロールで末尾に到達できる", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.getByRole("button", { name: "考えるヒントを開く" }).click();
  expect(await page.getByTestId("board-scroller").isVisible()).toBe(false);
  const toolbar = page.getByTestId("private-notes-toolbar");
  expect(await toolbar.getAttribute("data-presentation")).toBe("workspace");
  const beforeToolbar = await toolbar.boundingBox();
  const scroll = page.getByTestId("private-notes-scroll");
  const size = await scroll.evaluate((e) => ({
    height: e.clientHeight,
    scroll: e.scrollHeight,
  }));
  expect(size.height).toBeGreaterThan(150);
  expect(size.height).toBeLessThan(size.scroll);
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
  await help.getByRole("button", { name: /ほかの問いを見る/ }).click();
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
  expect(await toolbar.boundingBox()).toEqual(beforeToolbar);
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

test.each(["reconnecting", "participant"])(
  "%s でも配置を保ち長い決定文の全文を読める",
  async (variant) => {
    await openStory(`room-roomboardlayout--${variant}`);
    await expectLayout();
    await page.getByText("決定した課題", { exact: true }).click();
    const content = page.getByTestId("board-context-hud");
    expect(await content.innerText()).toContain("全員が自分の考えを伝え");
    expect(await content.innerText()).toContain("決定した問い");
    await expectLayout();
  },
);

for (const [phase, reference] of [
  [2, "issue"],
  [3, "hmw"],
] as const) {
  test(`${phase}-1の付箋と追加カードは参照情報の右側の中央に横一列で並ぶ`, async () => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openStory(`room-roomboardlayout--phase-${phase}-step-1`);

    const workspace = page.getByTestId("private-notes-toolbar");
    const list = page.getByTestId("private-notes-list");
    const layout = await page.evaluate(() => {
      const workspace = document.querySelector(
        '[data-testid="private-notes-toolbar"]',
      );
      const references = document.querySelector(
        '[data-testid="board-context-references"]',
      );
      const list = document.querySelector('[data-testid="private-notes-list"]');
      if (!workspace || !references || !list) return null;
      const workspaceBounds = workspace.getBoundingClientRect();
      const areaLeft = Math.max(
        workspaceBounds.left,
        references.getBoundingClientRect().right,
      );
      const cards = Array.from(list.children).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      });
      const firstRowTop = cards[0]?.top;
      const firstRow = cards.filter(
        (card) => Math.abs(card.top - (firstRowTop ?? 0)) < 1,
      );
      return {
        areaCenter: (areaLeft + workspaceBounds.right) / 2,
        firstRowCenter:
          firstRow.length > 0
            ? (firstRow[0].left + firstRow[firstRow.length - 1].right) / 2
            : null,
        firstRowCount: firstRow.length,
      };
    });

    expect(await workspace.isVisible()).toBe(true);
    expect(await list.isVisible()).toBe(true);
    expect(layout).not.toBeNull();
    expect(layout?.firstRowCount).toBe(5);
    expect(
      Math.abs((layout?.firstRowCenter ?? 0) - (layout?.areaCenter ?? 0)),
    ).toBeLessThan(16);
  });

  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    test(`${phase}-1 ${width}×${height}pxで参照情報は付箋と追加カードに重ならない`, async () => {
      await page.setViewportSize({ width, height });
      await openStory(`room-roomboardlayout--phase-${phase}-step-1`);

      const referenceNote = page
        .getByTestId(`board-reference-${reference}-content`)
        .locator("xpath=..");
      const addNote = page.getByRole("button", {
        name: "付箋を追加",
        exact: true,
      });
      expect(await referenceNote.isVisible()).toBe(true);
      expect(await addNote.isVisible()).toBe(true);

      const referenceBox = await referenceNote.boundingBox();
      if (!referenceBox) throw new Error("参照付箋が見つかりません");
      const cardBoxes = await page
        .getByTestId("private-notes-list")
        .locator(":scope > *")
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().toJSON()),
        );
      for (const card of cardBoxes) {
        const overlaps =
          Math.min(referenceBox.x + referenceBox.width, card.right) >
            Math.max(referenceBox.x, card.left) &&
          Math.min(referenceBox.y + referenceBox.height, card.bottom) >
            Math.max(referenceBox.y, card.top);
        expect(overlaps, JSON.stringify({ referenceBox, card })).toBe(false);
      }
      expect(
        await addNote.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            document
              .elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              )
              ?.closest('button[aria-label="付箋を追加"]') === element
          );
        }),
      ).toBe(true);
    });
  }
}

test("3-1で考えるヒントを開いても、付箋と追加カードはヒントに隠れない", async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.getByRole("button", { name: "考えるヒントを開く" }).click();
  const help = page.locator('[data-testid="board-help-panel"] > div');
  await expect
    .poll(() => help.evaluate((e) => e.getBoundingClientRect().width))
    .toBeGreaterThan(300);
  const helpBox = await help.boundingBox();
  if (!helpBox) throw new Error("考えるヒントが見つかりません");
  const cards = await page
    .getByTestId("private-notes-list")
    .locator(":scope > *")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().toJSON()),
    );
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    const overlaps =
      Math.min(helpBox.x + helpBox.width, card.right) >
        Math.max(helpBox.x, card.left) &&
      Math.min(helpBox.y + helpBox.height, card.bottom) >
        Math.max(helpBox.y, card.top);
    expect(overlaps, JSON.stringify({ helpBox, card })).toBe(false);
  }
});

for (const phase of [1, 2, 3] as const) {
  test(`${phase}-1ではマイ付箋エリア外の余白に無限キャンバスが見える`, async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStory(`room-roomboardlayout--phase-${phase}-step-1`);

    const privateNotes = page.getByTestId("private-notes-toolbar");
    expect(await privateNotes.isVisible()).toBe(true);
    await expectOpaqueAndReadable(privateNotes);

    const boardScroller = page.getByTestId("board-scroller");
    if (phase === 1) {
      expect(await boardScroller.isVisible()).toBe(true);
      expect(
        await boardScroller.evaluate(
          (element) => getComputedStyle(element).filter,
        ),
      ).toBe("blur(4px)");
    } else {
      expect(await boardScroller.isVisible()).toBe(false);
    }

    const canvas = page.getByTestId("private-workspace-canvas-backdrop");
    expect(await canvas.isVisible()).toBe(true);
    const backdropStyle = await canvas.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        filter: style.filter,
        pointerEvents: style.pointerEvents,
      };
    });
    expect(backdropStyle.backgroundImage).not.toBe("none");
    expect(backdropStyle.filter).toBe("none");
    expect(backdropStyle.pointerEvents).toBe("none");

    const canvasBox = await canvas.boundingBox();
    const privateNotesBox = await privateNotes.boundingBox();
    if (!canvasBox || !privateNotesBox)
      throw new Error("キャンバスまたはマイ付箋エリアが見つかりません");
    expect(canvasBox.x).toBeLessThan(privateNotesBox.x);
    expect(canvasBox.y).toBeLessThan(privateNotesBox.y);
    expect(canvasBox.x + canvasBox.width).toBeGreaterThan(
      privateNotesBox.x + privateNotesBox.width,
    );
    expect(canvasBox.y + canvasBox.height).toBeGreaterThan(
      privateNotesBox.y + privateNotesBox.height,
    );
  });
}

test("1-1・2-1・3-1のマイ付箋エリアは現在地と上部メニューの真下から始まる", async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const tops: Record<string, number> = {};
  for (const phase of [1, 2, 3] as const) {
    await openStory(`room-roomboardlayout--phase-${phase}-step-1`);
    const box = await page.getByTestId("private-notes-toolbar").boundingBox();
    if (!box) throw new Error("マイ付箋エリアが見つかりません");
    tops[`${phase}-1`] = box.y;
  }
  // 1280×720では最上段の現在地・上部メニュー（下端68px）の真下、80pxから始める。
  // 接続案内はエリアの前面に重ねる。
  const expected = 80;
  for (const [key, top] of Object.entries(tops)) {
    expect(
      Math.abs(top - expected),
      `${key}: ${JSON.stringify(tops)}`,
    ).toBeLessThan(1);
  }
});

for (const id of [
  "phase-1-step-1",
  "phase-2-step-1",
  "phase-3-step-1",
  "phase-1-step-1-to-step-2",
  "phase-2-step-1-to-step-2",
  "phase-3-step-1-to-step-2",
]) {
  // 実ルームの個人作業では背景キャンバスに付箋が無い。資料用Storyがmeta既定の共有付箋を背景へ混入させないことを守る。
  test(`${id}: 個人作業のStoryは背景キャンバスに付箋を描画しない`, async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStory(`room-roomboardlayout--${id}`);
    await page.getByTestId("private-notes-toolbar").waitFor();
    // 2-1・3-1は背景キャンバスごと hidden になるため、表示状態で絞らずに数える。
    const backgroundNotes = await page
      .locator('[data-testid="board-scroller"] [data-note-id]')
      .count();
    expect(backgroundNotes).toBe(0);
  });
}

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

test("2-1は例付箋をマイ付箋に表示し、考えるヒントを表示しない", async () => {
  await openStory("room-roomboardlayout--phase-2-step-1");
  await page.keyboard.press("Escape");
  expect(
    await page.getByTestId("board-reference-issue-content").isVisible(),
  ).toBe(true);
  expect(await page.getByTestId("board-help-panel").count()).toBe(0);
  expect(
    await page
      .getByTestId("private-notes-toolbar")
      .getAttribute("data-expanded"),
  ).toBe("true");
  expect(
    await page
      .getByTestId("private-notes-scroll")
      .getByTestId("note-card")
      .count(),
  ).toBeGreaterThanOrEqual(2);
  await expectLayout();
});

test.each([2, 3] as const)(
  "%i-1から同フェーズのステップ2へ移行してもマイ付箋エリアを展開したままにする",
  async (phase) => {
    await openStory(`room-roomboardlayout--phase-${phase}-step-1-to-step-2`);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");

    await page.getByRole("button", { name: "次のステップへ" }).click();
    await expect
      .poll(() => toolbar.getAttribute("data-presentation"))
      .toBe("dock");
    await page.waitForTimeout(600);
    await expect.poll(() => toolbar.getAttribute("data-expanded")).toBe("true");
    await expect
      .poll(() => page.getByTestId("private-notes-scroll").isVisible())
      .toBe(true);

    await openStory(`room-roomboardlayout--phase-${phase}-step-2`);
    const reloadedToolbar = page.getByTestId("private-notes-toolbar");
    await expect
      .poll(() => reloadedToolbar.getAttribute("data-expanded"))
      .toBe("true");
    await expect
      .poll(() => page.getByTestId("private-notes-scroll").isVisible())
      .toBe(true);
  },
);

test("接続中断時と参加者表示でもタイマー枠を薄くせず、全状態で寸法を保つ", async () => {
  let participantPosition: { x: number; y: number } | undefined;

  for (const state of ["idle", "running", "paused", "ended"]) {
    await openStory(`room-roomtimer--${state}-host&args=disabled:true`);
    const timer = page.getByTestId("room-timer");
    await timer.waitFor();
    expect(await timer.isDisabled()).toBe(true);
    await expectOpaqueAndReadable(timer);
    await openStory(`room-roomtimer--${state}-member`);
    const memberTimer = page.getByTestId("room-timer");
    await memberTimer.waitFor();
    await expectOpaqueAndReadable(memberTimer);
    const bounds = await memberTimer.boundingBox();
    expect(bounds).not.toBeNull();
    expect({ width: bounds?.width, height: bounds?.height }).toEqual({
      width: 112,
      height: 40,
    });
    if (state === "idle") {
      participantPosition = { x: bounds?.x ?? NaN, y: bounds?.y ?? NaN };
    } else {
      expect({ x: bounds?.x, y: bounds?.y }).toEqual(participantPosition);
    }
    if (state === "idle") {
      expect(await memberTimer.textContent()).toBe("03:00");
      expect(await page.getByTestId("timer-sound-toggle").count()).toBe(1);
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

test("成果公開後は3件を表示し、編集ボードへ戻さずホームへ進める", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardlayout--completed&viewMode=story`,
  );
  await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  for (const label of ["決定した課題", "決定した問い", "採用したアイデア"]) {
    expect(await page.getByRole("heading", { name: label }).isVisible()).toBe(
      true,
    );
  }
  expect(await page.getByRole("dialog").count()).toBe(0);
  await page.screenshot({ path: `${output}/completed-result.png` });
  expect(await page.getByRole("button", { name: "ボードへ戻る" }).count()).toBe(
    0,
  );
  const home = page.getByRole("link", { name: "保存を確認してホームへ" });
  await home.scrollIntoViewIfNeeded();
  expect(await home.isVisible()).toBe(true);
  expect(await home.getAttribute("href")).toBe("/home");
});

test("採用案を選んだ後もボードに留まり、ホストにだけ完了チェックを示す", async () => {
  await openStory("room-roomboardlayout--final-decision-pending");
  expect(await page.getByTestId("room-board-view-root").isVisible()).toBe(true);
  expect(
    await page.getByRole("heading", { name: "チームで決めた成果" }).count(),
  ).toBe(0);
  const finish = page.getByRole("button", { name: "完了して成果を表示" });
  expect(await finish.isVisible()).toBe(true);
  expect(await finish.locator("svg").count()).toBe(1);
  await expectLayout();
});

test("決定ステップは高得票でも全シールを22pxのまま付箋内に表示する", async () => {
  await openStory("notes-notecard--result-with-many-votes");
  const card = page.getByTestId("note-card");
  const subjective = page.getByTestId("dot-vote-sticker-image-subjective");
  const objective = page.getByTestId("dot-vote-sticker-image-objective");

  expect(await subjective.count()).toBe(12);
  expect(await objective.count()).toBe(27);
  for (const sticker of await subjective.or(objective).all()) {
    const box = await sticker.boundingBox();
    expect({ width: box?.width, height: box?.height }).toEqual({
      width: 22,
      height: 22,
    });
  }

  const cardBox = await card.boundingBox();
  const resultsBox = await page.getByTestId("note-vote-results").boundingBox();
  expect(resultsBox?.x).toBeGreaterThanOrEqual(cardBox?.x ?? Number.NaN);
  expect((resultsBox?.x ?? 0) + (resultsBox?.width ?? 0)).toBeLessThanOrEqual(
    (cardBox?.x ?? Number.NaN) + (cardBox?.width ?? 0),
  );
  expect((resultsBox?.y ?? 0) + (resultsBox?.height ?? 0)).toBeLessThanOrEqual(
    (cardBox?.y ?? Number.NaN) + (cardBox?.height ?? 0),
  );
  await page.screenshot({ path: `${output}/vote-results-many.png` });
});

test("長文と結果行を分け、候補操作と決定済み印にも重ねない", async () => {
  await openStory("notes-notecard--result-with-long-content");
  const textBox = await page.getByRole("textbox").boundingBox();
  const resultsBox = await page.getByTestId("note-vote-results").boundingBox();
  expect((textBox?.y ?? 0) + (textBox?.height ?? 0)).toBeLessThanOrEqual(
    resultsBox?.y ?? Number.NaN,
  );

  for (const [storyId, controlName, objectiveCount] of [
    ["notes-notecard--result-with-candidate-action", "候補から外す", 8],
    ["notes-notecard--result-with-decision", "取り組む課題に決定済み", 10],
  ] as const) {
    await openStory(storyId);
    const votes = await page
      .getByRole("img", { name: `客観シール ${objectiveCount}票` })
      .boundingBox();
    const control = await page
      .getByRole(controlName === "候補から外す" ? "button" : "status", {
        name: controlName,
      })
      .boundingBox();
    expect(votes).not.toBeNull();
    expect(control).not.toBeNull();
    if (!votes || !control) {
      throw new Error(`${storyId} の配置を取得できません`);
    }
    const overlaps =
      Math.min(votes.x + votes.width, control.x + control.width) -
        Math.max(votes.x, control.x) >
        1 &&
      Math.min(votes.y + votes.height, control.y + control.height) -
        Math.max(votes.y, control.y) >
        1;
    expect(overlaps, storyId).toBe(false);
  }
});

test("確定済み付箋は影と競合せずcomputed styleで太い緑枠を示す", async () => {
  await openStory("room-roomboardview--decided");
  expect(
    await page.getByRole("dialog", { name: "投票結果", exact: true }).count(),
  ).toBe(0);
  const decidedNote = page.locator('[data-note-id="note-1"]');
  await decidedNote.waitFor();

  const outline = await decidedNote.evaluate((element) => {
    const probe = document.createElement("div");
    probe.style.outlineColor = "var(--color-emerald-600)";
    document.body.append(probe);
    const emerald = getComputedStyle(probe).outlineColor;
    probe.remove();

    const css = getComputedStyle(element);
    return {
      color: css.outlineColor,
      emerald,
      style: css.outlineStyle,
      width: Number.parseFloat(css.outlineWidth),
    };
  });

  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(4);
  expect(outline.color).toBe(outline.emerald);
  await page.screenshot({ path: `${output}/decided-note.png` });
});

test("採用候補は通常時に黒枠を出さずhover時だけ緑枠を示す", async () => {
  await openStory("room-roomboardview--selecting-candidate");
  const candidate = page.getByRole("button", { name: /採用する付箋:/ }).first();
  await candidate.waitFor();
  await candidate.hover();

  // hover直後はCSSの色遷移中なので、最終色になるまで同じ条件で検査する。
  await vi.waitFor(async () => {
    const colors = await candidate.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.borderColor = "var(--color-emerald-600)";
      document.body.append(probe);
      const emerald = getComputedStyle(probe).borderColor;
      probe.remove();
      return {
        actual: getComputedStyle(element).borderColor,
        emerald,
      };
    });
    expect(colors.actual).toBe(colors.emerald);
  });

  await page.screenshot({ path: `${output}/adopt-candidate-hover.png` });
});

test.each([
  [
    "通常キャンバス",
    "room-roomboardcanvas--two-client-shared-adoption-focus",
    /採用する付箋:/,
  ],
  [
    "アイデアマップ",
    "room-roomboardcanvas--two-client-shared-idea-adoption-focus",
    /採用するアイデア:/,
  ],
] as const)(
  "%s の2クライアントでホスト hover・focus を参加者の点線表示へ即時反映する",
  async (label, storyId, targetName) => {
    await openStory(storyId);
    const host = page.getByRole("region", { name: "ホストクライアント" });
    const participant = page.getByRole("region", {
      name: "参加者クライアント",
    });
    const target = host.getByRole("button", { name: targetName });
    const participantNote = participant.getByTestId("note-card");

    await target.hover();
    await expect(
      participantNote.getAttribute("data-adoption-focused"),
    ).resolves.toBe("true");
    const focusStyle = await participantNote.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.outlineColor = "var(--color-emerald-500)";
      document.body.append(probe);
      const emerald = getComputedStyle(probe).outlineColor;
      probe.remove();
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
        emerald,
        backgroundImage: style.backgroundImage,
      };
    });
    expect(focusStyle.outlineStyle).toBe("dashed");
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focusStyle.outlineColor).toBe(focusStyle.emerald);
    expect(focusStyle.backgroundImage).toContain("rgba(16, 185, 129");
    expect(await participant.getByText(/検討中|フォーカス中/).count()).toBe(0);
    await page.screenshot({
      path: `${output}/shared-adoption-focus-${label}.png`,
    });

    await page.mouse.move(0, 0);
    await expect(
      participantNote.getAttribute("data-adoption-focused"),
    ).resolves.toBeNull();

    await target.focus();
    await expect(
      participantNote.getAttribute("data-adoption-focused"),
    ).resolves.toBe("true");
    await target.evaluate((element) => (element as HTMLElement).blur());
    await expect(
      participantNote.getAttribute("data-adoption-focused"),
    ).resolves.toBeNull();
  },
);

test("確定を取り消して選び直した時は、現在hover中の候補だけを参加者へ共有する", async () => {
  await openStory("room-roomboardcanvas--two-client-adoption-reselection");
  const host = page.getByRole("region", { name: "ホストクライアント" });
  const participant = page.getByRole("region", {
    name: "参加者クライアント",
  });

  await host
    .getByRole("button", { name: "採用する付箋: 前回選んだ候補" })
    .click();
  await page.getByRole("button", { name: "確定を取り消して選び直す" }).click();
  await host
    .getByRole("button", { name: "採用する付箋: 今回選ぶ候補" })
    .hover();

  const previous = participant.locator('[data-note-id="note-1"]');
  const current = participant.locator('[data-note-id="note-2"]');
  await expect(
    previous.getAttribute("data-adoption-focused"),
  ).resolves.toBeNull();
  await expect(current.getAttribute("data-adoption-focused")).resolves.toBe(
    "true",
  );
  await page.screenshot({
    path: `${output}/shared-adoption-focus-after-reselection.png`,
  });
});

test.each([1280, 1024, 768])(
  "幅 %i でも現在地を省略せず、タイマーと次への操作を保つ",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    await openStory("room-roomboardlayout--phase-3-step-1");
    const hud = page.getByTestId("board-context-hud");
    await hud.waitFor();
    const location = hud.getByRole("button", { name: /現在地/ });
    expect(await location.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await location.click();
    const step = hud.getByTestId("board-current-step");
    expect(await step.innerText()).toContain("アイデアを書き出す（個人）");
    expect(await step.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await location.click();
    expect(await hud.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
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
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-presentation"),
    ).toBe("workspace");
    const toolbarBox = await page
      .getByTestId("private-notes-toolbar")
      .boundingBox();

    const addNote = page.getByRole("button", {
      name: "付箋を追加",
      exact: true,
    });

    expect(await addNote.isVisible()).toBe(true);
    expect(
      (toolbarBox?.x ?? Infinity) + (toolbarBox?.width ?? 0),
    ).toBeLessThanOrEqual(width);
    await expectLayout();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({ path: `${output}/refreshed-${width}.png` });
  },
);

test("考えるヒントは白地のタブにし、スクロールしても大分類を切り替えられる", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.getByRole("button", { name: "考えるヒントを開く" }).click();
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

test.each([1024, 768])(
  "幅 %i の全ステップで現在地と進行操作を隠さない",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    for (const step of steps) {
      const [phase, number] = step.split("-");
      await openStory(`room-roomboardlayout--phase-${phase}-step-${number}`);
      const hud = page.getByTestId("board-context-hud");
      await hud.waitFor();
      await page.keyboard.press("Escape");
      expect(
        await hud
          .getByTestId("board-location-trigger")
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
  },
);

test.each([1280, 1024, 768])(
  "幅 %i でも進捗バーと参加者の省略表示を残す",
  async (width) => {
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
  },
);

test.each([1280, 768])(
  "%ipxでHUDに初期参照を表示し、決定内容を開いてもキャンバスを固定する",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    await openStory("room-roomboardlayout--phase-3-step-1");
    const hud = page.getByTestId("board-context-hud");
    const canvas = await page.getByTestId("board-canvas").boundingBox();
    const initial = await hud.boundingBox();
    expect(initial?.height).toBeLessThanOrEqual(390);
    expect(await page.getByTestId("board-location-trigger").isVisible()).toBe(
      true,
    );
    expect(await page.getByTestId("board-current-step").count()).toBe(0);
    expect(await page.getByTestId("board-progress-rail").isVisible()).toBe(
      true,
    );

    const issueTrigger = page.getByRole("button", { name: "決定した課題" });
    await issueTrigger.click();
    expect(
      await page.getByTestId("board-reference-issue-content").isVisible(),
    ).toBe(true);
    const issueContent = page.locator(
      `[id="${await issueTrigger.getAttribute("aria-controls")}"]`,
    );
    await expect
      .poll(() =>
        issueContent.evaluate((element) =>
          element
            .getAnimations()
            .every((animation) => animation.playState === "finished"),
        ),
      )
      .toBe(true);
    await expectLayout();
    expect(await page.getByTestId("board-canvas").boundingBox()).toEqual(
      canvas,
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    const hmwTrigger = page.getByRole("button", { name: "決定した問い" });
    await hmwTrigger.click();
    expect(await issueTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(await hmwTrigger.getAttribute("aria-expanded")).toBe("true");
    const hmwContent = page.getByTestId("board-reference-hmw-content");
    const hmwDisclosure = page.locator(
      `[id="${await hmwTrigger.getAttribute("aria-controls")}"]`,
    );
    expect(await hmwContent.isVisible()).toBe(true);
    expect(
      await hmwDisclosure.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s");
    expect(await page.getByTestId("board-canvas").boundingBox()).toEqual(
      canvas,
    );
    await expectLayout();
  },
);

test("決定内容を参照したまま発想支援の3項目目へ到達できる", async () => {
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.keyboard.press("Escape");
  expect(
    await page.getByTestId("board-reference-hmw-content").isVisible(),
  ).toBe(true);
  await page.getByRole("button", { name: "考えるヒントを開く" }).click();
  await page.getByRole("tab", { name: "発想を広げる", exact: true }).click();
  await page.getByRole("button", { name: /ほかの問いを見る/ }).click();
  const content = await page.locator("#board-help-content").boundingBox();
  await page
    .locator("#board-help-content li:visible")
    .nth(2)
    .scrollIntoViewIfNeeded();
  const third = await page
    .locator("#board-help-content li:visible")
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

test.each([1280, 1024, 768])(
  "%dpxで決定内容を1項目ずつ展開でき、作業領域を動かさない",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    await openStory("room-roomboardlayout--reference-and-notes");
    expect(await page.getByTestId("board-carryovers").count()).toBe(0);
    const canvas = await page.getByTestId("board-canvas").boundingBox();
    const timer = await page.getByTestId("room-timer").boundingBox();
    const notes = await page.getByTestId("private-notes-toolbar").boundingBox();
    const hmw = page.getByRole("button", { name: "決定した問い" });
    const issue = page.getByRole("button", { name: "決定した課題" });
    expect(await hmw.getAttribute("aria-expanded")).toBe("true");
    expect(await issue.getAttribute("aria-expanded")).toBe("false");

    await expect.poll(() => hmw.getAttribute("aria-expanded")).toBe("true");
    const hmwContent = page.getByTestId("board-reference-hmw-content");
    expect(await hmwContent.isVisible()).toBe(true);
    await expectLayout();
    await hmwContent.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    const lastText = hmwContent.locator("p");
    const textBox = await lastText.boundingBox();
    const scrollBox = await hmwContent.boundingBox();
    if (!textBox || !scrollBox)
      throw new Error("決定文の表示領域が見つかりません");
    expect(textBox.y + textBox.height).toBeLessThanOrEqual(
      scrollBox.y + scrollBox.height,
    );

    await issue.click();
    await expect.poll(() => issue.getAttribute("aria-expanded")).toBe("true");
    await expect.poll(() => hmw.getAttribute("aria-expanded")).toBe("false");
    expect(
      await page.getByTestId("board-reference-issue-content").isVisible(),
    ).toBe(true);
    expect(
      await page.getByTestId("board-reference-hmw-content").isVisible(),
    ).toBe(false);
    expect(await page.getByTestId("room-timer").boundingBox()).toEqual(timer);
    expect(
      await page.getByTestId("private-notes-toolbar").boundingBox(),
    ).toEqual(notes);
    expect(await page.getByTestId("board-canvas").boundingBox()).toEqual(
      canvas,
    );
    await expectLayout();
    await page.screenshot({ path: `${output}/context-issue-${width}.png` });
  },
);

test("参加者1人でも現在地の詳細がマイ付箋に重ならない", async () => {
  await openStory("room-roomboardlayout--single-participant");
  await page.getByText("決定した課題", { exact: true }).click();
  await expectLayout();
});

test.each([1280, 1024, 768])(
  "幅 %i の操作バーで招待とタイマーを開閉でき、寸法と主要操作を保つ",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    await openStory("room-roomboardlayout--timer-paused");
    const controls = page.getByRole("group", { name: "ルームの操作" });
    await controls.waitFor();
    const initialBox = await controls.boundingBox();
    const timer = controls.getByTestId("room-timer");
    expect(
      await timer.evaluate((e) =>
        e.parentElement?.closest(".board-hud")?.getAttribute("data-testid"),
      ),
    ).toBe("board-control-hud");
    const timerBox = await timer.boundingBox();
    expect({ width: timerBox?.width, height: timerBox?.height }).toEqual({
      width: 112,
      height: 40,
    });
    const contextBox = await page
      .getByTestId("board-context-hud")
      .boundingBox();
    expect(contextBox?.width).toBeLessThanOrEqual(360);
    await controls
      .getByRole("button", { name: "ルームメニューを開く" })
      .click();
    const invite = page.getByRole("button", { name: "招待", exact: true });
    await invite.click();
    const panel = page.getByRole("dialog", { name: "ルームに招待" });
    await panel.waitFor();
    expect(
      await panel.getByRole("button", { name: "招待URLをコピー" }).isVisible(),
    ).toBe(true);
    const bounds = await panel.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    await expect
      .poll(() => invite.evaluate((e) => document.activeElement === e))
      .toBe(true);
    await page.keyboard.press("Escape");
    await timer.click();
    await page.getByTestId("room-timer-panel").waitFor();
    expect(
      await page.getByRole("button", { name: "再開", exact: true }).isVisible(),
    ).toBe(true);
    await page.keyboard.press("Escape");
    expect(await controls.boundingBox()).toEqual(initialBox);
    await page.getByRole("button", { name: "ルームメニューを開く" }).click();
    const menu = page.getByRole("dialog", {
      name: "ルームメニュー",
      exact: true,
    });
    expect(
      await menu
        .getByRole("button", { name: "ルームを解散", exact: true })
        .isVisible(),
    ).toBe(true);
    expect(await menu.getByText("招待URL", { exact: true }).count()).toBe(0);
    await page.keyboard.press("Escape");
    await expectLayout();
  },
);

test.each(["reconnecting", "connecting"])(
  "%s の表示と開いたマイ付箋を重ねない",
  async (state) => {
    await page.setViewportSize({ width: 768, height: 720 });
    await openStory(
      state === "reconnecting"
        ? "room-roomboardlayout--reconnecting"
        : "room-roomboardlayout--connecting",
    );
    await page.getByTestId("board-connection-status").waitFor();
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
    await expectLayout();
  },
);

test.each([1280, 1024, 768])(
  "%ipxで執筆の参照情報を読み、独立して開閉できる",
  async (width) => {
    await page.setViewportSize({ width, height: 720 });
    for (const [phase, reference] of [
      [2, "issue"],
      [3, "hmw"],
    ] as const) {
      await openStory(`room-roomboardlayout--phase-${phase}-step-1`);
      const decision = page.getByTestId(`board-reference-${reference}`);
      const content = page.getByTestId(`board-reference-${reference}-content`);
      await decision.waitFor();
      expect(await content.isVisible()).toBe(true);
      const trigger = page.getByRole("button", {
        name: reference === "hmw" ? "決定した問い" : "決定した課題",
        exact: true,
      });
      expect(await content.isVisible()).toBe(true);
      expect(await trigger.getAttribute("aria-expanded")).toBe("true");
      const scrollBox = await content.boundingBox();
      if (!scrollBox) throw new Error("参照欄が見つかりません");
      const fullText = await content.locator("p").boundingBox();
      if (!fullText) throw new Error("参照文が見つかりません");
      expect(scrollBox.height).toBeGreaterThanOrEqual(
        Math.min(fullText.height, 80),
      );
      await expectLayout();
      await page.keyboard.press("Escape");
      expect(await content.isVisible()).toBe(true);
      await content.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      const paragraph = await content.locator("p").boundingBox();
      const after = await content.boundingBox();
      if (!paragraph || !after) throw new Error("参照欄の全文が見つかりません");
      expect(paragraph.y + paragraph.height).toBeLessThanOrEqual(
        after.y + after.height,
      );
      await trigger.click();
      expect(await content.isVisible()).toBe(false);
      await trigger.press("Enter");
      expect(await content.isVisible()).toBe(true);
      await expectLayout();
      await page.screenshot({
        path: `${output}/reference-${phase}-${width}.png`,
      });
    }
  },
);

test("U03: 3-3のマップ増減と書き足しへ通常pointerで到達できる", async () => {
  await openStory("room-roomboardlayout--map-controls");
  const map = page.getByRole("group", { name: "2軸マップの広さ操作" });
  await map.waitFor();
  await page.screenshot({ path: `${output}/u03-map.png` });
  await map
    .getByRole("button", { name: "マップを広くする" })
    .click({ timeout: 2500 });
  expect(await map.getByRole("status").innerText()).toContain("3段階目");
  await map.getByRole("button", { name: "マップを狭くする" }).click();
  expect(await map.getByRole("status").innerText()).toContain("2段階目");
  await page
    .getByRole("button", { name: "もう一度付箋を書く", exact: true })
    .click();
  expect(await page.getByRole("alertdialog").isVisible()).toBe(true);
});

test("U03: 390pxでガイドを表示せず、現在の操作へ到達できる", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory("room-roomboardlayout--phase-3-step-1");
  await page.screenshot({ path: `${output}/u03-narrow.png` });
  expect(await page.getByTestId("step-guide").count()).toBe(0);
  const controls = await page.getByTestId("board-control-hud").boundingBox();
  expect((controls?.x ?? 0) + (controls?.width ?? 0)).toBeLessThanOrEqual(390);
  expect(
    await page.getByRole("button", { name: "付箋を追加" }).isVisible(),
  ).toBe(true);
});

test.each([
  [1280, "undo-notification"],
  [390, "undo-notification"],
  [1280, "undo-notification-hmw"],
  [390, "undo-notification-hmw"],
  [1280, "undo-notification-idea"],
  [390, "undo-notification-idea"],
] as const)(
  "U03: %ipxの%sで決定中の通知とUndoへ到達できる",
  async (width, story) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
    await openStory(`room-roomboardlayout--${story}`);
    const board = page.getByTestId("room-board-view-root");
    const before = await board.boundingBox();
    await page.getByRole("button", { name: "除外通知を再現" }).click();
    await page.getByText(/投票完了により0票の付箋1件/).waitFor();
    expect(await board.boundingBox()).toEqual(before);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${output}/u03-toast-${story}-${width}.png`,
    });
    await page
      .getByRole("button", { name: "まとめて元に戻す", exact: true })
      .click();
    expect(await page.getByText("通知のUndo操作が届きました").isVisible()).toBe(
      true,
    );
  },
);

// 固定情報との意図した部分重なりは許容し、各操作対象に到達できる可視部分が残ることを調べる。
async function expectHudTargets(): Promise<void> {
  const targets = page.locator(
    [
      '[data-testid="board-header-row"] button',
      '[data-testid="board-header-row"] summary',
      '[data-testid="board-tools-hud"] button',
      '[data-testid="idea-map-size-controls-hud"] button',
      '[data-testid="phase-loop-hud"] button',
      '[data-testid="vote-palette-hud"] button',
      '[data-testid="private-notes-toolbar"] button',
    ].join(","),
  );
  const visible = await targets.evaluateAll((elements) =>
    elements.flatMap((e) => {
      const box = e.getBoundingClientRect();
      if (
        e.closest('[inert],[aria-hidden="true"]') ||
        !e.checkVisibility({ visibilityProperty: true }) ||
        !box.width ||
        !box.height
      )
        return [];
      let clip = {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
      for (
        let parent = e.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (/(auto|hidden|scroll)/.test(getComputedStyle(parent).overflow)) {
          const p = parent.getBoundingClientRect();
          clip = {
            left: Math.max(clip.left, p.left),
            right: Math.min(clip.right, p.right),
            top: Math.max(clip.top, p.top),
            bottom: Math.min(clip.bottom, p.bottom),
          };
        }
      }
      if (clip.right - clip.left < 2 || clip.bottom - clip.top < 2) return [];
      const disabled = e instanceof HTMLButtonElement && e.disabled;
      const probePoints: Array<[number, number]> = [0.2, 0.5, 0.8].flatMap(
        (xRatio) =>
          [0.2, 0.5, 0.8].map((yRatio): [number, number] => [
            clip.left + (clip.right - clip.left) * xRatio,
            clip.top + (clip.bottom - clip.top) * yRatio,
          ]),
      );
      return [
        {
          // タイマー通知音は既存timer枠の内側に置く独立操作。
          family: e.parentElement?.querySelector(
            ':scope > [data-testid="room-timer"]',
          )
            ? "timer"
            : e.closest(
                  '[data-testid="board-reference-issue"], [data-testid="board-reference-hmw"], [data-testid="board-help-panel"]',
                )
              ? "context"
              : e.closest('[data-presentation="workspace"]')
                ? "workspace"
                : null,
          index: elements.indexOf(e),
          contains: elements
            .filter((other) => other !== e && e.contains(other))
            .map((other) => elements.indexOf(other)),
          name: e.getAttribute("aria-label") ?? e.textContent,
          ...clip,
          hit:
            disabled ||
            probePoints.some(([probeX, probeY]) =>
              e.contains(document.elementFromPoint(probeX, probeY)),
            ),
        },
      ];
    }),
  );
  for (const target of visible)
    expect(target.hit, String(target.name)).toBe(true);
  for (let index = 0; index < visible.length; index++)
    for (const b of visible.slice(index + 1)) {
      const a = visible[index];
      if (
        (a.family === "timer" && b.family === "timer") ||
        // 全幅の個人作業エリアでは参照欄・ヒントと付箋カードの部分重なりを許容する。
        // 上のhit検査と参照情報・ヒント・追加カードの専用操作テストで双方の到達性を保つ。
        (a.family === "context" && b.family === "workspace") ||
        (a.family === "workspace" && b.family === "context") ||
        a.contains.includes(b.index) ||
        b.contains.includes(a.index)
      )
        continue;
      expect(
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
        `${a.name} / ${b.name}`,
      ).toBe(false);
    }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()?.width,
  );
}

test.each([1280, 390])(
  "U03: %ipxの全14工程でhost/memberの実操作対象を遮らない",
  async (width) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
    for (const isHost of [true, false])
      for (const step of steps) {
        const [phase, number] = step.split("-");
        await openStory(
          `room-roomboardlayout--phase-${phase}-step-${number}&args=isHost:${isHost}`,
        );
        await page.getByTestId("board-context-hud").waitFor();
        expect(
          await page
            .getByRole("dialog", { name: "投票結果", exact: true })
            .count(),
        ).toBe(0);
        expect(await page.getByTestId("step-guide").count()).toBe(0);
        await expectHudTargets();
      }
  },
  60_000,
);

test.each([1280, 768, 390, 320])(
  "%ipxで長い参照本文の全文と集計に到達でき、閉じた本文へフォーカスしない",
  async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory("room-roomboardlayout--long-reference");
    const trigger = page.getByRole("button", {
      name: "決定した問い",
      exact: true,
    });
    const body = page.getByTestId("board-reference-hmw-content");
    const note = body.locator("..");
    expect((await body.locator("p").innerText()).length).toBe(2000);
    expect(await trigger.getAttribute("aria-expanded")).toBe("true");
    const bounds = await note.boundingBox();
    expect(bounds?.width).toBe(200);
    expect(bounds?.height).toBeLessThanOrEqual(width <= 639 ? 150 : 240);
    await body.focus();
    await page.keyboard.press("End");
    await body.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    const paragraph = await body.locator("p").boundingBox();
    const bodyBounds = await body.boundingBox();
    expect((paragraph?.y ?? 0) + (paragraph?.height ?? 0)).toBeLessThanOrEqual(
      (bodyBounds?.y ?? 0) + (bodyBounds?.height ?? 0),
    );
    expect(await note.getByRole("img", { name: /主観.*8票/ }).isVisible()).toBe(
      true,
    );
    expect(
      await note.getByRole("status", { name: "採用済み" }).isVisible(),
    ).toBe(true);
    await trigger.focus();
    await trigger.press("Enter");
    await expect.poll(() => body.isVisible()).toBe(false);
    expect(await body.getAttribute("tabindex")).toBe("-1");
    await page.keyboard.press("Tab");
    expect(await body.evaluate((e) => e === document.activeElement)).toBe(
      false,
    );
    await trigger.press("Space");
    await expect.poll(() => body.isVisible()).toBe(true);
  },
);
