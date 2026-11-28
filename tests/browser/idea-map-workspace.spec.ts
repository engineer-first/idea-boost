import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { byViewport, includeMobile, widths } from "./viewports";

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
  await page.getByTestId("idea-value-feasibility-map-plane").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openMapOnly(page: Page): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--idea-map-only&viewMode=story`,
  );
  await page.getByTestId("idea-value-feasibility-map-plane").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`);
  await page.getByTestId("board-control-hud").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openVotingMap(page: Page): Promise<void> {
  await openStory(page, "room-roomboardview--idea-map-voting");
}

async function openResultMap(page: Page): Promise<void> {
  await openStory(page, "room-roomboardview--idea-map-result");
}

async function readBounds(page: Page, testId: string) {
  const bounds = await page.getByTestId(testId).boundingBox();
  if (!bounds) throw new Error(`${testId} が表示されていません`);
  return bounds;
}

async function waitForLayoutAnimations(locator: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        locator.evaluate((element) => {
          const animations = new Set(element.getAnimations({ subtree: true }));
          for (
            let parent = element.parentElement;
            parent;
            parent = parent.parentElement
          )
            for (const animation of parent.getAnimations())
              animations.add(animation);
          return [...animations].filter(
            (animation) =>
              (animation.playState === "running" || animation.pending) &&
              animation.effect?.getTiming().iterations !== Infinity,
          ).length;
        }),
      // ボードのキャラクターの吹き出しは文字を出し切るまで1秒を少し超えるため、
      // expect.poll の既定1秒ではそれが終わる前に打ち切られる。
      { timeout: 3_000 },
    )
    .toBe(0);
}

test.each([
  { width: 768, height: 844 },
  { width: 900, height: 720 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
])(
  "3-2の横軸名は左右の線の間に同じ高さで収まる（$width×$height）",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await openWorkspace(page);
      const title = await readBounds(
        page,
        "idea-value-feasibility-map-x-axis-label",
      );
      const plane = await readBounds(page, "idea-value-feasibility-map-plane");
      const lowArrow = await readBounds(
        page,
        "idea-value-feasibility-map-x-low-arrow",
      );
      const highArrow = await readBounds(
        page,
        "idea-value-feasibility-map-x-high-arrow",
      );
      expect(title.x + title.width / 2, "軸名はマップ横幅の中央").toBeCloseTo(
        plane.x + plane.width / 2,
        0,
      );
      expect(
        title.y + title.height / 2,
        "軸名と軸線の中心を同じ高さにする",
      ).toBeCloseTo(lowArrow.y + lowArrow.height / 2, 1);
      expect(highArrow.y + highArrow.height / 2).toBeCloseTo(
        lowArrow.y + lowArrow.height / 2,
        1,
      );
      expect(
        title.x - (lowArrow.x + lowArrow.width),
        "左の線を軸名の前に確保する",
      ).toBeGreaterThanOrEqual(12);
      expect(
        highArrow.x - (title.x + title.width),
        "右の線を軸名の後に確保する",
      ).toBeGreaterThanOrEqual(12);
      expect(title.y, "ラベルがマップ本体を覆わない").toBeGreaterThanOrEqual(
        plane.y + plane.height,
      );
      const labelPaint = await page
        .getByTestId("idea-value-feasibility-map-x-axis-label")
        .evaluate((label) => ({
          background: getComputedStyle(label).backgroundColor,
          paddingLeft: Number.parseFloat(getComputedStyle(label).paddingLeft),
          paddingRight: Number.parseFloat(getComputedStyle(label).paddingRight),
        }));
      const valuePaint = await page
        .getByTestId("idea-value-feasibility-map-y-axis-label")
        .evaluate((label) => ({
          paddingTop: Number.parseFloat(getComputedStyle(label).paddingTop),
          paddingBottom: Number.parseFloat(
            getComputedStyle(label).paddingBottom,
          ),
        }));
      expect(labelPaint.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(labelPaint.paddingLeft).toBe(valuePaint.paddingTop);
      expect(labelPaint.paddingRight).toBe(valuePaint.paddingBottom);
      await page.screenshot({
        path: `${output}/inline-axis-title-${viewport.width}.png`,
      });
    } finally {
      await page.close();
    }
  },
);

