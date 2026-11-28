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
  await page.getByTestId("board-scroller").waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}
async function waitForPanelTransition(): Promise<void> {
  await page
    .getByTestId("private-notes-workspace")
    .evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      await Promise.allSettled(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
}
async function expandPrivatePanel(): Promise<void> {
  await page
    .getByTestId("private-notes-scroll")
    .click({ position: { x: 8, y: 8 } });
  await expect
    .poll(() =>
      page.getByTestId("private-notes-toolbar").getAttribute("data-expanded"),
    )
    .toBe("true");
  await waitForPanelTransition();
}
async function collapsePrivatePanel(): Promise<void> {
  const frame = await page.getByTestId("board-frame").boundingBox();
  if (!frame) throw new Error("ボードのクリック位置を取得できません");
  await page.mouse.click(frame.x + 2, frame.y + frame.height / 2);
  await expect
    .poll(() =>
      page.getByTestId("private-notes-toolbar").getAttribute("data-expanded"),
    )
    .toBe("false");
  await waitForPanelTransition();
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
      const header = await toolbar
        .getByTestId("private-notes-header")
        .boundingBox();
      if (!header) throw new Error("入力と開閉の操作列がありません");
      expect(header.height).toBeGreaterThanOrEqual(48);
      expect(header.height).toBeLessThanOrEqual(56);
      expect(panel.height).toBeLessThan(240);
      expect(height - panel.y - panel.height).toBeGreaterThanOrEqual(8);
      expect(height - panel.y - panel.height).toBeLessThanOrEqual(20);
      expect(await page.getByTestId("board-tools-hud").isVisible()).toBe(false);
      expect(
        await page.getByRole("textbox", { name: "付箋を書く" }).count(),
      ).toBe(story === "additional-writing" ? 1 : 0);
      expect(board.width).toBeGreaterThan(1000);
      const note = toolbar.locator('[data-testid="note-card"]').last();
      const noteBefore = await note.boundingBox();
      if (!noteBefore) throw new Error("縮小時に見せる付箋がありません");
      expect(noteBefore.width).toBe(200);
      expect(noteBefore.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(noteBefore.y + noteBefore.height).toBeLessThan(
        panel.y + panel.height,
      );
      const before = await viewTransform();
      await expandPrivatePanel();
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
      await collapsePrivatePanel();
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

test("縮小中も入力・IME変換と選択範囲を保ち、パネルのホイールでボードを動かさない", async () => {
  await open("additional-writing-empty");
  const toolbar = page.getByTestId("private-notes-toolbar");
  const editor = toolbar.getByRole("textbox", { name: "付箋を書く" });
  await editor.waitFor();
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
  await editor.focus();
  expect(
    await editor.evaluate((element) => document.activeElement === element),
  ).toBe(true);
  await editor.fill("日本語の変換を保つ");
  await editor.evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(2, 5),
  );
  await editor.dispatchEvent("compositionstart", { data: "変換" });
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 229,
        which: 229,
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(await toolbar.getByTestId("note-card").count()).toBe(0);
  await expandPrivatePanel();
  await collapsePrivatePanel();
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

test("縮小時は次の段へ追加すると一覧がスクロールし、入力を続けられる", async () => {
  await open("additional-writing-empty");
  const toolbar = page.getByTestId("private-notes-toolbar");
  const scroll = toolbar.getByTestId("private-notes-scroll");
  const cards = scroll.getByTestId("note-card");
  const header = toolbar.getByTestId("private-notes-header");
  const composer = header.getByRole("textbox", { name: "付箋を書く" });
  await composer.click();
  const headerTop = (await header.boundingBox())?.y;
  const getScrollTop = () => scroll.evaluate((list) => list.scrollTop);

  const nextDraft = "連続追加 7";
  for (let count = 1; count <= 11; count += 1) {
    const before = await getScrollTop();
    const content = `連続追加 ${count}`;
    if (count !== 7) await composer.fill(content);
    await composer.press("Enter");
    await expect.poll(() => cards.count()).toBe(count);
    if (count === 6) await page.keyboard.insertText(nextDraft);

    const card = cards.last();
    expect(await card.locator("textarea").inputValue()).toBe(content);
    await expect
      .poll(() =>
        card.evaluate((note) => {
          const viewport = note.closest('[data-testid="private-notes-scroll"]');
          if (!viewport || note.getAnimations().length > 0) return false;
          const bounds = note.getBoundingClientRect();
          const clipTop =
            viewport.getBoundingClientRect().top + viewport.clientTop;
          return (
            bounds.top >= clipTop - 1 &&
            bounds.bottom <= clipTop + viewport.clientHeight + 1
          );
        }),
      )
      .toBe(true);
    const after = await getScrollTop();
    if (count === 6 || count === 11) expect(after).toBeGreaterThan(before);
    else expect(after).toBe(before);
    expect(await composer.inputValue()).toBe(count === 6 ? nextDraft : "");
    expect(
      await composer.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect((await header.boundingBox())?.y).toBe(headerTop);
  }
});

test("次の段へ移動中に広げると、縮小時の付箋アニメーションを終了する", async () => {
  await open("additional-writing-empty");
  const toolbar = page.getByTestId("private-notes-toolbar");
  const cards = toolbar.getByTestId("note-card");
  const composer = toolbar.getByRole("textbox", { name: "付箋を書く" });
  await toolbar.evaluate((element) => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this === element.querySelectorAll('[data-testid="note-card"]')[5]) {
        animation.pause();
        queueMicrotask(() =>
          element
            .querySelector<HTMLButtonElement>(
              'button[aria-expanded="false"][aria-controls]',
            )
            ?.click(),
        );
      }
      return animation;
    };
  });
  for (let count = 1; count <= 6; count += 1) {
    await composer.fill(`下書き ${count}`);
    await composer.press("Enter");
    await expect.poll(() => cards.count()).toBe(count);
  }
  await expect.poll(() => toolbar.getAttribute("data-expanded")).toBe("true");
  const card = cards.last();
  expect(await card.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
  expect(await card.locator("textarea").inputValue()).toBe("下書き 6");
  expect(
    await composer.evaluate((input) => input === document.activeElement),
  ).toBe(true);
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

test("問いのヒントで選んだ本文を追加執筆へ渡し、縮小状態と元の下書きを保つ", async () => {
  await open("additional-writing-question");
  const character = await page.getByTestId("hmw-hint-character").boundingBox();
  const panel = await page.getByTestId("private-notes-toolbar").boundingBox();
  expect(character && panel && character.y + character.height < panel.y).toBe(
    true,
  );
  await page.getByTestId("room-timer").click();
  await expect
    .poll(() => page.getByTestId("room-timer").getAttribute("data-status"))
    .toBe("running");
  const toolbar = page.getByTestId("private-notes-toolbar");
  const draftNote = toolbar.locator('[data-note-id="additional-draft-9"]');
  const draft = draftNote.locator("textarea");
  const original = await draft.inputValue();
  await page.getByRole("button", { name: "問いのヒントを開く" }).click();
  const dialog = page.getByRole("dialog", { name: "問いのヒント" });
  const word = dialog.getByRole("button", { name: "先回り", exact: true });
  const bounds = await word.boundingBox();
  if (!bounds) throw new Error("ヒントのワードをクリックできません");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await word.click();
  const question = await dialog
    .getByRole("region", { name: "問いの文例" })
    .textContent();
  await dialog.getByRole("button", { name: "この問いにする" }).click();
  const editor = toolbar
    .getByTestId("private-notes-list")
    .locator("textarea:not([readonly])");
  await expect.poll(() => editor.inputValue()).toBe(question);
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
  expect(await draft.inputValue()).toBe(original);
});

test("共有から縮小で戻り、右端のボタンで開閉しても入力とカメラ位置を保つ", async () => {
  await open("additional-writing-from-sharing");
  const nextStep = page.getByRole("button", {
    name: "次のステップへ",
    exact: true,
  });
  const addWriting = page.getByRole("button", {
    name: /^\d-1に戻って書き足す$/,
  });
  await nextStep.waitFor({ state: "visible" });
  expect(
    await page
      .getByTestId("board-control-hud")
      .getByRole("button", {
        name: /^\d-1に戻って書き足す$/,
      })
      .isVisible(),
  ).toBe(true);
  expect(await page.getByTestId("timer-floating").count()).toBe(0);
  expect(await nextStep.textContent()).toContain("次のステップへ");
  expect(
    await page.getByRole("button", { name: "次の人へ", exact: true }).count(),
  ).toBe(0);
  await addWriting.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "手のひらツール" }).click();
  const initial = await viewTransform();
  await page
    .getByRole("button", { name: "キャンバスを拡大", exact: true })
    .click();
  await expect.poll(viewTransform).not.toBe(initial);
  const before = await viewTransform();
  await page.getByRole("button", { name: /^\d-1に戻って書き足す$/ }).click();
  await page
    .getByRole("alertdialog", {
      name: "全員で1-1に戻って、付箋を書き足しますか？",
    })
    .getByRole("button", { name: /^\d-1に戻って書き足す$/ })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("private-notes-toolbar").getAttribute("data-expanded"),
    )
    .toBe("false");
  await waitForPanelTransition();
  expect(await viewTransform()).toBe(before);
  const toolbar = page.getByTestId("private-notes-toolbar");
  const header = toolbar.getByTestId("private-notes-header");
  const composer = header.getByRole("textbox", { name: "付箋を書く" });
  const expand = header.getByRole("button", { name: "広げる", exact: true });
  expect(await header.getByText("マイ付箋", { exact: true }).isVisible()).toBe(
    false,
  );
  expect(
    await header.getByText("自分だけに表示", { exact: true }).isVisible(),
  ).toBe(false);
  expect(await header.getByText(/Enterで追加/).isVisible()).toBe(false);
  const input = await composer.boundingBox();
  const toggle = await expand.boundingBox();
  if (!input || !toggle)
    throw new Error("縮小時の入力欄またはボタンがありません");
  expect(input.y).toBeLessThan(toggle.y + toggle.height);
  expect(toggle.y).toBeLessThan(input.y + input.height);
  expect(input.x + input.width).toBeLessThan(toggle.x);

  const draft = "共有を見ながら書き足す";
  await composer.fill(draft);
  await composer.evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(2, 5),
  );
  await expand.click();
  await waitForPanelTransition();
  expect(await toolbar.getAttribute("data-expanded")).toBe("true");
  expect(await header.getByText(/Enterで追加/).isVisible()).toBe(true);
  const collapse = header.getByRole("button", { name: "縮める", exact: true });
  await collapse.click();
  await waitForPanelTransition();
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
  expect(await composer.inputValue()).toBe(draft);
  expect(
    await composer.evaluate((element: HTMLTextAreaElement) => [
      document.activeElement === element,
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([true, 2, 5]);

  const cards = toolbar.getByTestId("note-card");
  const count = await cards.count();
  await composer.press("Enter");
  await expect.poll(() => cards.count()).toBe(count + 1);
  expect(await cards.last().locator("textarea").inputValue()).toBe(draft);
  expect(await composer.inputValue()).toBe("");
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
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
    await second.getByTestId("private-notes-toolbar").waitFor();
    await expandPrivatePanel();
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
  await page.getByRole("button", { name: /^\d-1に戻って書き足す$/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^\d-1に戻って書き足す$/ })
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
  await expandPrivatePanel();
  const note = page
    .getByTestId("private-notes-toolbar")
    .locator("[data-testid='note-card']")
    .last();
  const surface = note.getByRole("button", { name: "付箋", exact: true });
  await surface.press("Enter");
  await surface.press("Enter");
  const editor = note.locator("textarea:not([readonly])");
  await editor.fill("下の行の入力を継続する");
  await collapsePrivatePanel();
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
