import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/private-note-guidance";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterEach(async () => {
  const video = page?.video();
  const width = page?.viewportSize()?.width;
  await page?.close();
  if (video) await video.saveAs(`${output}/${width}-drag-roundtrip.webm`);
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(name: string, width: number, touch = false) {
  page = await browser.newPage({
    viewport: { width, height: 844 },
    hasTouch: touch,
    ...(touch
      ? { recordVideo: { dir: output, size: { width, height: 844 } } }
      : {}),
  });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--private-guidance-${name}&viewMode=story`,
  );
  await page.getByTestId("board-frame").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function expectInsideViewport(selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );
}

for (const width of [390, 1280]) {
  test(`${width}px: 全付箋を共有して空になった欄へ共有付箋をドラッグで戻せる`, async () => {
    await openStory("sharing", width);
    const toolbar = page.getByTestId("private-notes-toolbar");
    const frame = await page.getByTestId("board-frame").boundingBox();
    if (!frame) throw new Error("共有ボードがありません");
    for (let remaining = 1; remaining >= 0; remaining--) {
      const surface = toolbar
        .getByRole("button", { name: "付箋", exact: true })
        .first();
      const source = await surface.boundingBox();
      if (!source) throw new Error("共有する付箋がありません");
      await page.mouse.move(source.x + 40, source.y + 40);
      await page.mouse.down();
      await page.mouse.move(source.x + 46, source.y + 46);
      await page.mouse.move(frame.x + 45, frame.y + 100, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(() => toolbar.getByTestId("note-card").count())
        .toBe(remaining);
    }
    const shared = page.getByTestId("board-note-guidance-second");
    const surface = shared.getByRole("button", { name: "付箋", exact: true });
    await surface.hover();
    const source = await surface.boundingBox();
    const target = await toolbar.boundingBox();
    if (!source || !target)
      throw new Error("戻す付箋または空の付箋欄がありません");
    await page.mouse.move(source.x + 40, source.y + 40);
    await page.mouse.down();
    await page.mouse.move(source.x + 46, source.y + 46);
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect.poll(() => toolbar.getByTestId("note-card").count()).toBe(1);
    expect(await shared.count()).toBe(0);
  });

  test(`${width}px: 入力欄から本文入りの付箋を作成し、入力を続けられる`, async () => {
    await openStory("empty", width);
    expect(await page.getByTestId("note-card").count()).toBe(0);
    const toolbar = page.getByTestId("private-notes-toolbar");
    const composer = toolbar.getByRole("textbox", { name: "付箋を書く" });
    const privacyMessage = page.getByText("自分だけに表示", { exact: true });
    expect(await privacyMessage.isVisible()).toBe(true);
    expect(
      await privacyMessage.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expectInsideViewport(
      '[data-testid="private-notes-header"] [aria-label="付箋を書く"]',
    );
    await composer.press("Enter");
    expect(await toolbar.getByTestId("note-card").count()).toBe(0);
    await composer.fill(" \n\t ");
    await composer.press("Enter");
    expect(await toolbar.getByTestId("note-card").count()).toBe(0);
    await composer.fill("変換中の本文");
    await composer.evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent("compositionstart", { data: "変換" }),
      ),
    );
    await composer.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          isComposing: true,
          bubbles: true,
        }),
      ),
    );
    expect(await toolbar.getByTestId("note-card").count()).toBe(0);
    await composer.evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent("compositionend", { data: "変換後" }),
      ),
    );
    await composer.fill("改行してから作る");
    await composer.press("Shift+Enter");
    expect(await composer.inputValue()).toBe("改行してから作る\n");
    expect(await toolbar.getByTestId("note-card").count()).toBe(0);
    await composer.fill("自分で書いた下書き");
    await composer.press("Enter");
    await expect.poll(() => page.getByTestId("note-card").count()).toBe(1);
    const createdNote = toolbar.locator("[data-note-id]").first();
    await expect
      .poll(() => createdNote.getByRole("textbox").inputValue())
      .toBe("自分で書いた下書き");
    await expect.poll(() => composer.inputValue()).toBe("");
    await expect
      .poll(() =>
        composer.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    expect(
      await page.getByRole("button", { name: "ボードに共有" }).count(),
    ).toBe(0);
    await page.screenshot({ path: `${output}/${width}-personal.png` });
  });

  test(`${width}px: クリックやEnterでは共有せず、ドラッグで一枚を共有して戻す`, async () => {
    await openStory("sharing", width, true);
    const toolbar = page.getByTestId("private-notes-toolbar");
    const firstNote = toolbar.locator('[data-note-id="guidance-first"]');
    expect(await toolbar.getByTestId("note-card").count()).toBe(2);
    expect(
      await toolbar.getByRole("textbox", { name: "付箋を書く" }).count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: /ボードに共有|マイ付箋へ戻す/ })
        .count(),
    ).toBe(0);
    const first = firstNote.getByRole("button", { name: "付箋", exact: true });
    await first.tap();
    await first.press("Enter");
    await page.keyboard.press("Escape");
    expect(await toolbar.getByTestId("note-card").count()).toBe(2);
    await page.screenshot({
      path: `${output}/${width}-sharing-before-drag.png`,
    });
    const start = await first.boundingBox();
    const frame = await page.getByTestId("board-frame").boundingBox();
    if (!start || !frame) throw new Error("ドラッグ元・先がありません");
    await page.mouse.move(start.x + 40, start.y + 40);
    await page.mouse.down();
    await page.mouse.move(start.x + 46, start.y + 46);
    await page.mouse.move(frame.x + 45, frame.y + 100, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => toolbar.getByTestId("note-card").count()).toBe(1);
    const shared = page.getByTestId("board-note-guidance-first");
    await shared.waitFor();
    await page.screenshot({ path: `${output}/${width}-shared-by-drag.png` });
    const sharedSurface = shared.getByRole("button", {
      name: "付箋",
      exact: true,
    });
    // 表示だけでなくhit可能性も確認して、戻しのドラッグを始める。
    // カメラがdrop後に付箋をパネル裏へ移す回帰もここで検出する。
    await sharedSurface.hover();
    const back = await sharedSurface.boundingBox();
    const target = await toolbar.boundingBox();
    if (!back || !target) throw new Error("戻すドラッグ元・先がありません");
    await page.mouse.move(back.x + 40, back.y + 40);
    await page.mouse.down();
    await page.mouse.move(back.x + 46, back.y + 46);
    await page.mouse.move(target.x + target.width / 2, target.y + 80, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(() => toolbar.getByTestId("note-card").count()).toBe(2);
    expect(await page.getByTestId("board-note-guidance-first").count()).toBe(0);
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    await page.screenshot({ path: `${output}/${width}-returned-by-drag.png` });
  });

  test(`${width}px: 共有工程でも最初の付箋をスクロール前にドラッグできる`, async () => {
    await openStory("sharing-host", width);
    const share = page
      .getByTestId("private-notes-toolbar")
      .getByRole("button", { name: "付箋", exact: true })
      .first();
    const bounds = await share.boundingBox();
    const scroll = await page.getByTestId("private-notes-scroll").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y).toBeGreaterThanOrEqual(scroll?.y ?? 0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      (scroll?.y ?? 0) + (scroll?.height ?? 0),
    );
    await page.screenshot({ path: `${output}/${width}-sharing-host.png` });
  });

  test(`${width}px: 切断中は追加と付箋操作を実行できない`, async () => {
    await openStory("disconnected", width);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(
      await toolbar.getByText("自分だけに表示", { exact: true }).isVisible(),
    ).toBe(true);
    expect(
      await toolbar.getByRole("textbox", { name: "付箋を書く" }).count(),
    ).toBe(0);
    expect(
      await toolbar
        .getByRole("button", { name: "付箋", exact: true })
        .first()
        .isDisabled(),
    ).toBe(true);
    await page.screenshot({ path: `${output}/${width}-disconnected.png` });
  });

  test(`${width}px: 投票では下書き共有/戻すを出さず本文を編集できない`, async () => {
    await openStory("voting", width);
    expect(await page.getByTestId("private-notes-toolbar").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: "マイ付箋へ戻す" }).count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "付箋", exact: true })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    expect(await page.locator("textarea:not([readonly])").count()).toBe(0);
    await page.screenshot({ path: `${output}/${width}-voting.png` });
  });
}
