import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function open(story: string, height = 720): Promise<void> {
  await page.setViewportSize({ width: 1280, height });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story`,
  );
  await page.getByTestId("board-scroller").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function viewTransform(): Promise<string> {
  return page
    .getByTestId("board-scroller")
    .evaluate((element) =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-testid="board-canvas"], [data-testid="idea-map-viewport"]',
        ),
        (layer) => layer.style.transform,
      ).join("|"),
    );
}
for (const story of [
  "additional-writing",
  "additional-writing-question",
  "additional-writing-idea",
]) {
  for (const height of [720, 560]) {
    test(`${story}: 1280×${height}でパネルだけが開閉し、付箋とボードの寸法を維持する`, async () => {
      await open(story, height);
      const toolbar = page.getByTestId("private-notes-toolbar");
      await expect
        .poll(() => toolbar.getAttribute("data-expanded"))
        .toBe("false");
      const panel = await toolbar.boundingBox();
      const board = await page.getByTestId("board-scroller").boundingBox();
      if (!panel || !board) throw new Error("ボードとパネルを計測できません");
      expect(panel.height).toBeLessThanOrEqual(260);
      expect(panel.height).toBeGreaterThanOrEqual(140);
      if (height === 560) expect(panel.height).toBeLessThanOrEqual(240);
      expect(height - panel.y - panel.height).toBeGreaterThanOrEqual(8);
      expect(height - panel.y - panel.height).toBeLessThanOrEqual(20);
      const tools = await page.getByTestId("board-tools-hud").boundingBox();
      expect(tools && tools.y + tools.height <= panel.y - 6).toBe(true);
      expect(board.width).toBeGreaterThan(1000);
      const note = toolbar.locator('[data-testid="note-card"]').last();
      const noteBefore = await note.boundingBox();
      expect(noteBefore?.width).toBe(200);
      const before = await viewTransform();
      await page
        .getByRole("button", { name: "マイ付箋を展開", exact: true })
        .click();
      await expect
        .poll(async () => (await toolbar.boundingBox())?.height ?? 0)
        .toBeGreaterThan(panel.height + 20);
      expect(await page.getByTestId("board-scroller").boundingBox()).toEqual(
        board,
      );
      expect(await viewTransform()).toBe(before);
      expect((await note.boundingBox())?.width).toBe(noteBefore?.width);
      const expandedPanel = await toolbar.boundingBox();
      expect(
        expandedPanel && height - expandedPanel.y - expandedPanel.height <= 20,
      ).toBe(true);
      await page
        .getByRole("button", { name: "マイ付箋を縮小", exact: true })
        .click();
      await expect
        .poll(async () =>
          Math.round((await toolbar.boundingBox())?.height ?? 0),
        )
        .toBe(Math.round(panel.height));
      expect(await viewTransform()).toBe(before);
      await page.screenshot({
        path: `test-results/board-layout/${story}-${height}.png`,
        timeout: 5000,
      });
    });
  }
}

test("縮小中の追加・IME変換と選択範囲を保ち、パネルのホイールでボードを動かさない", async () => {
  await open("additional-writing-empty");
  const toolbar = page.getByTestId("private-notes-toolbar");
  await page
    .getByRole("button", { name: "新しい付箋を追加", exact: true })
    .click();
  const editor = toolbar.locator("textarea:not([readonly])");
  await editor.waitFor();
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
  expect(
    await editor.evaluate((element) => document.activeElement === element),
  ).toBe(true);
  await editor.fill("日本語の変換を保つ");
  await editor.evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(2, 5),
  );
  await editor.dispatchEvent("compositionstart", { data: "変換" });
  await page
    .getByRole("button", { name: "マイ付箋を展開", exact: true })
    .click();
  await page
    .getByRole("button", { name: "マイ付箋を縮小", exact: true })
    .click();
  expect(await editor.inputValue()).toBe("日本語の変換を保つ");
  expect(
    await editor.evaluate((element) => [
      document.activeElement === element,
      (element as HTMLTextAreaElement).selectionStart,
      (element as HTMLTextAreaElement).selectionEnd,
    ]),
  ).toEqual([true, 2, 5]);
  await editor.dispatchEvent("compositionend", { data: "変換" });
  const before = await viewTransform();
  await toolbar.hover();
  await page.mouse.wheel(0, 400);
  expect(await viewTransform()).toBe(before);
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
});

test("最後に編集した未共有付箋を表示し、共有付箋の全文を開いたまま入力できる", async () => {
  await open("additional-writing");
  const scroll = page.getByTestId("private-notes-scroll");
  const lastEdited = page.locator('[data-note-id="additional-draft-9"]');
  await expect
    .poll(async () => {
      const a = await lastEdited.boundingBox();
      const b = await scroll.boundingBox();
      return Boolean(a && b && a.y >= b.y - 1 && a.y < b.y + b.height);
    })
    .toBe(true);
  const shared = page
    .getByTestId("board-scroller")
    .locator('[data-note-id="reference-one"]')
    .getByRole("button", { name: "付箋", exact: true });
  await shared.click();
  const preview = page.getByRole("region", { name: "共有付箋の全文" });
  await preview.waitFor();
  await lastEdited
    .getByRole("button", { name: "付箋", exact: true })
    .press("Enter");
  await lastEdited
    .getByRole("button", { name: "付箋", exact: true })
    .press("Enter");
  const editor = lastEdited.locator("textarea:not([readonly])");
  await editor.fill("参照しながら追加する下書き");
  expect(await preview.isVisible()).toBe(true);
  const bounds = await preview.boundingBox();
  const panel = await page.getByTestId("private-notes-toolbar").boundingBox();
  expect(bounds && panel && bounds.y + bounds.height <= panel.y).toBe(true);
  await editor.press("Escape");
  await expect.poll(() => preview.count()).toBe(0);
});

test("共有から戻ると同じカメラ位置と倍率を維持し、開閉は別画面へ同期しない", async () => {
  await open("additional-writing-from-sharing");
  const nextStep = page.getByRole("button", {
    name: "次のステップへ",
    exact: true,
  });
  const addWriting = page.getByRole("button", {
    name: "付箋を書き足す",
    exact: true,
  });
  await nextStep.waitFor({ state: "visible" });
  expect(
    await page
      .getByTestId("board-control-hud")
      .getByRole("button", {
        name: "付箋を書き足す",
        exact: true,
      })
      .isVisible(),
  ).toBe(true);
  expect(await page.getByTestId("timer-floating").count()).toBe(0);
  expect(await nextStep.innerText()).toContain("次へ進む");
  expect(
    await page.getByRole("button", { name: "できた！", exact: true }).count(),
  ).toBe(0);
  await addWriting.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "手のひらツール" }).click();
  const initial = await viewTransform();
  await page
    .getByRole("button", { name: "キャンバスを拡大", exact: true })
    .click();
  await expect.poll(viewTransform).not.toBe(initial);
  const before = await viewTransform();
  await page
    .getByRole("button", { name: "付箋を書き足す", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("private-notes-toolbar").getAttribute("data-expanded"),
    )
    .toBe("false");
  expect(await viewTransform()).toBe(before);
  await page
    .getByTestId("board-scroller")
    .locator('[data-note-id="reference-one"]')
    .getByRole("button", { name: "付箋", exact: true })
    .click();
  await page.getByRole("region", { name: "共有付箋の全文" }).waitFor();
  await page
    .getByRole("button", { name: "共有付箋の全文を閉じる", exact: true })
    .click();
  const second = await browser.newPage();
  try {
    await second.goto(
      `${origin}/iframe.html?id=room-roomboardview--additional-writing&viewMode=story`,
    );
    await second
      .getByRole("button", { name: "マイ付箋を展開", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "マイ付箋を展開", exact: true })
      .click();
    expect(
      await second
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("false");
  } finally {
    await second.close();
  }
});

test("3-3から追加執筆へ戻っても2軸マップの配置と表示倍率を保ち、パンで隠れた付箋を見られる", async () => {
  await open("additional-writing-from-idea-evaluation");
  await page
    .getByRole("button", { name: "キャンバスを拡大", exact: true })
    .click();
  const note = page
    .getByTestId("board-scroller")
    .locator('[data-note-id="reference-one"]');
  const before = await note.boundingBox();
  await page
    .getByRole("button", { name: "もう一度付箋を書く", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "個人作業へ戻る", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("private-notes-toolbar").getAttribute("data-expanded"),
    )
    .toBe("false");
  await expect
    .poll(async () => {
      const box = await note.boundingBox();
      if (!box || !before) return false;
      return (
        Math.abs(box.x - before.x) < 1 &&
        Math.abs(box.y - before.y) < 1 &&
        Math.abs(box.width - before.width) < 1
      );
    })
    .toBe(true);
  const transform = await viewTransform();
  await page.mouse.move(800, 220);
  await page.mouse.wheel(0, 180);
  await expect.poll(viewTransform).not.toBe(transform);
  expect(
    await page
      .getByTestId("idea-value-feasibility-map-note-reference-one")
      .getAttribute("data-map-x"),
  ).toBe("25");
  expect(
    await page
      .getByTestId("idea-value-feasibility-map-note-reference-one")
      .getAttribute("data-map-y"),
  ).toBe("75");
});

test("全画面で下の行を編集中に縮小しても、その付箋を入力できる位置へ追従する", async () => {
  await open("additional-writing");
  await page
    .getByRole("button", { name: "マイ付箋を展開", exact: true })
    .click();
  const note = page
    .getByTestId("private-notes-toolbar")
    .locator("[data-testid='note-card']")
    .last();
  const surface = note.getByRole("button", { name: "付箋", exact: true });
  await surface.press("Enter");
  await surface.press("Enter");
  const editor = note.locator("textarea:not([readonly])");
  await editor.fill("下の行の入力を継続する");
  await page
    .getByRole("button", { name: "マイ付箋を縮小", exact: true })
    .click();
  await expect
    .poll(async () => {
      const a = await editor.boundingBox();
      const b = await page.getByTestId("private-notes-scroll").boundingBox();
      return Boolean(
        a &&
          b &&
          a.y >= b.y - 1 &&
          a.y + Math.min(a.height, 100) <= b.y + b.height + 1,
      );
    })
    .toBe(true);
  expect(
    await editor.evaluate((element) => document.activeElement === element),
  ).toBe(true);
});

for (const story of [
  "additional-writing",
  "additional-writing-question",
  "additional-writing-idea",
]) {
  test(`${story}: ツールを切り替えず背景をドラッグして共有ボードを移動できる`, async () => {
    await open(story);
    const point = await page
      .getByTestId("board-scroller")
      .evaluate((viewport) => {
        const panel = document
          .querySelector('[data-testid="private-notes-toolbar"]')
          ?.getBoundingClientRect();
        for (let y = 220; y < (panel?.top ?? 450) - 60; y += 40) {
          for (let x = 600; x < 1150; x += 50) {
            const element = document.elementFromPoint(x, y);
            if (
              element &&
              viewport.contains(element) &&
              !element.closest(
                'button, [data-testid="note-card"], [data-board-native-control]',
              )
            )
              return { x, y };
          }
        }
        throw new Error("背景のドラッグ開始位置が見つかりません");
      });
    const before = await viewTransform();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 80, point.y + 30, { steps: 8 });
    await page.mouse.up();
    await expect.poll(viewTransform).not.toBe(before);
    expect(
      await page
        .getByTestId("private-notes-toolbar")
        .getAttribute("data-expanded"),
    ).toBe("false");
  });
}