test.each([
  { label: "「イチオシ！」", kind: "subjective", remaining: 1 },
  { label: "「需要ありそう」", kind: "objective", remaining: 3 },
])(
  "3-4の固定マップで$label票を貼り付け・取り消しできる",
  async ({ label, kind, remaining }) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await openStory(page, "room-roomboardview--idea-map-voting");
      const note = page.getByTestId(
        "idea-value-feasibility-map-note-map-workspace-shared-5",
      );
      const before = await note.boundingBox();
      await page
        .getByRole("button", {
          name: `${label}シール 残り${remaining}票`,
          exact: true,
        })
        .click();
      await note
        .getByRole("button", {
          name: `付箋（${label}シールを貼る）`,
          exact: true,
        })
        .click();
      await expect
        .poll(() => note.getByTestId(`dot-vote-sticker-image-${kind}`).count())
        .toBe(1);
      await expect
        .poll(() =>
          page
            .getByRole("button", {
              name: `${label}シール 残り${remaining - 1}票`,
              exact: true,
            })
            .count(),
        )
        .toBe(1);
      await note
        .getByRole("button", {
          name: `${label}シールを取り消す`,
          exact: true,
        })
        .click();
      await expect
        .poll(() => note.getByTestId(`dot-vote-sticker-image-${kind}`).count())
        .toBe(0);
      expect(await note.boundingBox()).toEqual(before);
      await page.screenshot({ path: `${output}/voting-${kind}.png` });
    } finally {
      await page.close();
    }
  },
);

test("3-5の固定マップで投票結果を表示し、採用する付箋を選べる", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await openStory(page, "room-roomboardview--idea-map-result");
    const note = page.getByTestId(
      "idea-value-feasibility-map-note-map-workspace-shared-5",
    );
    const before = await note.boundingBox();
    expect(
      await note.getByTestId("dot-vote-result-count-objective").textContent(),
    ).toBe("6");
    await note.getByRole("button", { name: /採用するアイデア:/ }).click();
    await expect
      .poll(() => page.getByTestId("canvas-input-adoption-count").textContent())
      .toBe("1");
    expect(await note.boundingBox()).toEqual(before);
    await page.screenshot({ path: `${output}/result-selected.png` });
  } finally {
    await page.close();
  }
});

test.each(
  byViewport(
    { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
    { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
    { phase: "3-2", width: 1440, height: 800, open: openWorkspace },
    { phase: "3-3", width: 1440, height: 800, open: openMapOnly },
    { phase: "3-2", width: 1440, height: 1000, open: openWorkspace },
    { phase: "3-3", width: 1440, height: 1000, open: openMapOnly },
    { phase: "3-2", width: 390, height: 720, open: openWorkspace },
    { phase: "3-3", width: 390, height: 720, open: openMapOnly },
  ),
)(
  "$phase / （$width×$height）で軸の高低ラベルと矢印の間隔を確保する",
  async ({ phase, width, height, open }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await open(page);
      for (const { axis, name, low, high } of [
        {
          axis: "x",
          name: "実現のしやすさ: 左ほどしにくく、右ほどしやすい",
          low: "しにくい",
          high: "しやすい",
        },
        { axis: "y", name: "価値: 低から高", low: "低", high: "高" },
      ]) {
        const scale = page.getByRole("group", { name });
        for (const { endpoint, label } of [
          { endpoint: "low", label: low },
          { endpoint: "high", label: high },
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
                "横軸は「しにくい」、左矢印、軸線の順に並べる",
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
  },
);

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 1000 },
])(
  "（$width×$height）で3-2のマップとマイ付箋を収め、操作UIと重ねない",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await openWorkspace(page);
      const plane = await page
        .getByTestId("idea-value-feasibility-map-plane")
        .boundingBox();
      const privateNotes = await page
        .getByTestId("private-notes-dock")
        .boundingBox();
      const controls = await page
        .getByTestId("board-control-hud")
        .boundingBox();
      const header = await page.getByTestId("board-header-row").boundingBox();
      if (!plane || !privateNotes || !controls || !header)
        throw new Error("評価画面がありません");
      const valueScale = page.getByRole("group", {
        name: "価値: 低から高",
      });
      const high = await valueScale
        .getByText("高", { exact: true })
        .boundingBox();
      const low = await valueScale
        .getByText("低", { exact: true })
        .boundingBox();
      if (!high || !low) throw new Error("縦軸の目盛りがありません");

      // マップはボードの上にあり、全体表示で周りの欄を避けて画面に収める。
      expect(plane.y + plane.height).toBeLessThanOrEqual(viewport.height);
      expect(low.y - high.y).toBeGreaterThan(plane.height * 0.7);
      expect(plane.y).toBeGreaterThan(controls.y + controls.height);
      expect(
        await page
          .getByTestId("board-header-row")
          .evaluate((element) => getComputedStyle(element).position),
      ).toBe("absolute");
      expect(privateNotes.y).toBeGreaterThanOrEqual(
        controls.y + controls.height,
      );
      expect(privateNotes.x).toBeGreaterThanOrEqual(plane.x + plane.width);
      expect(privateNotes.y + privateNotes.height).toBeLessThanOrEqual(
        viewport.height,
      );
      expect(privateNotes.x + privateNotes.width).toBeLessThanOrEqual(
        viewport.width,
      );
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
  },
);

test.each([
  { phase: "3-2", open: openWorkspace },
  { phase: "3-3", open: openMapOnly },
])("$phaseでは上部情報パネルと2軸マップの間隔を保つ", async ({ open }) => {
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

    // 上の情報は決定事項と中央のステップバーのうち下にあるほう。どちらとも重ねない。
    const trail = await readBounds(page, "phase-step-trail");
    const aboveBottom = Math.max(
      context.y + context.height,
      trail.y + trail.height,
    );
    expect(plane.y - aboveBottom).toBeGreaterThanOrEqual(8);
    const valueLine = await readBounds(
      page,
      "idea-value-feasibility-map-y-scale-bar",
    );
    // マップの下端だけを伸ばし、縦軸のデザイン・配置基準は維持する。
    expect(valueAxis.y + valueAxis.height / 2).toBeCloseTo(
      valueLine.y + valueLine.height / 2,
      1,
    );
    const feasibilityLine = await readBounds(
      page,
      "idea-value-feasibility-map-x-scale-bar",
    );
    expect(feasibilityAxis.y).toBeGreaterThan(plane.y + plane.height);
    expect(feasibilityAxis.y + feasibilityAxis.height / 2).toBeCloseTo(
      feasibilityLine.y + feasibilityLine.height / 2,
      0,
    );
  } finally {
    await page.close();
  }
});

