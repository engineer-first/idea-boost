import { type Browser, chromium, type Locator, type Page } from "playwright";
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
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function openDelayedAddition(width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(
    `${origin}/iframe.html?id=notes-privatenotestoolbar--delayed-addition&viewMode=story`,
  );
  await page.getByTestId("private-notes-toolbar").waitFor();
}

async function openShortcutAddition(
  width: number,
  platform = "Linux x86_64",
): Promise<void> {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, "platform", { value });
  }, platform);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--private-note-addition-delayed&viewMode=story`,
  );
  await page.getByTestId("private-notes-toolbar").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function editFirstPrivateNote(): Promise<Locator> {
  const noteId = await page
    .getByTestId("private-notes-toolbar")
    .locator("[data-note-id]")
    .first()
    .getAttribute("data-note-id");
  if (!noteId) throw new Error("編集するマイ付箋がありません");
  const note = privateNote(noteId);
  const surface = note.getByRole("button", { name: "付箋", exact: true });
  await surface.press("Enter");
  await surface.press("Enter");
  const editor = note.locator("textarea");
  await expect.poll(() => editor.getAttribute("readonly")).toBeNull();
  await expectFocused(editor);
  return editor;
}

function privateNote(noteId: string): Locator {
  return page
    .getByTestId("private-notes-toolbar")
    .locator(`[data-note-id=${JSON.stringify(noteId)}]`);
}

async function privateNoteIds(): Promise<string[]> {
  return page
    .getByTestId("private-notes-toolbar")
    .locator("[data-note-id]")
    .evaluateAll((cards) =>
      cards.flatMap((card) => {
        const id = card.getAttribute("data-note-id");
        return id ? [id] : [];
      }),
    );
}

async function addedPrivateNote(previousIds: string[]): Promise<Locator> {
  const addedId = (await privateNoteIds()).find(
    (id) => !previousIds.includes(id),
  );
  if (!addedId) throw new Error("追加されたマイ付箋がありません");
  return privateNote(addedId);
}

async function expectFocused(editor: Locator): Promise<void> {
  await expect
    .poll(async () => {
      if (
        (await editor.count()) > 0 &&
        (await editor.evaluate((element) => document.activeElement === element))
      )
        return "focused";
      return page.evaluate(() =>
        JSON.stringify({
          activeTag: document.activeElement?.tagName,
          activeNoteId: document.activeElement
            ?.closest("[data-note-id]")
            ?.getAttribute("data-note-id"),
          cards: Array.from(
            document.querySelectorAll(
              '[data-testid="private-notes-toolbar"] [data-note-id]',
            ),
            (card) => ({
              id: card.getAttribute("data-note-id"),
              selected: card.getAttribute("data-selected"),
              readonly: card.querySelector("textarea")?.readOnly,
            }),
          ),
        }),
      );
    })
    .toBe("focused");
}

test("1-1: タイマー未開始でも付箋を追加・日本語入力でき、背景だけをぼかす", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--private-note-addition-before-timer&viewMode=story`,
  );
  const toolbar = page.getByTestId("private-notes-toolbar");
  await toolbar.waitFor();

  const layers = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      '[data-testid="board-scroller"]',
    );
    const workspace = document.querySelector<HTMLElement>(
      '[data-testid="private-notes-workspace"]',
    );
    const header = document.querySelector<HTMLElement>(
      '[data-testid="board-control-hud"]',
    );
    if (!canvas || !workspace || !header)
      throw new Error("個人入力画面のレイヤーがありません");
    const point = workspace.getBoundingClientRect();
    const hit = document.elementFromPoint(
      point.left + point.width / 2,
      point.top + point.height / 2,
    );
    const headerBottom = [
      "board-context-hud",
      "board-control-hud",
      "board-connection-slot",
    ].reduce((bottom, testId) => {
      const element = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (
        !element ||
        element.getClientRects().length === 0 ||
        getComputedStyle(element).visibility === "hidden"
      )
        return bottom;
      return Math.max(bottom, element.getBoundingClientRect().bottom);
    }, 0);
    return {
      canvasInert: canvas.hasAttribute("inert"),
      canvasFilter: getComputedStyle(canvas).filter,
      backdropExists:
        document.querySelector(
          '[data-testid="private-workspace-canvas-backdrop"]',
        ) !== null,
      headerFilter: getComputedStyle(header).filter,
      panelTop: point.top,
      headerBottom,
      workspaceFilter: getComputedStyle(workspace).filter,
      workspaceHasInertAncestor: workspace.closest("[inert]") !== null,
      pointerHitsWorkspace:
        hit?.closest('[data-testid="private-notes-toolbar"]') !== null,
    };
  });
  expect(layers).toMatchObject({
    canvasInert: true,
    canvasFilter: "blur(4px)",
    backdropExists: true,
    headerFilter: "none",
    workspaceFilter: "none",
    workspaceHasInertAncestor: false,
    pointerHitsWorkspace: true,
  });
  // 通常の接続案内1行（38px）を予約しても、ヘッダー直下の余白に収まる。
  expect(layers.panelTop).toBeGreaterThanOrEqual(layers.headerBottom + 12);
  expect(layers.panelTop).toBeLessThanOrEqual(layers.headerBottom + 50);

  const add = page.getByRole("button", { name: "付箋を追加", exact: true });
  expect(await add.isEnabled()).toBe(true);
  const previousIds = await privateNoteIds();
  await add.click();
  await expect
    .poll(() => privateNoteIds().then((ids) => ids.length), { timeout: 5000 })
    .toBe(previousIds.length + 1);
  const addedNote = await addedPrivateNote(previousIds);
  const editor = addedNote.locator("textarea:not([readonly])");
  await expectFocused(editor);
  await page.keyboard.insertText("日本語入力の保存確認");
  expect(await editor.inputValue()).toBe("日本語入力の保存確認");
  await editor.press("Escape");
  const savedEditor = addedNote.locator("textarea");
  await expect.poll(() => savedEditor.getAttribute("readonly")).toBe("");
  await expect
    .poll(() => savedEditor.inputValue())
    .toBe("日本語入力の保存確認");
});

