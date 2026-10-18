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
  await page.getByTestId("idea-map-viewport-plane").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openMapOnly(page: Page): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--idea-map-only&viewMode=story`,
  );
  await page.getByTestId("idea-map-viewport-plane").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`);
  await page.getByTestId("board-location-card").waitFor();
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

test.each(
  [
    { phase: "3-2", open: openWorkspace },
    { phase: "3-3", open: openMapOnly },
    { phase: "3-4", open: openVotingMap },
    { phase: "3-5", open: openResultMap },
  ].flatMap((phase) =>
    [
      {
        width: 1280,
        height: 720,
        planeX: 77.40625,
        planeWidth: 961.1875,
        originalHeight: 534,
      },
      {
        width: 1440,
        height: 900,
        planeX: 76,
        planeWidth: 1124,
        originalHeight: 624.4375,
      },
      {
        width: 1280,
        height: 1000,
        planeX: 76,
        planeWidth: 964,
        originalHeight: 535.546875,
      },
    ].map((viewport) => ({ ...phase, ...viewport })),
  ),
)(
  "$phaseで上端・横幅・操作UIを維持してマップ下端の余白を埋める（$width×$height）",
  async ({
    phase,
    open,
    width,
    height,
    planeX,
    planeWidth,
    originalHeight,
  }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await open(page);
      const plane = await readBounds(page, "idea-value-feasibility-map-plane");
      const slot = await readBounds(page, "idea-value-feasibility-map-slot");
      expect(plane.x).toBeCloseTo(planeX, 1);
      expect(plane.y).toBeCloseTo(118, 1);
      expect(plane.width).toBeCloseTo(
        planeWidth + (phase === "3-2" ? 0 : 224),
        1,
      );
      expect(
        plane.y + plane.height,
        "上端を動かさず、マップ用領域の下端まで表示する",
      ).toBeCloseTo(slot.y + slot.height, 1);
      const title = await readBounds(
        page,
        "idea-value-feasibility-map-x-axis-label",
      );
      const axisGap = title.y - plane.y - plane.height;
      expect(axisGap).toBeGreaterThanOrEqual(16);
      expect(axisGap).toBeLessThanOrEqual(26);
      expect(title.y + title.height).toBeLessThan(height);

      if (phase === "3-2" || phase === "3-3") {
        for (const testId of ["phase-loop-hud", "idea-map-size-controls-hud"]) {
          const control = await readBounds(page, testId);
          expect(
            control.y + control.height,
            "操作UIは下端の拡張に追従させず、従来の位置を維持する",
          ).toBeCloseTo(plane.y + originalHeight - 21, 1);
        }
      }
      const zoom = await readBounds(page, "canvas-zoom-hud");
      expect(zoom.y + zoom.height).toBeCloseTo(height - 12, 1);
      const notes = page
        .getByTestId("idea-map-viewport-plane")
        .getByTestId("note-card");
      const first = await notes.first().boundingBox();
      if (!first) throw new Error("マップ上の付箋がありません");
      expect(first.width).toBeCloseTo(136.577, 1);
      expect(first.height).toBeCloseTo(102.433, 1);
      await page.screenshot({
        path: `${output}/expanded-bottom-${phase}-${width}x${height}.png`,
      });
      await page.reload();
      await page.getByTestId("idea-map-viewport-plane").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() => readBounds(page, "idea-value-feasibility-map-plane"))
        .toEqual(plane);
    } finally {
      await page.close();
    }
  },
);

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
  { phase: "3-2", open: openWorkspace },
  { phase: "3-3", open: openMapOnly },
  { phase: "3-4", open: openVotingMap },
  { phase: "3-5", open: openResultMap },
])(
  "$phaseで横軸の線・矢印・ラベルを同じ配置ルールで表示する",
  async ({ phase, open }) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      const readRelativeGeometry = async () => {
        const plane = await readBounds(
          page,
          "idea-value-feasibility-map-plane",
        );
        const planeBottom = plane.y + plane.height;
        const result: Record<
          string,
          { x: number; y: number; width: number; height: number }
        > = {};
        for (const testId of [
          "idea-map-x-low-endpoint",
          "idea-value-feasibility-map-x-low-label",
          "idea-value-feasibility-map-x-low-arrow",
          "idea-value-feasibility-map-x-axis-label",
          "idea-value-feasibility-map-x-high-arrow",
        ]) {
          const bounds = await readBounds(page, testId);
          result[testId] = {
            x: bounds.x - plane.x,
            y: bounds.y - planeBottom,
            width: bounds.width,
            height: bounds.height,
          };
        }
        const high = await page
          .getByRole("group", { name: "実現のしやすさ: 低から高" })
          .getByText("高", { exact: true })
          .boundingBox();
        if (!high) throw new Error("横軸の高ラベルが表示されていません");
        result.high = {
          x: high.x - plane.x,
          y: high.y - planeBottom,
          width: high.width,
          height: high.height,
        };
        return result;
      };

      await openWorkspace(page);
      const reference = await readRelativeGeometry();
      if (phase !== "3-2") await open(page);
      const phaseGeometry = await readRelativeGeometry();
      for (const [testId, expected] of Object.entries(reference)) {
        if (testId === "idea-value-feasibility-map-x-axis-label") {
          for (const axis of ["x", "y"] as const)
            expect(
              phaseGeometry[testId][axis] +
                phaseGeometry[testId][axis === "x" ? "width" : "height"] / 2,
              `${phase}の横軸名は拡大後も中央・同じ高さに置く`,
            ).toBeCloseTo(
              expected[axis] +
                expected[axis === "x" ? "width" : "height"] / 2 +
                (axis === "x" && phase !== "3-2" ? 112 : 0),
              0,
            );
          continue;
        }
        for (const dimension of ["x", "y", "width", "height"] as const) {
          // 左端グループは下部HUDとの実際の重なりを避けるため、フェーズごとの
          // HUD幅に応じて横位置・残り線幅を変える。軸名は中央・同じ高さを別途検証する。
          if (
            (testId === "idea-map-x-low-endpoint" ||
              testId === "idea-value-feasibility-map-x-low-label" ||
              testId === "idea-value-feasibility-map-x-low-arrow" ||
              testId === "idea-value-feasibility-map-x-axis-label") &&
            (dimension === "x" ||
              dimension === "width" ||
              dimension === "height")
          )
            continue;
          expect(
            phaseGeometry[testId][dimension],
            `${phase}の${testId}.${dimension}が3-2と一致`,
          ).toBeCloseTo(
            expected[dimension] +
              (dimension === "x" &&
              phase !== "3-2" &&
              (testId === "high" ||
                testId === "idea-value-feasibility-map-x-high-arrow")
                ? 224
                : 0),
            1,
          );
        }
      }

      const endpoint = page.getByTestId("idea-map-x-low-endpoint");
      expect(await endpoint.count()).toBe(1);
      const endpointBounds = await endpoint.boundingBox();
      if (!endpointBounds)
        throw new Error("左端のグループが表示されていません");
      const plane = await readBounds(page, "idea-value-feasibility-map-plane");
      const title = await readBounds(
        page,
        "idea-value-feasibility-map-x-axis-label",
      );
      const low = await readBounds(
        page,
        "idea-value-feasibility-map-x-low-label",
      );
      const lowArrow = await readBounds(
        page,
        "idea-value-feasibility-map-x-low-arrow",
      );
      const highArrow = await readBounds(
        page,
        "idea-value-feasibility-map-x-high-arrow",
      );
      const high = await page
        .getByRole("group", { name: "実現のしやすさ: 低から高" })
        .getByText("高", { exact: true })
        .boundingBox();
      if (!high) throw new Error("横軸の高ラベルが表示されていません");

      expect(low.x + low.width).toBeLessThan(lowArrow.x);
      expect(lowArrow.x - (low.x + low.width)).toBeGreaterThanOrEqual(8);
      expect(title.x + title.width / 2).toBeCloseTo(
        plane.x + plane.width / 2,
        0,
      );
      expect(title.y + title.height / 2).toBeCloseTo(
        lowArrow.y + lowArrow.height / 2,
        1,
      );
      expect(highArrow.y + highArrow.height / 2).toBeCloseTo(
        lowArrow.y + lowArrow.height / 2,
        1,
      );
      expect(highArrow.x + highArrow.width).toBeLessThan(high.x);
      expect(high.x - (highArrow.x + highArrow.width)).toBeGreaterThanOrEqual(
        8,
      );
      expect(title.y).toBeGreaterThanOrEqual(plane.y + plane.height);

      const initial = {
        endpoint: endpointBounds,
        low,
        lowArrow,
        title,
        highArrow,
        high,
      };
      await page.screenshot({ path: `${output}/horizontal-axis-${phase}.png` });
      await page.reload();
      await page.getByTestId("idea-map-viewport-plane").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const reloaded = {
        endpoint: await endpoint.boundingBox(),
        low: await readBounds(page, "idea-value-feasibility-map-x-low-label"),
        lowArrow: await readBounds(
          page,
          "idea-value-feasibility-map-x-low-arrow",
        ),
        title: await readBounds(
          page,
          "idea-value-feasibility-map-x-axis-label",
        ),
        highArrow: await readBounds(
          page,
          "idea-value-feasibility-map-x-high-arrow",
        ),
        high: await page
          .getByRole("group", { name: "実現のしやすさ: 低から高" })
          .getByText("高", { exact: true })
          .boundingBox(),
      };
      expect(reloaded.endpoint).not.toBeNull();
      expect(reloaded.high).not.toBeNull();
      for (const key of [
        "endpoint",
        "low",
        "lowArrow",
        "title",
        "highArrow",
        "high",
      ] as const) {
        const actual = reloaded[key];
        const expected = initial[key];
        if (!actual || !expected)
          throw new Error(`${key} が表示されていません`);
        for (const dimension of ["x", "y", "width", "height"] as const)
          expect(
            Math.abs(actual[dimension] - expected[dimension]),
            `${key}.${dimension} はリロード後も維持`,
          ).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await page.close();
    }
  },
);