test("個人付箋をスクロールし、参照情報を開いてもマップが動かない", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const before = await plane.boundingBox();
    expect(
      await page.getByRole("textbox", { name: "付箋を書く" }).count(),
    ).toBe(0);
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

    expect(await page.getByTestId("step-guide").count()).toBe(0);
  } finally {
    await page.close();
  }
});

test.each(
  byViewport(
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
  ),
)(
  "$phase / （$width×$height）で低い軸ラベルを操作UIと重ねない",
  async ({ width, height, open, phase }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await open(page);
      const valueScale = page.getByRole("group", {
        name: "価値: 低から高",
      });
      const feasibilityScale = page.getByRole("group", {
        name: "実現のしやすさ: 左ほどしにくく、右ほどしやすい",
      });
      const valueLow = await valueScale
        .getByText("低", { exact: true })
        .boundingBox();
      const feasibilityLow = await feasibilityScale
        .getByText("しにくい", { exact: true })
        .boundingBox();
      const fontSizeControl = page.getByTestId("note-font-size-controls");
      // 付箋を選ぶまでは非表示だが、場所は保つので配置を測る。
      const fontSizeControls = (await fontSizeControl.count())
        ? await fontSizeControl.evaluate((element) =>
            element.getBoundingClientRect().toJSON(),
          )
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

      if (phase === "3-2") {
        // 3-2は文字サイズUIの右を基準にする。行ボックスの余白ではなく、
        // 文字そのものとズームボタンの操作領域が重ならないことを確認する。
        const textBounds = await feasibilityScale
          .getByText("しにくい", { exact: true })
          .evaluate((label) => {
            const range = document.createRange();
            range.selectNodeContents(label);
            return range.getBoundingClientRect().toJSON();
          });
        for (const button of await page
          .getByTestId("canvas-zoom-hud")
          .getByRole("button")
          .all()) {
          const buttonBounds = await button.boundingBox();
          if (buttonBounds)
            expect(overlaps(textBounds, buttonBounds)).toBe(false);
        }
      } else {
        expect(
          overlaps(feasibilityLow, zoomControls),
          `${width}×${height}で横軸の「しにくい」とズームUIが重ならない`,
        ).toBe(false);
      }
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
          `${width}×${height}で横軸の「しにくい」と文字サイズUIが重ならない`,
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
          `${width}×${height}で横軸の「しにくい」と文字サイズUIの間に16px以上の余白を保つ`,
        ).toBeGreaterThanOrEqual(16);
      }
    } finally {
      await page.close();
    }
  },
);

test("上部は共通HUDを使い、決定事項を横並びにしてもマップ位置を保つ", async () => {
  const viewport = { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const initialPlane = await plane.boundingBox();
    // 広い画面は現在地カードを出さないため、左の欄の幅を予約する枠で測る。
    const location = await page
      .getByTestId("board-location-slot")
      .boundingBox();
    const question = await page
      .getByTestId("board-reference-hmw")
      .boundingBox();
    const issue = await page.getByTestId("board-reference-issue").boundingBox();
    const controls = await page.getByTestId("board-control-hud").boundingBox();
    if (!initialPlane || !location || !question || !issue || !controls)
      throw new Error("上部UIまたは2軸マップがありません");

    expect(location.width).toBe(360);
    expect(issue.x).toBeGreaterThanOrEqual(question.x + question.width);
    expect(Math.abs(question.y - issue.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(question.height - issue.height)).toBeLessThanOrEqual(1);
    expect(await page.getByTestId("board-help-panel").count()).toBe(0);
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
    expect(await plane.boundingBox()).toEqual(initialPlane);
  } finally {
    await page.close();
  }
});

test.skipIf(!includeMobile)(
  "狭い画面では決定事項を縦並びにし、展開時も重ねない",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
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
  },
);

