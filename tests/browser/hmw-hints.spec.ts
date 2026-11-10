import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/hmw-hints";
let browser: Browser;
let page: Page;

async function expectCloudClearOfNotes(cloud: Locator) {
  const cloudBounds = await cloud.boundingBox();
  if (!cloudBounds) throw new Error("吹き出しが表示されていません");
  const workspace = await page
    .getByTestId("private-notes-workspace")
    .boundingBox();
  const reference = await page
    .getByTestId("board-context-references")
    .boundingBox();
  const readable: { x: number; y: number; width: number; height: number }[] =
    [];
  if (reference) readable.push(reference);
  if (workspace) {
    const text = page
      .getByTestId("private-notes-list")
      .locator(
        '[data-testid="note-card"] textarea, [data-testid^="example-note-"] p',
      );
    for (const element of await text.all()) {
      const bounds = await element.boundingBox();
      if (!bounds) continue;
      // 付箋の枠より、スクロール欄内で見えている本文を優先して守る。
      const x = Math.max(bounds.x, workspace.x);
      const y = Math.max(bounds.y, workspace.y);
      const right = Math.min(
        bounds.x + bounds.width,
        workspace.x + workspace.width,
      );
      const bottom = Math.min(
        bounds.y + bounds.height,
        workspace.y + workspace.height,
      );
      if (right > x && bottom > y)
        readable.push({ x, y, width: right - x, height: bottom - y });
    }
  }
  for (const other of readable) {
    const overlaps =
      cloudBounds.x < other.x + other.width &&
      cloudBounds.x + cloudBounds.width > other.x &&
      cloudBounds.y < other.y + other.height &&
      cloudBounds.y + cloudBounds.height > other.y;
    expect({ cloudBounds, other, overlaps }).toMatchObject({ overlaps: false });
  }
}

async function clickFloatingWord(word: Locator) {
  const bounds = await word.boundingBox();
  if (!bounds) throw new Error("ワードが画面に表示されていません");
  // 浮遊するワードへ実際にポインターを動かし、ホバーで静止してから押す。
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await word.click();
}
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

for (const { width, height } of [
  { width: 1280, height: 800 },
  { width: 1268, height: 632 },
  { width: 390, height: 800 },
  { width: 320, height: 568 },
]) {
  test(`${width}x${height}px: 3択と文例を画面内で使い、Escapeでキャラクターへ戻る`, async () => {
    page = await browser.newPage({
      viewport: { width, height },
    });
    page.setDefaultTimeout(5_000);
    await page.clock.install();
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-2-step-1-waiting-for-hint&viewMode=story`,
      { timeout: 30_000 },
    );
    const trigger = page.getByRole("button", { name: "問いのヒントを開く" });
    await page.getByTestId("private-notes-workspace").waitFor();
    // キャラクターと吹き出しは2-1の間は常に表示する。
    expect(await trigger.count()).toBe(1);
    await page.getByTestId("hmw-hint-nudge").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const character = await trigger.boundingBox();
    const workspace = await page
      .getByTestId("private-notes-workspace")
      .boundingBox();
    expect(character).not.toBeNull();
    expect(workspace).not.toBeNull();
    expect((workspace?.y ?? 0) + (workspace?.height ?? 0)).toBeLessThanOrEqual(
      character?.y ?? 0,
    );
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "問いのヒント" });
    await dialog.waitFor();
    const words = dialog.getByRole("group", { name: "考え方のワード" });
    expect(await words.getByRole("button").count()).toBe(3);
    await expectCloudClearOfNotes(dialog.getByTestId("hmw-thought-cloud"));
    expect(
      await page.getByTestId("private-notes-workspace").boundingBox(),
    ).toEqual(workspace);
    for (let group = 0; group < 4; group++) {
      await dialog.getByRole("button", { name: "別の3つ" }).click();
      expect(await words.getByRole("button").count()).toBe(3);
      await expectCloudClearOfNotes(dialog.getByTestId("hmw-thought-cloud"));
    }
    await clickFloatingWord(words.getByRole("button", { name: "先回り" }));
    const question = dialog.getByRole("region", { name: "問いの文例" });
    expect(await question.textContent()).toContain(
      "チームで何を作るか決めるとき",
    );
    expect(await dialog.getByRole("textbox").count()).toBe(0);
    expect(await words.count()).toBe(0);
    const use = dialog.getByRole("button", { name: "この問いにする" });
    await use.click({ trial: true });
    await dialog
      .getByRole("button", { name: "問いのヒントを閉じる" })
      .click({ trial: true });
    const choices = await use.boundingBox();
    expect(choices?.x).toBeGreaterThanOrEqual(
      (character?.x ?? 0) + (character?.width ?? 0),
    );
    expect((choices?.y ?? 0) + (choices?.height ?? 0)).toBeGreaterThan(
      character?.y ?? 0,
    );
    await expect
      .poll(() =>
        question.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.height ?? 0,
    );
    await page.screenshot({ path: `${output}/${width}-question.png` });
    const cloud = dialog.getByTestId("hmw-thought-cloud");
    await expectCloudClearOfNotes(cloud);
    expect(
      await page.getByTestId("private-notes-workspace").boundingBox(),
    ).toEqual(workspace);
    expect(
      (await page.getByTestId("private-notes-workspace").boundingBox())?.height,
    ).toBeGreaterThan(0);
    const stillPosition = await cloud.boundingBox();
    await page.waitForTimeout(300);
    const laterPosition = await cloud.boundingBox();
    expect(laterPosition?.y).toBeCloseTo(stillPosition?.y ?? 0, 0);
    await dialog.getByRole("button", { name: "別のワードを選択する" }).click();
    expect(await words.getByRole("button").count()).toBe(3);
    await clickFloatingWord(words.getByRole("button", { name: "助け合う" }));
    expect(await question.textContent()).toContain("周りの人と協力して");
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        trigger.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.screenshot({ path: `${output}/${width}-closed.png` });
    await page
      .getByRole("button", { name: "付箋を追加" })
      .click({ trial: true });
  });
}

for (const width of [1280, 320]) {
  test(`${width}px: キャラクターと吹き出しを常時表示し、採用後も表示に戻す`, async () => {
    page = await browser.newPage({
      viewport: { width, height: width === 320 ? 568 : 800 },
      reducedMotion: "reduce",
    });
    await page.clock.install();
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-2-step-1-few-notes&viewMode=story`,
    );
    await page.getByTestId("private-notes-workspace").waitFor();
    const trigger = page.getByRole("button", { name: "問いのヒントを開く" });
    expect(await trigger.count()).toBe(1);
    const nudge = page.getByTestId("hmw-hint-nudge");
    // 呼びかけ条件を待たずに表示し、90秒放置でも変えない。
    expect(await nudge.count()).toBe(1);
    await expectCloudClearOfNotes(nudge);
    await page.clock.runFor(90_000);
    expect(await nudge.count()).toBe(1);
    await page
      .getByRole("button", { name: /こんな見た目も.*あるかも/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "問いのヒント" });
    await dialog.waitFor();
    await expectCloudClearOfNotes(dialog.getByTestId("hmw-thought-cloud"));
    await dialog.getByRole("button", { name: "楽しみ" }).click();
    await dialog.getByRole("button", { name: "この問いにする" }).click();
    await page.clock.runFor(2_000);
    // 採用と再計時を終えても、キャラクターと吹き出しは表示に戻る。
    expect(await trigger.count()).toBe(1);
    expect(await nudge.count()).toBe(1);
  });
}