test.each([768, 1280, 1440])(
  "%dpxで3-2〜3-5の決定事項を同じ幅・余白の横並びにする",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const measurements = [];
      for (const open of [
        openWorkspace,
        openMapOnly,
        openVotingMap,
        openResultMap,
      ]) {
        await open(page);
        const question = page.getByRole("button", {
          name: "決定した問い",
          exact: true,
        });
        const issue = page.getByRole("button", {
          name: "決定した課題",
          exact: true,
        });
        expect(await question.getAttribute("aria-expanded")).toBe("false");
        expect(await issue.getAttribute("aria-expanded")).toBe("false");
        const questionBounds = await readBounds(page, "board-reference-hmw");
        const issueBounds = await readBounds(page, "board-reference-issue");
        expect(questionBounds.y).toBe(issueBounds.y);
        expect(questionBounds.height).toBe(issueBounds.height);
        expect(issueBounds.x - questionBounds.x - questionBounds.width).toBe(8);
        measurements.push({ question: questionBounds, issue: issueBounds });
      }
      for (const actual of measurements.slice(1))
        expect(actual).toEqual(measurements[0]);
    } finally {
      await page.close();
    }
  },
);

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 768, height: 844 },
  { width: 390, height: 844 },
])(
  "$width×$heightで評価・投票・決定のマップと付箋の表示位置が一致する",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      const measurements = [];
      for (const story of [
        "idea-map-only",
        "idea-map-voting",
        "idea-map-result",
      ]) {
        await openStory(page, `room-roomboardview--${story}`);
        const plane = page.getByTestId("idea-value-feasibility-map-plane");
        await plane.waitFor();
        await expect
          .poll(async () => (await plane.boundingBox())?.y)
          .toBeGreaterThan(0);
        // ヘッダーのResizeObserverによるマップ位置補正が完了したフレームを測る。
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        const bounds = {} as Record<
          string,
          Awaited<ReturnType<typeof readBounds>>
        >;
        for (const testId of [
          "idea-value-feasibility-map-plane",
          "idea-value-feasibility-map-x-axis-label",
          "idea-value-feasibility-map-y-axis-label",
          "idea-value-feasibility-map-note-map-workspace-placed",
        ])
          bounds[testId] = await readBounds(page, testId);
        measurements.push(bounds);
        await page.screenshot({
          path: `${output}/${story}-${viewport.width}.png`,
        });
      }
      for (const actual of measurements.slice(1)) {
        for (const [testId, reference] of Object.entries(measurements[0])) {
          if (testId === "idea-value-feasibility-map-x-axis-label") {
            for (const axis of ["x", "y"] as const)
              expect(
                Math.abs(
                  actual[testId][axis] +
                    actual[testId][axis === "x" ? "width" : "height"] / 2 -
                    reference[axis] -
                    reference[axis === "x" ? "width" : "height"] / 2,
                ),
                `${testId}.${axis}の中心`,
              ).toBeLessThanOrEqual(0.5);
            continue;
          }
          for (const dimension of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(actual[testId][dimension] - reference[dimension]),
              `${testId}.${dimension}`,
            ).toBeLessThanOrEqual(0.5);
          }
        }
      }
    } finally {
      await page.close();
    }
  },
);