test.each([1440, 1280, 390])(
  "1-1: %ipxでも進め方を拡大エリアに遮られず開ける",
  async (width) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--private-note-addition-before-timer&viewMode=story`,
    );
    const guide = page.getByRole("button", { name: "進め方", exact: true });
    await guide.waitFor();

    await guide.click();

    await page
      .getByRole("dialog", { name: "最近あった困ったことを付箋に書き出そう。" })
      .waitFor();
  },
);

test("1-1: キーボードで次へ進めても遷移中と遷移後にフォーカスを保つ", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardlayout--first-visit-onboarding&viewMode=story`,
  );
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", { name: "次へ" });
  const content = dialog.getByTestId("step-one-onboarding-slide-content");
  await next.focus();
  await page.keyboard.press("Enter");
  expect(await next.isEnabled()).toBe(true);
  expect(
    await next.evaluate((element) => document.activeElement === element),
  ).toBe(true);
  await expect
    .poll(() => content.getAttribute("data-slide-transition"))
    .toBe("idle");
  expect(
    await next.evaluate((element) => document.activeElement === element),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "はじめる" }).waitFor();
  await expect
    .poll(() => content.getAttribute("data-slide-transition"))
    .toBe("idle");
  expect(
    await dialog
      .getByRole("button", { name: "はじめる" })
      .evaluate((element) => document.activeElement === element),
  ).toBe(true);
});

