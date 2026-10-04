import { mkdir } from "node:fs/promises";
import { chromium, type Locator, type Page } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/map-cursor-layering";
const phase = process.env.CURSOR_LAYERING_EVIDENCE_PHASE ?? "after";

async function openStory(page: Page, story: string) {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--${story}&viewMode=story`,
  );
  await page.getByTestId("idea-value-feasibility-map-plane").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function paintedNoteAt(locator: Locator, xRatio = 0.5, yRatio = 0.5) {
  return locator.evaluate(
    (element, { xRatio, yRatio }) => {
      const r = element.getBoundingClientRect();
      return document
        .elementFromPoint(r.x + r.width * xRatio, r.y + r.height * yRatio)
        ?.closest("[data-note-id]")
        ?.getAttribute("data-note-id");
    },
    { xRatio, yRatio },
  );
}

test.each([
  ["idea-map-cursor-above-high-stack-notes", "cursor-front"],
  ["idea-map-cursor-above-local-drag", "cursor-back"],
  ["idea-map-cursor-above-remote-drag", "cursor-back"],
])("%s: 他者カーソルの矢印と名前を前面付箋の上へ描画する", async (story, frontId) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await openStory(page, story);
    const cursor = page.getByTestId(
      "remote-cursor-22222222-2222-4222-8222-222222222222",
    );
    await mkdir(output, { recursive: true });
    // プローブ前の通常描画を保存する。pointer-events変更は描画順に影響しない。
    await page.screenshot({ path: `${output}/${phase}-${story}.png` });
    const paint = await cursor.evaluate((element) => {
      const arrow = element.querySelector("svg");
      const label = element.querySelector("div");
      if (!arrow || !label) throw new Error("矢印または名前がありません");
      const arrowRect = arrow.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const points = [
        { x: arrowRect.x + 3, y: arrowRect.y + 3 },
        {
          x: labelRect.x + labelRect.width / 2,
          y: labelRect.y + labelRect.height / 2,
        },
      ];
      const underlyingNotes = points.map(({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-note-id]")
          ?.getAttribute("data-note-id"),
      );
      // カーソルだけhit testingへ参加させ、実ブラウザのpaint順を調べる。
      const original = element.style.pointerEvents;
      element.style.pointerEvents = "auto";
      const cursorIsFront = points.map(({ x, y }) =>
        element.contains(document.elementFromPoint(x, y)),
      );
      element.style.pointerEvents = original;
      return { underlyingNotes, cursorIsFront };
    });
    expect(paint.underlyingNotes).toEqual([frontId, frontId]);
    expect(paint.cursorIsFront).toEqual([true, true]);
  } finally {
    await browser.close();
  }
});

test("カーソルの名前を通して付箋を選び、奥の露出部分のクリックで前後を入れ替える", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await openStory(page, "idea-map-cursor-above-high-stack-notes");
    const label = page.getByText("他の参加者", { exact: true });
    const front = page.getByTestId(
      "idea-value-feasibility-map-note-cursor-front",
    );
    const back = page.getByTestId(
      "idea-value-feasibility-map-note-cursor-back",
    );
    expect(await paintedNoteAt(label)).toBe("cursor-front");
    const labelRect = await label.boundingBox();
    const backRect = await back.boundingBox();
    if (!labelRect || !backRect) throw new Error("付箋の位置がありません");
    const previousOrder = await front.evaluate(
      (element) => element.style.zIndex,
    );
    await page.mouse.click(
      labelRect.x + labelRect.width / 2,
      labelRect.y + labelRect.height / 2,
    );
    await expect
      .poll(() => front.evaluate((element) => element.style.zIndex))
      .not.toBe(previousOrder);
    await page.mouse.click(backRect.x + 3, backRect.y + backRect.height - 12);
    await expect.poll(() => paintedNoteAt(label)).toBe("cursor-back");
  } finally {
    await browser.close();
  }
});