test.each([1280, 1440])(
  "%dpxで3-2の進め方が最新の発表者HUDを遮らない",
  async (width) => {
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
  },
);

test.each([
  { label: "主観", kind: "subjective", remaining: 1 },
  { label: "客観", kind: "objective", remaining: 3 },
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
          name: `${label}シール 1票を1票取り消す`,
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
      await note.getByTestId("dot-vote-result-count-objective").innerText(),
    ).toBe("6");
    await page
      .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
      .click();
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

test.each([
  { phase: "3-2", width: 1280, height: 720, open: openWorkspace },
  { phase: "3-3", width: 1280, height: 720, open: openMapOnly },
  { phase: "3-2", width: 1440, height: 800, open: openWorkspace },
  { phase: "3-3", width: 1440, height: 800, open: openMapOnly },
  { phase: "3-2", width: 1440, height: 1000, open: openWorkspace },
  { phase: "3-3", width: 1440, height: 1000, open: openMapOnly },
  { phase: "3-2", width: 390, height: 720, open: openWorkspace },
  { phase: "3-3", width: 390, height: 720, open: openMapOnly },
])(
  "$phase / $width×$heightで軸の高低ラベルと矢印の間隔を確保する",
  async ({ phase, width, height, open }) => {
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
  },
);

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 1000 },
])(
  "$width×$heightで3-2のマップとマイ付箋を収め、操作UIと重ねない",
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
      const operations = await page
        .getByTestId("board-operation-matrix")
        .boundingBox();
      const controls = await page
        .getByTestId("board-control-hud")
        .boundingBox();
      const header = await page.getByTestId("board-header-row").boundingBox();
      if (!plane || !privateNotes || !operations || !controls || !header)
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

      expect(plane.height).toBeGreaterThanOrEqual(viewport.height * 0.55);
      const slot = await readBounds(page, "idea-value-feasibility-map-slot");
      expect(plane.y + plane.height).toBeCloseTo(slot.y + slot.height, 1);
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
      expect(operations.y).toBeGreaterThanOrEqual(
        privateNotes.y + privateNotes.height + 8,
      );
      expect(operations.x + operations.width).toBeLessThanOrEqual(
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
  },
);