test.each(
  byViewport(
    { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
    { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
    { phase: "3-4", width: 1280, height: 720, open: openVotingMap },
    { phase: "3-5", width: 1280, height: 720, open: openResultMap },
    { phase: "3-2", width: 390, height: 844, open: openWorkspace },
    { phase: "3-3", width: 390, height: 844, open: openMapOnly },
    { phase: "3-4", width: 390, height: 844, open: openVotingMap },
    { phase: "3-5", width: 390, height: 844, open: openResultMap },
  ),
)(
  "$phase / （$width×$height）で展開した決定事項の付箋を切らずに表示する",
  async ({ width, height, open }) => {
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

        // 開く際のscale補間中に別フレームの矩形を引くと余白が縮んで見える。
        await waitForLayoutAnimations(popover);
        const { popupBounds, noteBounds } = await popover.evaluate(
          (element) => {
            const note = element.querySelector('[data-slot="sticky-note"]');
            if (!note) throw new Error("決定事項の付箋がありません");
            const bounds = (target: Element) => {
              if (!target.checkVisibility({ checkVisibilityCSS: true }))
                throw new Error("決定事項の展開内容が表示されていません");
              const { x, y, width, height } = target.getBoundingClientRect();
              return { x, y, width, height };
            };
            return { popupBounds: bounds(element), noteBounds: bounds(note) };
          },
        );
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
  },
);

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
      .getByTestId("idea-value-feasibility-map-plane")
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

test.each(widths(390))(
  "%ipxでは個人付箋の一覧とマップを同時に表示し続ける",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await openWorkspace(page);
      const plane = page.getByTestId("idea-value-feasibility-map-plane");
      const before = await plane.boundingBox();
      if (!before) throw new Error("評価マップがありません");
      // マップ面は画面の中に収まる（全体表示が縦横とも画面からはみ出させない）。
      expect(before.x).toBeGreaterThanOrEqual(0);
      expect(before.y).toBeGreaterThanOrEqual(0);
      expect(before.x + before.width).toBeLessThanOrEqual(width);
      expect(before.y + before.height).toBeLessThanOrEqual(844);
      expect(
        await page.getByRole("textbox", { name: "付箋を書く" }).count(),
      ).toBe(0);
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
  },
);

test.each([
  { width: 900, height: 720 },
  { width: 1280, height: 800 },
  { width: 1440, height: 1000 },
])(
  "3-3（3-4・3-5も同じ広がり方、$width×$height）ではタイマーがマップの右上の角に重ならない",
  async ({ width, height }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await openMapOnly(page);
      const plane = page.getByTestId("idea-value-feasibility-map-plane");
      await waitForLayoutAnimations(plane);
      const map = await readBounds(page, "idea-value-feasibility-map-plane");
      const timer = await readBounds(page, "timer-floating");
      const overlapsHorizontally =
        timer.x < map.x + map.width && map.x < timer.x + timer.width;
      const overlapsVertically =
        timer.y < map.y + map.height && map.y < timer.y + timer.height;
      expect(overlapsHorizontally && overlapsVertically).toBe(false);
      expect(timer.x - (map.x + map.width)).toBeGreaterThanOrEqual(8);
      await page.screenshot({
        path: `${output}/map-only-timer-${width}.png`,
      });
    } finally {
      await page.close();
    }
  },
);

test.each([
  { width: 1280, height: 800 },
  { width: 390, height: 720 },
])(
  "3-4（$width×$height）の全体表示では、マップ面と横軸の行を下の投票パレットと重ねない",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await openVotingMap(page);
      const plane = page.getByTestId("idea-value-feasibility-map-plane");
      await waitForLayoutAnimations(plane);
      const palette = await readBounds(page, "vote-palette-hud");
      const map = await readBounds(page, "idea-value-feasibility-map-plane");
      const axisRow = await readBounds(
        page,
        "idea-value-feasibility-map-x-axis-row",
      );
      const axisName = await readBounds(
        page,
        "idea-value-feasibility-map-x-axis-label",
      );
      for (const [name, box] of [
        ["マップ面", map],
        ["横軸の行", axisRow],
        ["横軸の名前", axisName],
      ] as const) {
        expect(
          box.y + box.height,
          `${name}は投票パレットより上に収める`,
        ).toBeLessThanOrEqual(palette.y);
      }
      await page.screenshot({
        path: `${output}/voting-palette-${viewport.width}.png`,
      });
    } finally {
      await page.close();
    }
  },
);