test.each([390, 1280])(
  "1-1: %ipxで初回スライドを完了して付箋操作へ戻り、案内を再表示できる",
  async (width) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--first-visit-onboarding&viewMode=story`,
    );
    const dialog = page.getByRole("dialog");
    const firstSlide = "最近あった困ったことを付箋に書き出そう。";
    const waitForSlide = () =>
      expect
        .poll(() =>
          dialog
            .getByTestId("step-one-onboarding-slide-content")
            .getAttribute("data-slide-transition"),
        )
        .toBe("idle");
    await page.getByRole("dialog", { name: firstSlide }).waitFor();
    await dialog.getByRole("button", { name: "次へ" }).click();
    await dialog.getByLabel("付箋を追加して書き出す操作").waitFor();
    await dialog.getByRole("button", { name: "1枚目に戻る" }).click();
    await page.getByRole("dialog", { name: firstSlide }).waitFor();
    await waitForSlide();
    await dialog.getByRole("button", { name: "次へ" }).click();
    await waitForSlide();
    await dialog.getByRole("button", { name: "次へ" }).click();
    await dialog.getByRole("button", { name: "はじめる" }).click();
    await dialog.waitFor({ state: "hidden" });
    const guide = page.getByRole("button", { name: "進め方", exact: true });
    await expect
      .poll(() =>
        guide.evaluate((element) => document.activeElement === element),
      )
      .toBe(true);

    await page
      .getByRole("button", { name: "付箋を追加", exact: true })
      .click({ trial: true });
    await guide.click();
    await page.getByRole("dialog", { name: firstSlide }).waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await expect
      .poll(() =>
        guide.evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
  },
);

test("1-1: 右上のルームメニューと招待操作が拡大パネルに隠れない", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--private-note-addition-before-timer&viewMode=story`,
  );
  await page.getByTestId("private-notes-workspace").waitFor();

  await page.getByTestId("room-menu-trigger").click();
  const inviteButton = page.getByRole("button", { name: "招待", exact: true });
  await inviteButton.click({ timeout: 2000 });
  await page.getByRole("dialog", { name: "ルームに招待" }).waitFor();
});

async function expectPrivateAreaTransition(storyId: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardlayout--${storyId}&viewMode=story`,
  );
  await page.getByTestId("private-notes-workspace").waitFor();

  const supportsViewTransitions = await page.evaluate(
    () => typeof document.startViewTransition === "function",
  );
  expect(supportsViewTransitions).toBe(true);
  await page.evaluate(() => {
    type TransitionProbe = {
      calls: number;
      areaGroupAnimations: string[];
    };
    type TransitionDocument = Document & {
      startViewTransition: (callback: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };
    const transitionDocument = document as TransitionDocument;
    const startViewTransition =
      transitionDocument.startViewTransition.bind(transitionDocument);
    const probe: TransitionProbe = { calls: 0, areaGroupAnimations: [] };
    Object.assign(window, { __privateAreaTransitionProbe: probe });
    transitionDocument.startViewTransition = (callback) => {
      const transition = startViewTransition(callback);
      probe.calls += 1;
      const startedAt = performance.now();
      const collect = () => {
        for (const animation of document.getAnimations()) {
          const pseudoElement =
            (animation.effect as KeyframeEffect | null)?.pseudoElement ?? "";
          if (
            pseudoElement.includes("view-transition-group") &&
            pseudoElement.includes("private-notes-area")
          )
            probe.areaGroupAnimations.push(pseudoElement);
        }
        if (performance.now() - startedAt < 1200)
          requestAnimationFrame(collect);
      };
      void transition.ready.then(collect);
      return transition;
    };
  });

  await page.getByRole("button", { name: "次のステップへ" }).click();
  await page.getByTestId("private-notes-dock").waitFor();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __privateAreaTransitionProbe?: {
                calls: number;
                areaGroupAnimations: string[];
              };
            }
          ).__privateAreaTransitionProbe?.calls ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __privateAreaTransitionProbe?: {
                calls: number;
                areaGroupAnimations: string[];
              };
            }
          ).__privateAreaTransitionProbe?.areaGroupAnimations.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
}

for (const { step, storyId } of [
  { step: "1-1から1-2", storyId: "phase-1-step-1-to-step-2" },
  { step: "2-1から2-2", storyId: "phase-2-step-1-to-step-2" },
  { step: "3-1から3-2", storyId: "phase-3-step-1-to-step-2" },
]) {
  test(`${step}への遷移でマイ付箋エリアのView Transitionが再生される`, async () => {
    await expectPrivateAreaTransition(storyId);
  });
}

for (const width of [390, 1440]) {
  test(`${width}px: 個人作業の追加ボタンは空の状態から追加を繰り返しても一覧の左上から動かない`, async () => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--private-guidance-empty&viewMode=story`,
    );
    const add = page.getByRole("button", { name: "付箋を追加", exact: true });
    await add.waitFor();
    await page.evaluate(() => document.fonts.ready);
    // 新規本文への自動スクロールと、一覧内の配置移動を区別する。
    const positionInList = () =>
      add.evaluate((element) => {
        const list = element.parentElement;
        if (!list) throw new Error("付箋一覧がありません");
        const buttonBounds = element.getBoundingClientRect();
        const listBounds = list.getBoundingClientRect();
        return {
          x: buttonBounds.x - listBounds.x,
          y: buttonBounds.y - listBounds.y,
        };
      });
    const initial = await positionInList();
    expect(initial.y).toBe(0);
    expect(initial.x).toBeGreaterThanOrEqual(0);
    // デスクトップでは次の行への折り返しも含める。
    const count = width === 390 ? 2 : 7;
    for (let index = 0; index < count; index += 1) {
      await add.click();
      await expect
        .poll(() => privateNoteIds().then((ids) => ids.length))
        .toBe(index + 1);
      const editor = page.locator("textarea:not([readonly])");
      await expectFocused(editor);
      await page.keyboard.insertText(`下書き ${index + 1}`);
      await page.keyboard.press("Escape");
      await expect.poll(positionInList).toEqual(initial);
    }
    // 視覚上の先頭とキーボードの順序を揃える。
    await add.focus();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement
          ?.closest("[data-note-id]")
          ?.getAttribute("data-note-id"),
      ),
    ).toBe((await privateNoteIds())[0]);
  });
}

