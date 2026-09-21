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
  page = await browser.newPage({ colorScheme: "dark" });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
}

test("OSが暗色設定でも20色のボードをライト表示し通常付箋には枠を付けない", async () => {
  await openStory("room-membercolorpalette--twenty-members");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
  ).toBe("light");
  const main = page.getByRole("main");
  const darkStyles = await main.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
  }));
  await page.emulateMedia({ colorScheme: "light" });
  expect(
    await main.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      foreground: getComputedStyle(element).color,
    })),
  ).toEqual(darkStyles);
  const normal = page
    .getByTestId("member-color-1")
    .locator('[data-slot="sticky-note"]');
  expect(
    await normal.evaluate(
      (element) => getComputedStyle(element).borderTopWidth,
    ),
  ).toBe("0px");
  expect(
    await normal.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe("none");
  const selected = page
    .getByTestId("member-color-2")
    .locator('[data-slot="sticky-note"]');
  expect(
    await selected.evaluate(
      (element) => getComputedStyle(element).outlineWidth,
    ),
  ).toBe("2px");
  const decided = page
    .getByTestId("member-color-3")
    .locator('[data-slot="sticky-note"]');
  expect(
    await decided.evaluate((element) => getComputedStyle(element).outlineWidth),
  ).toBe("4px");
  const focused = page
    .getByTestId("member-color-4")
    .locator('[data-slot="sticky-note"]');
  expect(
    await focused.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("dashed");
});

test("OSが暗色設定でも投票パレットの色を切り替えない", async () => {
  await openStory("dotvote-dotvotepalette--ready");
  const subjective = page.getByRole("button", { name: /主観シール/ });
  await subjective.waitFor();
  const darkStyles = await subjective.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
  }));
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() =>
      subjective.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        foreground: getComputedStyle(element).color,
      })),
    )
    .toEqual(darkStyles);
});

test("候補外の付箋は破線と影なしで状態を示す", async () => {
  await openStory("notes-stickynote--excluded");
  const note = page.locator('[data-slot="sticky-note"]');
  expect(
    await note.evaluate((element) => ({
      border: getComputedStyle(element).borderTopStyle,
      shadow: getComputedStyle(element).boxShadow,
    })),
  ).toEqual({ border: "dashed", shadow: "none" });
});