test.each([
  {
    width: 390,
    height: 844,
    x: 56,
    y: 440.171875,
    widthPx: 318,
    heightPx: 187.765625,
  },
  {
    width: 768,
    height: 844,
    x: 76,
    y: 379.4375,
    widthPx: 452,
    heightPx: 265.765625,
  },
  {
    width: 900,
    height: 720,
    x: 76,
    y: 118,
    widthPx: 584,
    heightPx: 339.09375,
  },
  {
    width: 901,
    height: 720,
    x: 76,
    y: 118,
    widthPx: 585,
    heightPx: 339.65625,
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
    heightPx: 639.09375,
  },
])(
  "$width×$heightでも2軸マップ本体の位置とサイズを維持する",
  async (expected) => {
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
  },
);

test.each([
  { phase: "3-2", open: openWorkspace },
  { phase: "3-3", open: openMapOnly },
])(
  "$phaseでは上部情報パネルと2軸マップの間隔を保つ",
  async ({ phase, open }) => {
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
      expect(plane.width).toBeCloseTo(phase === "3-2" ? 1124 : 1348, 1);
      expect(plane.height).toBeCloseTo(639.09375, 1);
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
  },
);

test.each([
  {
    phase: "3-2",
    open: openWorkspace,
    viewport: { width: 1440, height: 1000 },
    retryCenterRatio: 0.31,
  },
  {
    phase: "3-3",
    open: openMapOnly,
    viewport: { width: 1440, height: 1000 },
    retryCenterRatio: 0.31,
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
])(
  "$phaseでは下部操作をマップ内に配置し、同じ高さで重ねない",
  async ({ open, viewport, retryCenterRatio }) => {
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
      const controls = await readBounds(page, "idea-map-workspace-controls");
      const controlsBottom = controls.y + controls.height;
      // 下端を伸ばしても、操作UIは元の枠内の余白と表示位置を維持する。
      expect(controlsBottom - mapSizeBottom).toBeGreaterThanOrEqual(16);
      expect(controlsBottom - mapSizeBottom).toBeLessThanOrEqual(24);
      expect(planeBottom).toBeGreaterThanOrEqual(controlsBottom);
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
  },
);

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
    const scaledAxis = await page
      .getByTestId("idea-value-feasibility-map-x-axis-label")
      .boundingBox();
    if (!scaledAxis || !initialAxis)
      throw new Error("広さ変更前後の横軸ラベルが表示されていません");
    expect(
      Math.abs(
        scaledAxis.x +
          scaledAxis.width / 2 -
          (initialAxis.x + initialAxis.width / 2),
      ),
    ).toBeLessThan(1);
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
    const readLogicalPosition = async () =>
      note.evaluate((element) => {
        const data = (element as HTMLElement).dataset;
        return {
          left: Number(data.mapX),
          bottom: Number(data.mapY),
        };
      });
    const dragHandle = note.getByRole("button", {
      name: "付箋",
      exact: true,
    });
    const dragBounds = await dragHandle.boundingBox();
    const positionArea = await page
      .getByTestId("idea-map-viewport-plane")
      .boundingBox();
    if (!dragBounds || !positionArea)
      throw new Error("倍率変更後の付箋を移動できません");
    const beforeDrag = await readLogicalPosition();
    const pointerX = dragBounds.x + Math.min(20, dragBounds.width / 2);
    const pointerY = dragBounds.y + Math.min(20, dragBounds.height / 2);
    const pointerDeltaX = positionArea.width * 0.1;
    await page.mouse.move(pointerX, pointerY);
    await page.mouse.down();
    await page.mouse.move(pointerX + pointerDeltaX, pointerY, {
      steps: 8,
    });
    await page.mouse.up();
    const expectedLeft =
      beforeDrag.left + (pointerDeltaX / positionArea.width) * 100;
    await expect
      .poll(async () => (await readLogicalPosition()).left)
      .toBeGreaterThan(expectedLeft - 0.25);
    const movedLogicalPosition = await readLogicalPosition();
    expect(movedLogicalPosition.left).toBeLessThan(expectedLeft + 0.25);

    await page.getByRole("button", { name: "マップを狭くする" }).click();
    await expectNoteScale(note, 4);
    await expect
      .poll(async () => (await noteCards[0].boundingBox())?.width ?? 0)
      .toBeGreaterThan(0);
    expect(await plane.boundingBox()).toEqual(initialPlane);
    expect(await grid.boundingBox()).toEqual(initialGrid);
    expect(await readLogicalPosition()).toEqual(movedLogicalPosition);
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
])(
  "$phase / $width×$heightで低い軸ラベルを操作UIと重ねない",
  async ({ width, height, open, phase }) => {
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

      if (phase === "3-2") {
        // 3-2は文字サイズUIの右を基準にする。行ボックスの余白ではなく、
        // 文字そのものとズームボタンの操作領域が重ならないことを確認する。
        const textBounds = await feasibilityScale
          .getByText("低", { exact: true })
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
          `${width}×${height}で横軸の「低」とズームUIが重ならない`,
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
  },
);

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 800 },
  { width: 900, height: 720 },
  { width: 390, height: 720 },
])(
  "3-2と3-3で横軸端点を操作UIと重ねない（$width×$height）",
  async ({ width, height }) => {
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
      if (!controls || !zoomControls)
        throw new Error("左下の操作UIが表示されていません");

      expect(sharing.groupedEndpoint).toBe(1);
      expect(
        sharing.arrowAfterLabelGap,
        "3-2では「低」の右に左向き矢印を表示する",
      ).toBeGreaterThanOrEqual(8);
      expect(sharing.arrowAfterLabelGap).toBeLessThanOrEqual(16);
      expect(sharing.verticalCenterGap).toBeLessThanOrEqual(4);
      expect(mapOnly.groupedEndpoint).toBe(1);

      for (const [phase, geometry] of [
        ["3-2", sharing],
        ["3-3", mapOnly],
      ] as const) {
        for (const [name, bounds, gap] of [
          ["文字サイズUI", geometry.controls, 24],
          ["ズームUI", geometry.zoomControls, 16],
        ] as const) {
          if (
            bounds &&
            geometry.endpoint.top < bounds.y + bounds.height &&
            geometry.endpoint.bottom > bounds.y
          )
            expect(
              geometry.endpoint.left,
              `${phase}では重なる${name}の右に余白を確保する`,
            ).toBeGreaterThanOrEqual(bounds.x + bounds.width + gap);
        }
        expect(
          geometry.endpoint.left,
          `${phase}では軸の左端がマップの左側に残る`,
        ).toBeLessThan(geometry.mapPlane.x + geometry.mapPlane.width / 2);
      }
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
      expect(connectionGap, "矢印の先端を軸線の始点に接続する").toBeLessThan(
        0.1,
      );
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
      ).toBeCloseTo(0, 1);
      expect(sharing.endpoint.left - sharing.mapPlane.x).toBeCloseTo(
        mapOnly.endpoint.left - mapOnly.mapPlane.x,
        1,
      );
      if (width >= 768) {
        expect(sharing.axisTitle.y + sharing.axisTitle.height / 2).toBeCloseTo(
          sharing.arrow.y + sharing.arrow.height / 2,
          1,
        );
      } else {
        expect(
          sharing.titleFromPlaneBottom - mapOnly.titleFromPlaneBottom,
        ).toBeCloseTo(0, 1);
      }
      expect(sharing.mapPlane.x).toBe(mapOnly.mapPlane.x);
      expect(mapOnly.mapPlane.width - sharing.mapPlane.width).toBe(
        width >= 640 ? 224 : 0,
      );
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
  },
);

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
])(
  "3-2の横軸左端は初回・リロード・タイマー変更・工程遷移で一致する（$width×$height）",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      const readLayout = async () => {
        await page.getByTestId("idea-map-x-low-endpoint").waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              );
            }),
        );
        const layout: Record<
          string,
          Awaited<ReturnType<typeof readBounds>>
        > = {};
        for (const testId of [
          "idea-map-x-low-endpoint",
          "idea-value-feasibility-map-x-low-label",
          "idea-value-feasibility-map-x-low-arrow",
          "idea-value-feasibility-map-plane",
          "idea-value-feasibility-map-x-axis-label",
          "idea-value-feasibility-map-y-axis-label",
          "idea-value-feasibility-map-note-map-workspace-placed",
          "note-font-size-controls",
          "canvas-zoom-hud",
        ])
          layout[testId] = await readBounds(page, testId);
        return layout;
      };
      const expectSameLayout = (
        actual: Awaited<ReturnType<typeof readLayout>>,
        expected: Awaited<ReturnType<typeof readLayout>>,
      ) => {
        for (const [testId, reference] of Object.entries(expected)) {
          if (testId === "idea-value-feasibility-map-x-axis-label") {
            for (const axis of ["x", "y"] as const)
              expect(
                Math.abs(
                  actual[testId][axis] +
                    actual[testId][axis === "x" ? "width" : "height"] / 2 -
                    reference[axis] -
                    reference[axis === "x" ? "width" : "height"] / 2,
                ),
                `${testId}.${axis}の中心`,
              ).toBeLessThanOrEqual(0.5);
            continue;
          }
          for (const dimension of ["x", "y", "width", "height"] as const)
            expect(
              Math.abs(actual[testId][dimension] - reference[dimension]),
              `${testId}.${dimension}`,
            ).toBeLessThanOrEqual(0.5);
        }
      };

      await openWorkspace(page);
      const initial = await readLayout();
      await page.screenshot({
        path: `${output}/endpoint-initial-${viewport.width}.png`,
      });
      await page.reload();
      expectSameLayout(await readLayout(), initial);
      await page.screenshot({
        path: `${output}/endpoint-reloaded-${viewport.width}.png`,
      });

      await openStory(page, "room-roomboardview--idea-map-phase-transitions");
      const phase = page.getByRole("combobox", {
        name: "検証用の工程切り替え",
      });
      await phase.selectOption("2");
      expectSameLayout(await readLayout(), initial);

      const timer = page.getByTestId("room-timer");
      await timer.click();
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      await expect.poll(() => timer.getAttribute("data-status")).toBe("paused");
      expectSameLayout(await readLayout(), initial);
      await page.getByRole("button", { name: "再開", exact: true }).click();
      await expect
        .poll(() => timer.getAttribute("data-status"))
        .toBe("running");
      await timer.click();
      expectSameLayout(await readLayout(), initial);

      // ラベルを左へ戻しても、ズーム操作を妨げない。
      await page
        .getByRole("button", { name: "キャンバスを拡大", exact: true })
        .click();
      expect(
        await page
          .getByRole("button", { name: "ズームを100%に戻す", exact: true })
          .textContent(),
      ).toBe("125%");
      await page
        .getByRole("button", { name: "付箋全体を表示", exact: true })
        .click();
      expectSameLayout(await readLayout(), initial);
      await phase.selectOption("3");
      expect(await page.getByTestId("idea-map-x-low-endpoint").count()).toBe(1);
      await phase.selectOption("2");
      expectSameLayout(await readLayout(), initial);
      await page.screenshot({
        path: `${output}/endpoint-transitioned-${viewport.width}.png`,
      });

      await page.setViewportSize({
        width: viewport.width - 100,
        height: viewport.height,
      });
      await readLayout();
      await page.setViewportSize(viewport);
      expectSameLayout(await readLayout(), initial);
    } finally {
      await page.close();
    }
  },
);

