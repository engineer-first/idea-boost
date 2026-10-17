import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  getIdeaMapDimensions,
  IDEA_MAP_BASE_DIMENSIONS,
} from "../../contracts/board";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/idea-map-workspace";
let browser: Browser;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function openWorkspace(page: Page): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--idea-map-workspace&viewMode=story`,
  );
  await page.getByTestId("idea-map-fixed-position-area").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openMapOnly(page: Page): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--idea-map-only&viewMode=story`,
  );
  await page.getByTestId("idea-map-fixed-position-area").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`);
  await page.getByTestId("board-location-card").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function readBounds(page: Page, testId: string) {
  const bounds = await page.getByTestId(testId).boundingBox();
  if (!bounds) throw new Error(`${testId} が表示されていません`);
  return bounds;
}

test.each([
  1280, 1440,
])("%dpxで3-2の進め方が最新の発表者HUDを遮らない", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  try {
    await openWorkspace(page);
    const guide = await readBounds(page, "step-guide");
    const controls = await readBounds(page, "board-control-hud");
    const overlapWidth =
      Math.min(guide.x + guide.width, controls.x + controls.width) -
      Math.max(guide.x, controls.x);
    const overlapHeight =
      Math.min(guide.y + guide.height, controls.y + controls.height) -
      Math.max(guide.y, controls.y);
    expect(overlapWidth > 0 && overlapHeight > 0).toBe(false);
  } finally {
    await page.close();
  }
});

test.each([
  { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
  { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
  { phase: "3-2", width: 1440, height: 800, open: openWorkspace },
  { phase: "3-3", width: 1440, height: 800, open: openMapOnly },
  { phase: "3-2", width: 1440, height: 1000, open: openWorkspace },
  { phase: "3-3", width: 1440, height: 1000, open: openMapOnly },
  { phase: "3-2", width: 390, height: 720, open: openWorkspace },
  { phase: "3-3", width: 390, height: 720, open: openMapOnly },
])("$phase / $width×$heightで軸の高低ラベルと矢印の間隔を確保する", async ({
  phase,
  width,
  height,
  open,
}) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await open(page);
    for (const { axis, name } of [
      { axis: "x", name: "実現のしやすさ: 低から高" },
      { axis: "y", name: "価値: 低から高" },
    ]) {
      const scale = page.getByRole("group", { name });
      for (const { endpoint, label } of [
        { endpoint: "low", label: "低" },
        { endpoint: "high", label: "高" },
      ]) {
        const text = await scale
          .getByText(label, { exact: true })
          .boundingBox();
        const arrow = await scale
          .getByTestId(`idea-value-feasibility-map-${axis}-${endpoint}-arrow`)
          .boundingBox();
        if (!text || !arrow) throw new Error(`${name}の${label}がありません`);
        const horizontalGap = Math.max(
          text.x - (arrow.x + arrow.width),
          arrow.x - (text.x + text.width),
          0,
        );
        const verticalGap = Math.max(
          text.y - (arrow.y + arrow.height),
          arrow.y - (text.y + text.height),
          0,
        );
        expect(
          Math.hypot(horizontalGap, verticalGap),
          `${name}の${label}と矢印に8px以上の余白を保つ`,
        ).toBeGreaterThanOrEqual(8);
        if (axis === "x") {
          if (endpoint === "low") {
            expect(
              arrow.x - (text.x + text.width),
              "横軸は「低」、左矢印、軸線の順に並べる",
            ).toBeGreaterThanOrEqual(8);
          }
          expect(
            Math.abs(text.y + text.height / 2 - (arrow.y + arrow.height / 2)),
            `横軸の${label}と矢印の高さを揃える`,
          ).toBeLessThanOrEqual(2);
        }
      }
    }

    await page.screenshot({
      path: `${output}/axis-design-${phase}-${width}x${height}.png`,
    });
  } finally {
    await page.close();
  }
});

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 1000 },
])("$width×$heightで3-2のマップとマイ付箋を収め、操作UIと重ねない", async (viewport) => {
  const page = await browser.newPage({ viewport });
  try {
    await openWorkspace(page);
    const plane = await page
      .getByTestId("idea-value-feasibility-map-plane")
      .boundingBox();
    const privateNotes = await page
      .getByTestId("private-notes-dock")
      .boundingBox();
    const operations = await page
      .getByTestId("board-operation-matrix")
      .boundingBox();
    const controls = await page.getByTestId("board-control-hud").boundingBox();
    const header = await page.getByTestId("board-header-row").boundingBox();
    if (!plane || !privateNotes || !operations || !controls || !header)
      throw new Error("評価画面がありません");
    const valueScale = page.getByRole("group", {
      name: "価値: 低から高",
    });
    const high = await valueScale
      .getByText("高", { exact: true })
      .boundingBox();
    const low = await valueScale.getByText("低", { exact: true }).boundingBox();
    if (!high || !low) throw new Error("縦軸の目盛りがありません");

    expect(plane.height).toBeGreaterThanOrEqual(viewport.height * 0.55);
    expect(plane.width / plane.height).toBeCloseTo(9 / 5, 1);
    expect(low.y - high.y).toBeGreaterThan(plane.height * 0.7);
    expect(plane.y).toBeGreaterThan(controls.y + controls.height);
    expect(
      await page
        .getByTestId("board-header-row")
        .evaluate((element) => getComputedStyle(element).position),
    ).toBe("absolute");
    expect(privateNotes.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    expect(privateNotes.x).toBeGreaterThanOrEqual(plane.x + plane.width);
    expect(privateNotes.y + privateNotes.height).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(privateNotes.x + privateNotes.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(operations.y).toBeGreaterThanOrEqual(
      privateNotes.y + privateNotes.height + 8,
    );
    expect(operations.x + operations.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page
        .getByTestId("private-notes-scroll")
        .evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe("auto");
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("true");
    expect(await page.getByTestId("idea-map-unplaced-tray").count()).toBe(0);
    expect(await page.getByTestId("board-operation-matrix").count()).toBe(1);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);

    await page.screenshot({
      path: `${output}/workspace-${viewport.width}.png`,
    });
  } finally {
    await page.close();
  }
});

test.each([
  {
    width: 390,
    height: 844,
    x: 56,
    y: 440.171875,
    widthPx: 318,
    heightPx: 176.65625,
  },
  {
    width: 768,
    height: 844,
    x: 76,
    y: 379.4375,
    widthPx: 452,
    heightPx: 251.109375,
  },
  {
    width: 900,
    height: 720,
    x: 76,
    y: 118,
    widthPx: 584,
    heightPx: 324.4375,
  },
  {
    width: 901,
    height: 720,
    x: 76,
    y: 118,
    widthPx: 585,
    heightPx: 325,
  },
  {
    width: 1280,
    height: 720,
    x: 77.40625,
    y: 118,
    widthPx: 961.1875,
    heightPx: 534,
  },
  {
    width: 1440,
    height: 1000,
    x: 76,
    y: 118,
    widthPx: 1124,
    heightPx: 624.4375,
  },
])("$width×$heightでも2軸マップ本体の位置とサイズを維持する", async (expected) => {
  const page = await browser.newPage({
    viewport: { width: expected.width, height: expected.height },
  });
  try {
    await openWorkspace(page);
    const plane = await readBounds(page, "idea-value-feasibility-map-plane");
    expect(plane.x).toBeCloseTo(expected.x, 1);
    expect(plane.y).toBeCloseTo(expected.y, 1);
    expect(plane.width).toBeCloseTo(expected.widthPx, 1);
    expect(plane.height).toBeCloseTo(expected.heightPx, 1);
  } finally {
    await page.close();
  }
});

test.each([
  { phase: "3-2", open: openWorkspace },
  { phase: "3-3", open: openMapOnly },
])("$phaseでは上部情報パネルと2軸マップの間隔を保つ", async ({
  phase,
  open,
}) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await open(page);
    const context = await readBounds(page, "board-context-hud");
    const plane = await readBounds(page, "idea-value-feasibility-map-plane");
    const valueAxis = await readBounds(
      page,
      "idea-value-feasibility-map-y-axis-label",
    );
    const feasibilityAxis = await readBounds(
      page,
      "idea-value-feasibility-map-x-axis-label",
    );

    expect(plane.y - (context.y + context.height)).toBeGreaterThanOrEqual(16);
    expect(plane.y - (context.y + context.height)).toBeLessThanOrEqual(24);
    expect(plane.width).toBeCloseTo(1124, 1);
    expect(plane.height).toBeCloseTo(624.4375, 1);
    expect(valueAxis.y + valueAxis.height / 2).toBeCloseTo(
      plane.y + plane.height / 2,
      1,
    );
    expect(feasibilityAxis.y - (plane.y + plane.height)).toBeCloseTo(
      phase === "3-2" ? 26.671875 : 38.671875,
      1,
    );
  } finally {
    await page.close();
  }
});

test.each([
  {
    phase: "3-2",
    open: openWorkspace,
    viewport: { width: 1440, height: 1000 },
    retryCenterRatio: 0.3,
  },
  {
    phase: "3-3",
    open: openMapOnly,
    viewport: { width: 1440, height: 1000 },
    retryCenterRatio: 0.3,
  },
  {
    phase: "3-2 narrow",
    open: openWorkspace,
    viewport: { width: 900, height: 720 },
    retryCenterRatio: null,
  },
  {
    phase: "3-2 compact",
    open: openWorkspace,
    viewport: { width: 640, height: 900 },
    retryCenterRatio: null,
  },
])("$phaseでは下部操作をマップ内に配置し、同じ高さで重ねない", async ({
  open,
  viewport,
  retryCenterRatio,
}) => {
  const page = await browser.newPage({ viewport });
  try {
    await open(page);
    const plane = await readBounds(page, "idea-value-feasibility-map-plane");
    const retry = await readBounds(page, "phase-loop-hud");
    const mapSize = await readBounds(page, "idea-map-size-controls-hud");
    const planeBottom = plane.y + plane.height;
    const mapSizeBottom = mapSize.y + mapSize.height;
    const retryCenterX = retry.x + retry.width / 2;

    expect(mapSize.y).toBeGreaterThanOrEqual(plane.y);
    expect(mapSize.x).toBeGreaterThanOrEqual(plane.x);
    expect(mapSize.x + mapSize.width).toBeLessThanOrEqual(
      plane.x + plane.width,
    );
    expect(planeBottom - mapSizeBottom).toBeGreaterThanOrEqual(16);
    expect(planeBottom - mapSizeBottom).toBeLessThanOrEqual(24);
    expect(retry.y + retry.height).toBeCloseTo(mapSizeBottom, 0);
    expect(retry.x).toBeGreaterThanOrEqual(plane.x);
    expect(retry.x + retry.width).toBeLessThanOrEqual(plane.x + plane.width);

    const overlaps =
      retry.x < mapSize.x + mapSize.width &&
      retry.x + retry.width > mapSize.x &&
      retry.y < mapSizeBottom &&
      retry.y + retry.height > mapSize.y;
    expect(overlaps, "下部操作UI同士を重ねない").toBe(false);

    if (retryCenterRatio !== null) {
      expect(
        Math.abs(retryCenterX - plane.x - plane.width * retryCenterRatio),
      ).toBeLessThanOrEqual(12);
    }
  } finally {
    await page.close();
  }
});

test("マイ付箋だけを開閉・スクロールし、参照情報やガイドを開いてもマップが動かない", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const before = await plane.boundingBox();
    await page
      .getByRole("button", { name: "マイ付箋を閉じる", exact: true })
      .click();
    expect(await plane.boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "マイ付箋を開く", exact: true })
      .click();
    expect(await plane.boundingBox()).toEqual(before);
    const scroll = page.getByTestId("private-notes-scroll");
    await scroll.hover();
    await page.mouse.wheel(0, 1200);
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await plane.boundingBox()).toEqual(before);

    const question = page.getByRole("button", {
      name: /決定した問い/,
    });
    expect(await question.getAttribute("aria-expanded")).toBe("false");
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("true");
    await page.getByLabel("決定した問いの本文").waitFor();
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("false");
    expect(await plane.boundingBox()).toEqual(before);
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("true");
    expect(await plane.boundingBox()).toEqual(before);

    await page.getByRole("button", { name: "進め方", exact: true }).click();
    expect(await plane.boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    expect(
      await page.getByTestId("step-guide").getAttribute("data-state"),
    ).toBe("compact");
  } finally {
    await page.close();
  }
});

test.each([
  { phase: "3-2", open: openWorkspace },
  { phase: "3-3", open: openMapOnly },
])("$phaseでマップの広さを変えても付箋の中心座標を保つ", async ({ open }) => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await open(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const grid = page.getByTestId("idea-value-feasibility-map-plane-grid");
    const notes = ["map-workspace-shared-1", "map-workspace-shared-2"].map(
      (id) => page.getByTestId(`idea-value-feasibility-map-note-${id}`),
    );
    const noteCards = notes.map((note) => note.getByTestId("note-card"));
    const noteLayer = page.getByTestId("idea-map-note-layer");
    const initialPlane = await plane.boundingBox();
    const initialGrid = await grid.boundingBox();
    const initialAxis = await page
      .getByTestId("idea-value-feasibility-map-x-axis-label")
      .boundingBox();
    const initialNotes = await Promise.all(
      noteCards.map((note) => note.boundingBox()),
    );
    if (
      !initialPlane ||
      !initialGrid ||
      !initialAxis ||
      initialNotes.some((note) => note === null)
    )
      throw new Error("マップか付箋がありません");
    const firstInitialNote = initialNotes[0];
    if (!firstInitialNote) throw new Error("比較する付箋がありません");
    const logicalPositions = await Promise.all(
      notes.map((note) =>
        note.evaluate((element) => ({
          left: (element as HTMLElement).style.left,
          bottom: (element as HTMLElement).style.bottom,
        })),
      ),
    );
    const centers = (
      boxes: Array<NonNullable<(typeof initialNotes)[number]>>,
    ) =>
      boxes.map((box) => ({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      }));
    const initialCenters = centers(
      initialNotes as Array<NonNullable<(typeof initialNotes)[number]>>,
    );
    const zoomControls = await page
      .getByTestId("canvas-zoom-controls")
      .innerText();

    const expectNoteScale = async (
      note: (typeof notes)[number],
      sizeLevel: number,
    ) => {
      await expect
        .poll(() =>
          note.evaluate((element) =>
            Number(
              (element as HTMLElement).style.transform.match(
                /scale\(([^)]+)/,
              )?.[1],
            ),
          ),
        )
        .toBeCloseTo(
          IDEA_MAP_BASE_DIMENSIONS.width /
            getIdeaMapDimensions(sizeLevel).width,
          5,
        );
    };
    await page.getByRole("button", { name: "マップを広くする" }).click();
    await expectNoteScale(notes[0], 5);
    const expectCentersUnchanged = async (
      expectedCenters: ReturnType<typeof centers>,
    ) => {
      await expect
        .poll(async () => {
          const boxes = await Promise.all(
            noteCards.map((note) => note.boundingBox()),
          );
          if (boxes.some((box) => box === null)) return Infinity;
          const currentCenters = centers(
            boxes as Array<NonNullable<(typeof initialNotes)[number]>>,
          );
          return Math.max(
            ...currentCenters.map((center, index) =>
              Math.hypot(
                center.x - expectedCenters[index].x,
                center.y - expectedCenters[index].y,
              ),
            ),
          );
        })
        .toBeLessThan(1);
    };
    const expectNotesSmallerThan = async (previousWidth: number) => {
      await expect
        .poll(async () => (await noteCards[0].boundingBox())?.width ?? Infinity)
        .toBeLessThan(previousWidth);
    };
    await expectNotesSmallerThan(firstInitialNote.width);
    await expectCentersUnchanged(initialCenters);
    expect(await plane.boundingBox()).toEqual(initialPlane);
    expect(await grid.boundingBox()).toEqual(initialGrid);
    expect(
      await page
        .getByTestId("idea-value-feasibility-map-x-axis-label")
        .boundingBox(),
    ).toEqual(initialAxis);
    expect(
      await noteLayer.evaluate(
        (element) => (element as HTMLElement).style.transform,
      ),
    ).toBe("");
    expect(
      await Promise.all(
        notes.map((note) =>
          note.evaluate((element) => ({
            left: (element as HTMLElement).style.left,
            bottom: (element as HTMLElement).style.bottom,
          })),
        ),
      ),
    ).toEqual(logicalPositions);
    expect(await page.getByTestId("canvas-zoom-controls").innerText()).toBe(
      zoomControls,
    );

    await page.getByRole("button", { name: "マップを広くする" }).click();
    await expectNoteScale(notes[0], 6);
    await expectNotesSmallerThan(firstInitialNote.width * 0.91);
    await expectCentersUnchanged(initialCenters);
    await page.getByRole("button", { name: "マップを狭くする" }).click();
    await expectNoteScale(notes[0], 5);
    await expectCentersUnchanged(initialCenters);
    await page.getByRole("button", { name: "マップを狭くする" }).click();
    await expectNoteScale(notes[0], 4);
    await expectCentersUnchanged(initialCenters);

    await page.getByRole("button", { name: "マップを広くする" }).click();
    await expectNoteScale(notes[0], 5);
    await expectCentersUnchanged(initialCenters);

    const note = notes[0];
    const dragHandle = note.getByRole("button", {
      name: "付箋",
      exact: true,
    });
    const dragBounds = await dragHandle.boundingBox();
    const positionArea = await page
      .getByTestId("idea-map-fixed-position-area")
      .boundingBox();
    if (!dragBounds || !positionArea)
      throw new Error("倍率変更後の付箋を移動できません");
    const pointerX = dragBounds.x + Math.min(20, dragBounds.width / 2);
    const pointerY = dragBounds.y + Math.min(20, dragBounds.height / 2);
    await page.mouse.move(pointerX, pointerY);
    await page.mouse.down();
    await page.mouse.move(pointerX + positionArea.width * 0.1, pointerY, {
      steps: 8,
    });
    await page.mouse.up();
    await expect
      .poll(() =>
        note.evaluate((element) =>
          Number.parseFloat((element as HTMLElement).style.left),
        ),
      )
      .toBeGreaterThan(19);
    const movedLogicalPosition = await note.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      bottom: (element as HTMLElement).style.bottom,
    }));
    expect(Number.parseFloat(movedLogicalPosition.left)).toBeLessThan(21);

    await page.getByRole("button", { name: "マップを狭くする" }).click();
    await expectNoteScale(note, 4);
    await expect
      .poll(async () => (await noteCards[0].boundingBox())?.width ?? 0)
      .toBeGreaterThan(0);
    expect(await plane.boundingBox()).toEqual(initialPlane);
    expect(await grid.boundingBox()).toEqual(initialGrid);
    expect(
      await note.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        bottom: (element as HTMLElement).style.bottom,
      })),
    ).toEqual(movedLogicalPosition);
  } finally {
    await page.close();
  }
});

test.each([
  { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
  { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
  { phase: "3-2", width: 1440, height: 800, open: openWorkspace },
  { phase: "3-3", width: 1440, height: 800, open: openMapOnly },
  { phase: "3-2", width: 900, height: 720, open: openWorkspace },
  { phase: "3-3", width: 900, height: 720, open: openMapOnly },
  { phase: "3-2", width: 640, height: 900, open: openWorkspace },
  { phase: "3-3", width: 640, height: 900, open: openMapOnly },
  { phase: "3-2", width: 390, height: 720, open: openWorkspace },
  { phase: "3-3", width: 390, height: 720, open: openMapOnly },
])("$phase / $width×$heightで低い軸ラベルを操作UIと重ねない", async ({
  width,
  height,
  open,
}) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await open(page);
    const valueScale = page.getByRole("group", {
      name: "価値: 低から高",
    });
    const feasibilityScale = page.getByRole("group", {
      name: "実現のしやすさ: 低から高",
    });
    const valueLow = await valueScale
      .getByText("低", { exact: true })
      .boundingBox();
    const feasibilityLow = await feasibilityScale
      .getByText("低", { exact: true })
      .boundingBox();
    const fontSizeControl = page.getByTestId("note-font-size-controls");
    const fontSizeControls = (await fontSizeControl.count())
      ? await fontSizeControl.boundingBox()
      : null;
    const zoomControls = await page
      .getByTestId("canvas-zoom-hud")
      .boundingBox();
    if (!valueLow || !feasibilityLow || !zoomControls)
      throw new Error("軸ラベルか左下操作UIが表示されていません");

    const overlaps = (
      first: { x: number; y: number; width: number; height: number },
      second: { x: number; y: number; width: number; height: number },
    ) =>
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;

    expect(
      overlaps(feasibilityLow, zoomControls),
      `${width}×${height}で横軸の「低」とズームUIが重ならない`,
    ).toBe(false);
    expect(
      overlaps(valueLow, zoomControls),
      `${width}×${height}で縦軸の「低」とズームUIが重ならない`,
    ).toBe(false);
    if (fontSizeControls) {
      expect(
        overlaps(valueLow, fontSizeControls),
        `${width}×${height}で縦軸の「低」と文字サイズUIが重ならない`,
      ).toBe(false);
      expect(
        overlaps(feasibilityLow, fontSizeControls),
        `${width}×${height}で横軸の「低」と文字サイズUIが重ならない`,
      ).toBe(false);

      const horizontalGap = Math.max(
        fontSizeControls.x - (feasibilityLow.x + feasibilityLow.width),
        feasibilityLow.x - (fontSizeControls.x + fontSizeControls.width),
        0,
      );
      const verticalGap = Math.max(
        fontSizeControls.y - (feasibilityLow.y + feasibilityLow.height),
        feasibilityLow.y - (fontSizeControls.y + fontSizeControls.height),
        0,
      );
      expect(
        Math.hypot(horizontalGap, verticalGap),
        `${width}×${height}で横軸の「低」と文字サイズUIの間に16px以上の余白を保つ`,
      ).toBeGreaterThanOrEqual(16);
    }
  } finally {
    await page.close();
  }
});

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 800 },
  { width: 900, height: 720 },
  { width: 390, height: 720 },
])("3-2の横軸端点は操作UIから離し、両ステップで低を矢印の外側に置く（$width×$height）", async ({
  width,
  height,
}) => {
  const sharingPage = await browser.newPage({ viewport: { width, height } });
  const mapOnlyPage = await browser.newPage({ viewport: { width, height } });
  const runtimeErrors: string[] = [];
  for (const page of [sharingPage, mapOnlyPage]) {
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Maximum update depth")
      ) {
        runtimeErrors.push(message.text());
      }
    });
  }
  try {
    const readEndpoint = async (page: Page) => {
      const scale = page.getByRole("group", {
        name: "実現のしやすさ: 低から高",
      });
      const low = await scale.getByText("低", { exact: true }).boundingBox();
      const arrowElement = page.getByTestId(
        "idea-value-feasibility-map-x-low-arrow",
      );
      const arrow = await arrowElement.boundingBox();
      const scaleBounds = await scale.boundingBox();
      const axisTitle = await page
        .getByTestId("idea-value-feasibility-map-x-axis-label")
        .boundingBox();
      const high = await scale.getByText("高", { exact: true }).boundingBox();
      const horizontalTrack = await scale
        .getByTestId("idea-value-feasibility-map-x-scale-bar")
        .boundingBox();
      const mapPlane = await page
        .getByTestId("idea-value-feasibility-map-plane")
        .boundingBox();
      if (
        !low ||
        !arrow ||
        !scaleBounds ||
        !axisTitle ||
        !high ||
        !horizontalTrack ||
        !mapPlane
      )
        throw new Error("横軸の左端が表示されていません");
      const groupedEndpoint = await page
        .getByTestId("idea-map-x-low-endpoint")
        .count();
      const groupBounds = groupedEndpoint
        ? await page.getByTestId("idea-map-x-low-endpoint").boundingBox()
        : null;
      const arrowAfterLabelGap = arrow.x - (low.x + low.width);
      const verticalCenterGap = Math.abs(
        low.y + low.height / 2 - (arrow.y + arrow.height / 2),
      );
      const baselineLeft = groupedEndpoint
        ? await page.evaluate(() => {
            const endpoint = document.querySelector(
              '[data-testid="idea-map-x-low-endpoint"]',
            );
            const axis = endpoint?.parentElement;
            if (
              !(endpoint instanceof HTMLElement) ||
              !(axis instanceof HTMLElement)
            )
              throw new Error("横軸の左端が表示されていません");
            const previousOffset = axis.style.getPropertyValue(
              "--horizontal-low-endpoint-offset",
            );
            axis.style.setProperty("--horizontal-low-endpoint-offset", "0px");
            const baseline = endpoint.getBoundingClientRect().left;
            if (previousOffset) {
              axis.style.setProperty(
                "--horizontal-low-endpoint-offset",
                previousOffset,
              );
            } else {
              axis.style.removeProperty("--horizontal-low-endpoint-offset");
            }
            return baseline;
          })
        : null;
      const controlsLocator = page.getByTestId("note-font-size-controls");
      const controls = (await controlsLocator.count())
        ? await controlsLocator.boundingBox()
        : null;
      const zoomControls = await page
        .getByTestId("canvas-zoom-hud")
        .boundingBox();
      const planeBottom = mapPlane.y + mapPlane.height;
      return {
        arrowAfterLabelGap,
        verticalCenterGap,
        groupedEndpoint,
        baselineLeft,
        scaleBounds,
        endpoint: {
          left: groupBounds?.x ?? Math.min(low.x, arrow.x),
          right: groupBounds
            ? groupBounds.x + groupBounds.width
            : Math.max(low.x + low.width, arrow.x + arrow.width),
          top: groupBounds?.y ?? Math.min(low.y, arrow.y),
          bottom: groupBounds
            ? groupBounds.y + groupBounds.height
            : Math.max(low.y + low.height, arrow.y + arrow.height),
        },
        label: low,
        arrow,
        axisTitle,
        high,
        horizontalTrack,
        mapPlane,
        axisFromPlaneBottom: scaleBounds.y - planeBottom,
        titleFromPlaneBottom: axisTitle.y - planeBottom,
        highFromPlaneBottom: high.y - planeBottom,
        controls,
        zoomControls,
      };
    };

    await openWorkspace(sharingPage);
    await openMapOnly(mapOnlyPage);
    const sharing = await readEndpoint(sharingPage);
    const mapOnly = await readEndpoint(mapOnlyPage);
    const controls = sharing.controls;
    const zoomControls = sharing.zoomControls;
    if (!controls || !zoomControls || sharing.baselineLeft === null)
      throw new Error("左下の操作UIが表示されていません");

    expect(sharing.groupedEndpoint).toBe(1);
    expect(
      sharing.arrowAfterLabelGap,
      "3-2では「低」の右に左向き矢印を表示する",
    ).toBeGreaterThanOrEqual(8);
    expect(sharing.arrowAfterLabelGap).toBeLessThanOrEqual(16);
    expect(sharing.verticalCenterGap).toBeLessThanOrEqual(4);
    expect(mapOnly.groupedEndpoint).toBe(0);

    const nearbyControls = [controls, zoomControls].filter((control) => {
      const verticalGap = Math.max(
        control.y - sharing.endpoint.bottom,
        sharing.endpoint.top - (control.y + control.height),
        0,
      );
      return verticalGap < 16;
    });
    if (nearbyControls.length > 0) {
      const rightmostControlEdge = Math.max(
        ...nearbyControls.map((control) => control.x + control.width),
      );
      const horizontalGap = sharing.endpoint.left - rightmostControlEdge;
      expect(
        horizontalGap,
        "3-2では横軸の矢印とラベルを近接する左下操作UIから12px以上離す",
      ).toBeGreaterThanOrEqual(12);
    }

    const zoomVerticalGap = Math.max(
      zoomControls.y - sharing.endpoint.bottom,
      sharing.endpoint.top - (zoomControls.y + zoomControls.height),
      0,
    );
    const previousEndpointLeft = Math.max(
      sharing.baselineLeft,
      ...(zoomVerticalGap < 16
        ? [zoomControls.x + zoomControls.width + 14]
        : []),
    );
    const expectedEndpointLeft = Math.max(
      previousEndpointLeft + 70,
      controls.x + controls.width + 24,
    );
    expect(sharing.endpoint.left).toBeCloseTo(expectedEndpointLeft, 0);
    const connectionGap = await sharingPage
      .getByTestId("idea-value-feasibility-map-x-scale-bar")
      .evaluate((element) => {
        const line = element.querySelector("line");
        const arrow = element.querySelector(
          '[data-testid="idea-value-feasibility-map-x-low-arrow"]',
        );
        if (
          !(line instanceof SVGLineElement) ||
          !(arrow instanceof SVGPathElement)
        )
          throw new Error("軸線と左矢印が同じSVGにありません");
        const lineMatrix = line.getScreenCTM();
        const arrowMatrix = arrow.getScreenCTM();
        if (!lineMatrix || !arrowMatrix)
          throw new Error("軸線が表示されていません");
        const lineStart = new DOMPoint(
          line.x1.baseVal.value,
          line.y1.baseVal.value,
        ).matrixTransform(lineMatrix);
        const arrowTip = arrow
          .getPointAtLength(arrow.getTotalLength() / 2)
          .matrixTransform(arrowMatrix);
        return Math.hypot(lineStart.x - arrowTip.x, lineStart.y - arrowTip.y);
      });
    expect(connectionGap, "矢印の先端を軸線の始点に接続する").toBeLessThan(0.1);
    expect(
      mapOnly.arrowAfterLabelGap,
      "3-3でも「低」は矢印の外側に表示する",
    ).toBeGreaterThanOrEqual(8);
    expect(
      await sharingPage
        .getByTestId("idea-map-x-low-endpoint")
        .evaluate((group) => {
          const label = group.querySelector(
            '[data-testid="idea-value-feasibility-map-x-low-label"]',
          );
          const arrow = group.querySelector(
            '[data-testid="idea-value-feasibility-map-x-low-arrow"]',
          );
          return (
            !!label &&
            !!arrow &&
            !!(
              label.compareDocumentPosition(arrow) &
              Node.DOCUMENT_POSITION_FOLLOWING
            )
          );
        }),
      "DOMでも「低」の後に矢印を配置する",
    ).toBe(true);
    expect(
      sharing.axisFromPlaneBottom - mapOnly.axisFromPlaneBottom,
    ).toBeCloseTo(-12, 1);
    expect(
      sharing.titleFromPlaneBottom - mapOnly.titleFromPlaneBottom,
    ).toBeCloseTo(-12, 1);
    expect(sharing.mapPlane.x).toBe(mapOnly.mapPlane.x);
    expect(sharing.mapPlane.width).toBe(mapOnly.mapPlane.width);
    expect(sharing.mapPlane.height).toBe(mapOnly.mapPlane.height);
    if (width >= 900) expect(sharing.mapPlane.y).toBe(mapOnly.mapPlane.y);
    expect(runtimeErrors).toEqual([]);
    await sharingPage.screenshot({
      path: `${output}/low-endpoint-sharing-${width}x${height}.png`,
    });
    await mapOnlyPage.screenshot({
      path: `${output}/low-endpoint-map-only-${width}x${height}.png`,
    });
  } finally {
    await Promise.all([sharingPage.close(), mapOnlyPage.close()]);
  }
});

test("中間幅でもレスポンシブ縮小した付箋の中心を広さ変更後に保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 800, height: 900 },
  });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const note = page.getByTestId(
      "idea-value-feasibility-map-note-map-workspace-shared-1",
    );
    const noteCard = note.getByTestId("note-card");
    const initialPlane = await plane.boundingBox();
    const initialNote = await noteCard.boundingBox();
    if (!initialPlane || !initialNote)
      throw new Error("マップか付箋がありません");

    await page.getByRole("button", { name: "マップを広くする" }).click();
    await expect
      .poll(async () => (await noteCard.boundingBox())?.width ?? Infinity)
      .toBeLessThan(initialNote.width);
    const resizedNote = await noteCard.boundingBox();
    if (!resizedNote) throw new Error("広さ変更後の付箋がありません");
    expect(
      Math.hypot(
        resizedNote.x +
          resizedNote.width / 2 -
          initialNote.x -
          initialNote.width / 2,
        resizedNote.y +
          resizedNote.height / 2 -
          initialNote.y -
          initialNote.height / 2,
      ),
    ).toBeLessThan(1);
    expect(await plane.boundingBox()).toEqual(initialPlane);
  } finally {
    await page.close();
  }
});

test("上部は共通HUDを使い、決定事項を横並びにしてもマップ位置を保つ", async () => {
  const viewport = { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const initialPlane = await plane.boundingBox();
    const location = await page
      .getByTestId("board-location-card")
      .boundingBox();
    const question = await page
      .getByTestId("board-reference-hmw")
      .boundingBox();
    const issue = await page.getByTestId("board-reference-issue").boundingBox();
    const guide = await page.getByTestId("step-guide").boundingBox();
    const controls = await page.getByTestId("board-control-hud").boundingBox();
    if (
      !initialPlane ||
      !location ||
      !question ||
      !issue ||
      !guide ||
      !controls
    )
      throw new Error("上部UIまたは2軸マップがありません");

    expect(location.width).toBe(360);
    expect(issue.x).toBeGreaterThanOrEqual(question.x + question.width);
    expect(Math.abs(question.y - issue.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(question.height - issue.height)).toBeLessThanOrEqual(1);
    expect(await page.getByTestId("board-help-panel").count()).toBe(0);
    expect(
      Math.abs(guide.x + guide.width / 2 - viewport.width / 2),
    ).toBeLessThan(100);
    expect(Math.abs(controls.y - location.y)).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: /決定した問い/ }).click();
    await expect
      .poll(() => page.getByTestId("board-reference-hmw-content").isVisible())
      .toBe(true);
    expect(await plane.boundingBox()).toEqual(initialPlane);
    const expandedQuestion = await page
      .getByTestId("board-reference-hmw")
      .boundingBox();
    const expandedIssue = await page
      .getByTestId("board-reference-issue")
      .boundingBox();
    if (!expandedQuestion || !expandedIssue)
      throw new Error("展開後の参照カードがありません");
    expect(expandedQuestion.x + expandedQuestion.width).toBeLessThanOrEqual(
      expandedIssue.x,
    );
    await page.getByRole("button", { name: /決定した課題/ }).click();
    await expect
      .poll(() => page.getByTestId("board-reference-issue-content").isVisible())
      .toBe(true);
    expect(await plane.boundingBox()).toEqual(initialPlane);
    await page.getByRole("button", { name: "進め方", exact: true }).click();
    expect(await plane.boundingBox()).toEqual(initialPlane);
  } finally {
    await page.close();
  }
});

test("狭い画面では決定事項を縦並びにし、展開時も重ねない", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await openWorkspace(page);
    const question = await readBounds(page, "board-reference-hmw");
    const issue = await readBounds(page, "board-reference-issue");
    expect(Math.abs(question.x - issue.x)).toBeLessThanOrEqual(1);
    expect(issue.y).toBeGreaterThanOrEqual(question.y + question.height);

    await page.getByRole("button", { name: /決定した問い/ }).click();
    await expect
      .poll(() => page.getByTestId("board-reference-hmw-content").isVisible())
      .toBe(true);
    const expandedQuestion = await readBounds(page, "board-reference-hmw");
    const expandedIssue = await readBounds(page, "board-reference-issue");
    expect(expandedIssue.y).toBeGreaterThanOrEqual(
      expandedQuestion.y + expandedQuestion.height,
    );
  } finally {
    await page.close();
  }
});

test.each([
  { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
  { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
  { phase: "3-2", width: 390, height: 844, open: openWorkspace },
  { phase: "3-3", width: 390, height: 844, open: openMapOnly },
])("$phase / $width×$heightで展開した決定事項の付箋を切らずに表示する", async ({
  width,
  height,
  open,
}) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await open(page);
    const map = page.getByTestId("idea-value-feasibility-map-plane");
    const initialMap = await map.boundingBox();
    if (!initialMap) throw new Error("2軸マップがありません");

    for (const id of ["hmw", "issue"] as const) {
      const trigger = page.getByRole("button", {
        name: id === "hmw" ? "決定した問い" : "決定した課題",
      });
      const initialTrigger = await trigger.boundingBox();
      if (!initialTrigger) throw new Error(`${id}のトリガーがありません`);

      await trigger.click();
      const popover = page.getByTestId(`board-reference-${id}-popover`);
      const note = popover.locator('[data-slot="sticky-note"]');
      const content = page.getByTestId(`board-reference-${id}-content`);
      await expect.poll(() => popover.isVisible()).toBe(true);
      await expect.poll(() => note.isVisible()).toBe(true);
      await expect.poll(() => content.isVisible()).toBe(true);
      await expect
        .poll(() =>
          popover.getByRole("status", { name: "採用済み" }).isVisible(),
        )
        .toBe(true);
      expect(
        await note.evaluate((element) => getComputedStyle(element).width),
      ).toBe("200px");

      const popupBounds = await popover.boundingBox();
      const noteBounds = await note.boundingBox();
      const triggerBounds = await trigger.boundingBox();
      if (!popupBounds || !noteBounds || !triggerBounds)
        throw new Error(`${id}の展開内容が表示されていません`);
      expect(popupBounds.x).toBeGreaterThanOrEqual(0);
      expect(popupBounds.y).toBeGreaterThanOrEqual(0);
      expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(width);
      expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(height);
      // 決定済み付箋の outline と影がポップオーバーの外へはみ出さない余白を確保する。
      expect(noteBounds.x - popupBounds.x).toBeGreaterThanOrEqual(6);
      expect(
        popupBounds.x + popupBounds.width - noteBounds.x - noteBounds.width,
      ).toBeGreaterThanOrEqual(6);
      expect(triggerBounds).toEqual(initialTrigger);
      expect(await map.boundingBox()).toEqual(initialMap);
      expect(
        await popover.evaluate((element) => getComputedStyle(element).zIndex),
      ).toBe("60");

      await trigger.click();
      await expect.poll(() => popover.isVisible()).toBe(false);
    }
  } finally {
    await page.close();
  }
});

test("周辺HUDは他フェーズと同じ基準位置に揃え、軸ラベルと重ねない", async () => {
  const viewport = { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  try {
    await openStory(page, "room-roomboardview--step-1-2-sharing");
    const sharedAnchors = {
      location: await readBounds(page, "board-location-card"),
      guide: await readBounds(page, "step-guide"),
      controls: await readBounds(page, "board-control-hud"),
      tools: await readBounds(page, "board-tools-hud"),
      operations: await readBounds(page, "board-operation-matrix"),
      privateNotes: await readBounds(page, "private-notes-dock"),
    };

    await openWorkspace(page);
    const workspaceAnchors = {
      location: await readBounds(page, "board-location-card"),
      guide: await readBounds(page, "step-guide"),
      controls: await readBounds(page, "board-control-hud"),
      tools: await readBounds(page, "board-tools-hud"),
      operations: await readBounds(page, "board-operation-matrix"),
      privateNotes: await readBounds(page, "private-notes-dock"),
      phaseLoop: await readBounds(page, "phase-loop-hud"),
      mapSize: await readBounds(page, "idea-map-size-controls-hud"),
    };
    for (const key of ["location", "guide", "operations"] as const) {
      expect
        .soft(workspaceAnchors[key], `${key}の位置を共通HUDに揃える`)
        .toEqual(sharedAnchors[key]);
    }
    expect(workspaceAnchors.controls.y).toBe(sharedAnchors.controls.y);
    expect(workspaceAnchors.controls.x + workspaceAnchors.controls.width).toBe(
      sharedAnchors.controls.x + sharedAnchors.controls.width,
    );
    expect(workspaceAnchors.tools.x).toBe(sharedAnchors.tools.x);
    expect(workspaceAnchors.tools.y + workspaceAnchors.tools.height).toBe(
      sharedAnchors.tools.y + sharedAnchors.tools.height,
    );

    const plane = await readBounds(page, "idea-value-feasibility-map-plane");
    expect.soft(plane).toEqual({
      x: 77.40625,
      y: 118,
      width: 961.1875,
      height: 534,
    });

    const question = await readBounds(page, "board-reference-hmw");
    const issue = await readBounds(page, "board-reference-issue");
    expect.soft(question.x).toBe(sharedAnchors.location.x);
    expect.soft(issue.x).toBeGreaterThanOrEqual(question.x + question.width);
    expect.soft(issue.y).toBe(question.y);
    expect.soft(issue.height).toBe(question.height);
    expect(await page.getByTestId("board-help-panel").count()).toBe(0);

    const rail = await readBounds(page, "idea-map-workspace-rail");
    expect(workspaceAnchors.privateNotes.x).toBeCloseTo(rail.x, 0);
    expect(workspaceAnchors.privateNotes.width).toBeCloseTo(rail.width, 0);
    expect(rail.x).toBeGreaterThanOrEqual(plane.x + plane.width);
    const axis = await readBounds(
      page,
      "idea-value-feasibility-map-x-axis-label",
    );
    const valueScale = page.getByRole("group", { name: "価値: 低から高" });
    const lowValue = await valueScale
      .getByText("低", { exact: true })
      .boundingBox();
    if (!lowValue) throw new Error("縦軸の低ラベルがありません");
    const phaseLoop = workspaceAnchors.phaseLoop;
    expect(
      phaseLoop.x,
      "再度付箋を書く操作は縦軸の低ラベルより右に置く",
    ).toBeGreaterThanOrEqual(lowValue.x + lowValue.width + 12);
    const controls = [phaseLoop, workspaceAnchors.mapSize];
    for (const control of controls) {
      const overlaps =
        axis.x < control.x + control.width &&
        axis.x + axis.width > control.x &&
        axis.y < control.y + control.height &&
        axis.y + axis.height > control.y;
      expect(overlaps, "軸ラベルと下部操作UIを重ねない").toBe(false);
    }
    const phaseOverlapsTools =
      workspaceAnchors.phaseLoop.x <
        workspaceAnchors.tools.x + workspaceAnchors.tools.width &&
      workspaceAnchors.phaseLoop.x + workspaceAnchors.phaseLoop.width >
        workspaceAnchors.tools.x &&
      workspaceAnchors.phaseLoop.y <
        workspaceAnchors.tools.y + workspaceAnchors.tools.height &&
      workspaceAnchors.phaseLoop.y + workspaceAnchors.phaseLoop.height >
        workspaceAnchors.tools.y;
    expect(phaseOverlapsTools, "マップ操作が左下ツールバーを妨げない").toBe(
      false,
    );
    const overlapsLowValue =
      lowValue.x < phaseLoop.x + phaseLoop.width &&
      lowValue.x + lowValue.width > phaseLoop.x &&
      lowValue.y < phaseLoop.y + phaseLoop.height &&
      lowValue.y + lowValue.height > phaseLoop.y;
    expect(overlapsLowValue, "再度付箋を書く操作を縦軸の目盛りに重ねない").toBe(
      false,
    );
  } finally {
    await page.close();
  }
});

test("3-2でマイ付箋をマップへ共有でき、画面幅を変えても評価座標を保持する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const id = "map-workspace-private-1";
    const source = page
      .getByTestId("private-notes-toolbar")
      .locator(`[data-note-id="${id}"]`);
    const area = await page
      .getByTestId("idea-map-fixed-position-area")
      .boundingBox();
    const start = await source
      .getByRole("button", { name: "付箋", exact: true })
      .boundingBox();
    if (!start || !area) throw new Error("移動する付箋がありません");
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x - 15, start.y + 20, { steps: 3 });
    await page.mouse.move(
      area.x + area.width * 0.45,
      area.y + area.height * 0.45,
      { steps: 10 },
    );
    await page.mouse.up();

    const placed = page.getByTestId(`idea-value-feasibility-map-note-${id}`);
    await placed.waitFor();
    expect(await source.count()).toBe(0);
    const position = await placed.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      bottom: (element as HTMLElement).style.bottom,
    }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(
      await placed.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        bottom: (element as HTMLElement).style.bottom,
      })),
    ).toEqual(position);

    expect(await source.count()).toBe(0);
    await page.screenshot({ path: `${output}/shared-to-map.png` });
  } finally {
    await page.close();
  }
});

test.each([
  320, 390,
])("%ipxではマイ付箋を開閉してもマップを表示し続ける", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const before = await plane.boundingBox();
    if (!before) throw new Error("評価マップがありません");
    expect(before.width).toBeGreaterThan(width * 0.65);
    expect(before.width / before.height).toBeCloseTo(9 / 5, 1);
    await page
      .getByRole("button", { name: "マイ付箋を閉じる", exact: true })
      .click();
    expect(await plane.boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "マイ付箋を開く", exact: true })
      .click();
    expect(await page.getByTestId("private-notes-scroll").isVisible()).toBe(
      true,
    );
    expect(await plane.boundingBox()).toEqual(before);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({ path: `${output}/workspace-${width}.png` });
  } finally {
    await page.close();
  }
});

test("3-2から3-3へ進んでもマップの位置・サイズを維持し、3-3ではマイ付箋だけを隠す", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const map2 = await readBounds(page, "idea-value-feasibility-map-plane");
    expect(await page.getByTestId("private-notes-toolbar").count()).toBe(1);

    await openMapOnly(page);
    const map3 = await readBounds(page, "idea-value-feasibility-map-plane");
    expect(map3).toEqual(map2);
    expect(await page.getByTestId("private-notes-toolbar").count()).toBe(0);
    expect(await page.getByTestId("idea-map-workspace-rail").count()).toBe(1);
    await page
      .getByTestId("idea-value-feasibility-map-note-map-workspace-placed")
      .waitFor();
  } finally {
    await page.close();
  }
});