for (const { platform, key, width } of [
  { platform: "Linux x86_64", key: "Control+Enter", width: 390 },
  { platform: "MacIntel", key: "Meta+Enter", width: 1440 },
]) {
  test(`${width}px: 本文の${key}で一枚追加し、応答後の本文へ連続して書ける`, async () => {
    await openShortcutAddition(width, platform);
    const toolbar = page.getByTestId("private-notes-toolbar");
    const cards = toolbar.locator("[data-note-id]");
    const initialIds = await privateNoteIds();
    const initialCount = initialIds.length;
    const oldEditor = await editFirstPrivateNote();
    await oldEditor.fill("保存確認を待たない文章");
    await oldEditor.press("Enter");
    await page.keyboard.insertText("通常Enterは改行");
    expect(await oldEditor.inputValue()).toBe(
      "保存確認を待たない文章\n通常Enterは改行",
    );
    await oldEditor.press(key);
    const add = page.getByRole("button", { name: "付箋を追加", exact: true });
    await expect.poll(() => add.isDisabled()).toBe(true);
    // 同じ待ち時間のキー連打と＋操作は作成予約にしない。
    await page.keyboard.press(key);
    await add.evaluate((element) => (element as HTMLButtonElement).click());
    expect(await cards.count()).toBe(initialCount);
    await expect
      .poll(() => cards.count(), { timeout: 5000 })
      .toBe(initialCount + 1);
    const newNote = await addedPrivateNote(initialIds);
    const newEditor = newNote.locator("textarea:not([readonly])");
    await newEditor.waitFor({ timeout: 5000 });
    await expectFocused(newEditor);
    expect(await oldEditor.inputValue()).toBe(
      "保存確認を待たない文章\n通常Enterは改行",
    );
    await page.keyboard.insertText("次の文章");
    expect(await newEditor.inputValue()).toBe("次の文章");
    const idsBeforeSecondAdd = await privateNoteIds();
    await newEditor.press(key);
    await expect
      .poll(() => cards.count(), { timeout: 5000 })
      .toBe(initialCount + 2);
    const secondAddedNote = await addedPrivateNote(idsBeforeSecondAdd);
    await expectFocused(secondAddedNote.locator("textarea:not([readonly])"));
  });
}

test("本文から追加した後に再入力すると、応答が来ても元の本文とフォーカスを維持する", async () => {
  await openShortcutAddition(390);
  const toolbar = page.getByTestId("private-notes-toolbar");
  const cards = toolbar.locator("[data-note-id]");
  const initialIds = await privateNoteIds();
  const initialCount = initialIds.length;
  const editor = await editFirstPrivateNote();
  await editor.fill("入力中の本文");
  await editor.press("Control+Enter");
  await page.keyboard.insertText("を続ける");
  const scrollBefore = await page
    .getByTestId("private-notes-scroll")
    .evaluate((element) => element.scrollTop);
  await expect
    .poll(() => cards.count(), { timeout: 5000 })
    .toBe(initialCount + 1);
  await expectFocused(editor);
  await page.keyboard.insertText("。さらに入力");
  expect(await editor.inputValue()).toBe("入力中の本文を続ける。さらに入力");
  const insertedNote = await addedPrivateNote(initialIds);
  expect(
    await insertedNote.locator("textarea").getAttribute("readonly"),
  ).not.toBeNull();
  expect(
    await page
      .getByTestId("private-notes-scroll")
      .evaluate((element) => element.scrollTop),
  ).toBe(scrollBefore);
});