test("中間幅でも通常位置の中心と評価値を保ち、端の付箋を枠内に収める", async () => {
  const page = await browser.newPage({
    viewport: { width: 800, height: 900 },
  });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const note = page.getByTestId(
      "idea-value-feasibility-map-note-map-workspace-placed",
    );
    const edge = page.getByTestId(
      "idea-value-feasibility-map-note-map-workspace-shared-1",
    );
    const edgePosition = await edge.evaluate((element) => ({
      x: (element as HTMLElement).dataset.mapX,
      y: (element as HTMLElement).dataset.mapY,
    }));
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
    const area = await readBounds(page, "idea-map-viewport-plane");
    await expect
      .poll(async () => {
        const rect = await edge.getByTestId("note-card").boundingBox();
        if (!rect) return Infinity;
        return Math.max(
          area.x - rect.x,
          area.y - rect.y,
          rect.x + rect.width - area.x - area.width,
          rect.y + rect.height - area.y - area.height,
        );
      })
      .toBeLessThanOrEqual(0.1);
    expect(
      await edge.evaluate((element) => ({
        x: (element as HTMLElement).dataset.mapX,
        y: (element as HTMLElement).dataset.mapY,
      })),
    ).toEqual(edgePosition);
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
  { phase: "3-4", width: 1280, height: 720, open: openVotingMap },
  { phase: "3-5", width: 1280, height: 720, open: openResultMap },
  { phase: "3-2", width: 390, height: 844, open: openWorkspace },
  { phase: "3-3", width: 390, height: 844, open: openMapOnly },
  { phase: "3-4", width: 390, height: 844, open: openVotingMap },
  { phase: "3-5", width: 390, height: 844, open: openResultMap },
])(
  "$phase / $width×$heightで展開した決定事項の付箋を切らずに表示する",
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
  },
);

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
      .getByTestId("idea-map-viewport-plane")
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

