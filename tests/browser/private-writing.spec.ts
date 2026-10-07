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

test("マイ付箋表面のCtrl+Enterは一枚だけ追加し、閉じたパネルは背景からの追加で開く", async () => {
  await openShortcutAddition(1440);
  const toolbar = page.getByTestId("private-notes-toolbar");
  const cards = toolbar.locator("[data-note-id]");
  const initialIds = await privateNoteIds();
  const initialCount = initialIds.length;
  await cards
    .first()
    .getByRole("button", { name: "付箋", exact: true })
    .press("Control+Enter");
  await expect
    .poll(() => cards.count(), { timeout: 5000 })
    .toBe(initialCount + 1);
  const firstAddedNote = await addedPrivateNote(initialIds);
  await expectFocused(firstAddedNote.locator("textarea:not([readonly])"));
  await page.getByRole("button", { name: "マイ付箋を閉じる" }).click();
  expect(await toolbar.getAttribute("data-expanded")).toBe("false");
  const background = page.getByTestId("board-scroller");
  await background.focus();
  const idsBeforeBackgroundAdd = await privateNoteIds();
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => toolbar.getAttribute("data-expanded")).toBe("true");
  await expect
    .poll(() => cards.count(), { timeout: 5000 })
    .toBe(initialCount + 2);
  const backgroundAddedNote = await addedPrivateNote(idsBeforeBackgroundAdd);
  await expectFocused(backgroundAddedNote.locator("textarea:not([readonly])"));
});

test("Shift・Alt・キーリピート・別OSの修飾キーとネイティブボタンは追加ショートカットを実行しない", async () => {
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
  const close = page.getByRole("button", { name: "マイ付箋を閉じる" });
  await close.focus();
  await expectFocused(close);
  await page.keyboard.press("Control+Enter");
  expect(await cards.count()).toBe(initialCount);
  expect(
    await page
      .getByTestId("private-notes-toolbar")
      .getAttribute("data-expanded"),
  ).toBe("true");
  // 通常Enterはネイティブbuttonの既定操作に任せ、追加と二重処理しない。
  await page.keyboard.press("Enter");
  expect(
    await page
      .getByTestId("private-notes-toolbar")
      .getAttribute("data-expanded"),
  ).toBe("false");
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