test("マイ付箋表面のCtrl+Enterは一枚だけ追加し、入力画面を保つ", async () => {
  await openShortcutAddition(1440);
  const toolbar = page.getByTestId("private-notes-toolbar");
  const cards = toolbar.locator("[data-note-id]");
  const initialCount = await cards.count();
  await cards
    .first()
    .getByRole("button", { name: "付箋", exact: true })
    .press("Control+Enter");
  await expect
    .poll(() => cards.count(), { timeout: 5000 })
    .toBe(initialCount + 1);
  expect(await toolbar.getAttribute("data-presentation")).toBe("workspace");
  expect(await toolbar.getAttribute("data-expanded")).toBe("true");
  expect(
    await page.getByRole("button", { name: "マイ付箋を閉じる" }).count(),
  ).toBe(0);
});

test("Shift・Alt・キーリピート・別OSの修飾キーは追加せず、追加ボタンのCtrl+Enterで一枚追加する", async () => {
  await openShortcutAddition(1440);
  const cards = page
    .getByTestId("private-notes-toolbar")
    .locator("[data-note-id]");
  const initialCount = await cards.count();
  const editor = await editFirstPrivateNote();
  await editor.fill("そのまま保持する本文");
  for (const key of [
    "Control+Shift+Enter",
    "Control+Alt+Enter",
    "Meta+Enter",
  ]) {
    await editor.press(key);
  }
  await editor.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    ctrlKey: true,
    repeat: true,
    bubbles: true,
  });
  expect(await cards.count()).toBe(initialCount);
  expect(
    await page
      .getByRole("button", { name: "付箋を追加", exact: true })
      .isDisabled(),
  ).toBe(false);
  const add = page.getByRole("button", { name: "付箋を追加", exact: true });
  await add.focus();
  await page.keyboard.press("Control+Enter");
  await expect
    .poll(() => cards.count(), { timeout: 5000 })
    .toBe(initialCount + 1);
  expect(
    await page
      .getByTestId("private-notes-toolbar")
      .getAttribute("data-expanded"),
  ).toBe("true");
});

for (const width of [390, 1440]) {
  test(`追加応答を待つ間の既存下書きの入力・選択・スクロールを維持する (${width}px)`, async () => {
    await openDelayedAddition(width);
    const oldNote = page.locator('[data-note-id="single-note"]');
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await oldNote
      .getByRole("button", { name: "付箋", exact: true })
      .press("Enter");
    expect(await oldNote.getAttribute("data-selected")).toBe("true");
    await oldNote
      .getByRole("button", { name: "付箋", exact: true })
      .press("Enter");
    const editor = oldNote.locator("textarea");
    await editor.fill("入力中の下書き");
    const scrollBefore = await page
      .getByTestId("private-notes-scroll")
      .evaluate((element) => element.scrollTop);
    await page.locator('[data-note-id="delayed-new-note"]').waitFor();
    // 追加によるpassive effectが済んだ後も、次のキー入力が既存本文へ届く。
    await page.waitForTimeout(250);
    expect(
      await editor.evaluate((element) => document.activeElement === element),
    ).toBe(true);
    await page.keyboard.type(" + continued");
    expect(await editor.inputValue()).toBe("入力中の下書き + continued");
    expect(
      await page
        .getByTestId("private-notes-scroll")
        .evaluate((element) => element.scrollTop),
    ).toBe(scrollBefore);
    expect(
      await page
        .locator('[data-note-id="delayed-new-note"] textarea')
        .getAttribute("readonly"),
    ).not.toBeNull();
  });

  test(`既存の入力に戻らなければ新しい付箋ですぐ入力できる (${width}px)`, async () => {
    await openDelayedAddition(width);
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    const editor = page.locator(
      '[data-note-id="delayed-new-note"] textarea:not([readonly])',
    );
    await editor.waitFor();
    expect(
      await editor.evaluate((element) => document.activeElement === element),
    ).toBe(true);
    await page.keyboard.type("new draft");
    expect(await editor.inputValue()).toBe("new draft");
  });
}