test.each([320, 390])(
  "%ipxではマイ付箋を開閉してもマップを表示し続ける",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await openWorkspace(page);
      const plane = page.getByTestId("idea-value-feasibility-map-plane");
      const before = await plane.boundingBox();
      if (!before) throw new Error("評価マップがありません");
      expect(before.width).toBeGreaterThan(width * 0.65);
      const slot = await readBounds(page, "idea-value-feasibility-map-slot");
      expect(before.y + before.height).toBeCloseTo(slot.y + slot.height, 1);
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
  },
);

test.each([
  { width: 1280, reducedMotion: "no-preference" as const },
  { width: 1280, reducedMotion: "reduce" as const },
  { width: 390, reducedMotion: "no-preference" as const },
  { width: 390, reducedMotion: "reduce" as const },
])(
  "$width px / $reducedMotion: 工程切り替えで右側だけを広げ、座標・高さ・付箋サイズを保つ",
  async ({ width, reducedMotion }) => {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion,
    });
    try {
      await openStory(page, "room-roomboardview--idea-map-phase-transitions");
      const phase = page.getByRole("combobox", {
        name: "検証用の工程切り替え",
      });
      await phase.selectOption("2");
      const plane = page.getByTestId("idea-value-feasibility-map-plane");
      const map2 = await readBounds(page, "idea-value-feasibility-map-plane");
      const note = page.getByTestId(
        "idea-value-feasibility-map-note-map-workspace-placed",
      );
      const card = note.getByTestId("note-card");
      const before = await card.boundingBox();
      if (!before) throw new Error("配置済み付箋がありません");
      // 同じDOMが工程をまたいで残ることも確認する。
      const original = await note.elementHandle();
      for (const step of ["3", "4", "5", "2"]) {
        const expanded = step !== "2" && width >= 640;
        const expectedWidth = map2.width + (expanded ? 224 : 0);
        await phase.selectOption(step);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await expect
          .poll(async () => (await plane.boundingBox())?.width)
          .toBeCloseTo(expectedWidth, 1);
        const current = await readBounds(
          page,
          "idea-value-feasibility-map-plane",
        );
        expect(current.x).toBeCloseTo(map2.x, 1);
        // 狭い画面の上端は工程ごとのヘッダーの高さに追従する。
        if (width >= 640) expect(current.y).toBeCloseTo(map2.y, 1);
        expect(current.height).toBeCloseTo(map2.height, 1);
        expect(current.x + current.width).toBeLessThanOrEqual(width);
        if (expanded)
          expect(width - current.x - current.width).toBeLessThan(24);
        expect(
          await note.evaluate(
            (element, previous) => element === previous,
            original,
          ),
        ).toBe(true);
        expect(await note.getAttribute("data-map-x")).toBe("70");
        expect(await note.getAttribute("data-map-y")).toBe("75");
        const after = await card.boundingBox();
        if (!after) throw new Error("工程切り替え後の付箋がありません");
        expect(after.width).toBeCloseTo(before.width, 1);
        expect(after.height).toBeCloseTo(before.height, 1);
        expect(after.y - current.y).toBeCloseTo(before.y - map2.y, 1);
        expect(after.x - before.x).toBeCloseTo(expanded ? 224 * 0.7 : 0, 1);
        expect(await page.getByTestId("private-notes-toolbar").count()).toBe(
          step === "2" ? 1 : 0,
        );
      }
      await phase.selectOption("3");
      await expect
        .poll(async () => (await plane.boundingBox())?.width)
        .toBeCloseTo(map2.width + (width >= 640 ? 224 : 0), 1);
      await page.screenshot({
        path: `${output}/expanded-right-${width}-${reducedMotion}.png`,
      });
    } finally {
      await page.close();
    }
  },
);