test("フェードなしで常に表示し、書き出し後も消えない", async () => {
  page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "no-preference",
  });
  page.setDefaultTimeout(5_000);
  await page.clock.install();
  await page.goto(
    `${origin}/iframe.html?id=hmw-hmwhintcharacter--nudge&viewMode=story`,
  );
  const character = page.getByTestId("hmw-hint-character");
  await character.waitFor();
  // キャラクター自身へフェードイン・フェードアウトのanimationを付けない。
  const hasOwnFade = await character.evaluate((element) =>
    element
      .getAnimations()
      .some(
        (item) => (item.effect as KeyframeEffect | null)?.target === element,
      ),
  );
  expect(hasOwnFade).toBe(false);
  await clickFloatingWord(
    page.getByRole("button", { name: /こんな見た目も.*あるかも/ }),
  );
  const dialog = page.getByRole("dialog", { name: "問いのヒント" });
  await dialog.waitFor();
  await clickFloatingWord(dialog.getByRole("button", { name: "楽しみ" }));
  await dialog.getByRole("button", { name: "この問いにする" }).click();
  await page.clock.runFor(2_000);
  expect(await character.count()).toBe(1);
});

test("動きを減らす設定では雲・ワード・キャラクターの浮遊を止める", async () => {
  page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    reducedMotion: "reduce",
  });
  await page.goto(
    `${origin}/iframe.html?id=hmw-hmwhintcharacter--nudge&viewMode=story`,
  );
  const nudge = page.getByRole("button", { name: /こんな見た目も.*あるかも/ });
  await nudge.waitFor();
  expect(await nudge.innerText()).toBe("こんな見た目も\nあるかも...");
  await nudge.click();
  const dialog = page.getByRole("dialog", { name: "問いのヒント" });
  await dialog.waitFor();
  const activeAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
  expect(activeAnimations).toBe(0);
  await dialog.getByRole("button", { name: "先回り" }).click();
  await dialog.getByRole("button", { name: "この問いにする" }).click();
  expect(await page.getByRole("status").textContent()).toContain(
    "いっしょに書き出そう",
  );
  expect(
    await page.evaluate(() =>
      document.getAnimations().map((animation) => ({
        type: animation.constructor.name,
        state: animation.playState,
        target:
          (animation.effect as KeyframeEffect | null)?.target instanceof Element
            ? (
                (animation.effect as KeyframeEffect).target as Element
              ).outerHTML.slice(0, 160)
            : null,
      })),
    ),
  ).toEqual([]);
});
