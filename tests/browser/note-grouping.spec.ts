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
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function open(story: string): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=notes-notegroupcard--${story}&viewMode=story`,
  );
  await page.getByTestId("note-group-card").waitFor();
}

test.each([
  1280, 390,
])("%ipx: pointerで開始し、50文字を確定・keyboard全文確認・Escape取消後に入口へ戻る", async (width) => {
  await page.setViewportSize({ width, height: 844 });
  await open("narrow-interactive");
  const entry = page.getByRole("button", { name: "課題グループ", exact: true });
  const bounds = await entry.boundingBox();
  if (!bounds) throw new Error("命名入口がありません");
  expect(
    await entry.evaluate(
      (e) =>
        document
          .elementFromPoint(
            e.getBoundingClientRect().x + 10,
            e.getBoundingClientRect().y + 10,
          )
          ?.closest("button") === e,
    ),
  ).toBe(true);
  await page.mouse.click(bounds.x + 10, bounds.y + 10);
  const input = page.getByRole("textbox", { name: "グループ名" });
  const long = "あ".repeat(50);
  await input.fill(`${long}超過`);
  expect(await input.inputValue()).toBe(long);
  await page.keyboard.press("Enter");
  const named = page.getByRole("button", { name: long, exact: true });
  await named.waitFor();
  expect(await named.evaluate((e) => document.activeElement === e)).toBe(true);
  await page.getByRole("tooltip").waitFor();
  expect(await page.getByRole("tooltip").innerText()).toContain(long);
  const tooltip = await page
    .locator('[data-slot="tooltip-content"]')
    .boundingBox();
  expect(tooltip?.x).toBeGreaterThanOrEqual(0);
  expect((tooltip?.x ?? 0) + (tooltip?.width ?? 0)).toBeLessThanOrEqual(width);
  await page.keyboard.press("Enter");
  await input.fill("破棄する名前");
  await page.keyboard.press("Escape");
  expect(await named.evaluate((e) => document.activeElement === e)).toBe(true);
  expect(await page.getByRole("textbox").count()).toBe(0);
});

test("別参加者の改名を受信したら未送信の案を残して競合を伝える", async () => {
  await open("concurrent-rename");
  await page.getByRole("button", { name: "課題グループ", exact: true }).click();
  const input = page.getByRole("textbox", { name: "グループ名" });
  const before = await input.boundingBox();
  await input.fill("自分の未送信案");
  await page.getByRole("button", { name: "別参加者の改名を受信" }).click();
  await page.keyboard.press("Enter");
  await page.getByRole("alert").waitFor();
  const after = await input.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.y).toBeGreaterThanOrEqual(0);
  expect(
    await page.getByRole("textbox", { name: "グループ名" }).inputValue(),
  ).toBe("自分の未送信案");
  await page.keyboard.press("Escape");
  const latest = page.getByRole("button", {
    name: "別参加者が共有した名前",
    exact: true,
  });
  await latest.waitFor();
  expect(await latest.evaluate((e) => document.activeElement === e)).toBe(true);
});

test("応答が来なくても入力を保持し、未確認を示して回収できる", async () => {
  await open("unconfirmed-rename");
  await page.getByRole("button", { name: "課題グループ", exact: true }).click();
  const input = page.getByRole("textbox", { name: "グループ名" });
  await input.fill("未確定の名前");
  await page.keyboard.press("Enter");
  expect(await input.inputValue()).toBe("未確定の名前");
  expect(await page.getByRole("status").innerText()).toContain("確認中");
  await page
    .getByRole("status")
    .filter({ hasText: "確認できません" })
    .waitFor();
  expect(await input.inputValue()).toBe("未確定の名前");
  await input.selectText();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "課題グループ", exact: true })
    .waitFor();
});

test("2秒の受理待ち後に確定名を受信して編集を終える", async () => {
  await open("delayed-rename");
  await page.getByRole("button", { name: "課題グループ", exact: true }).click();
  const input = page.getByRole("textbox", { name: "グループ名" });
  await input.fill("遅延後の確定名");
  await page.keyboard.press("Enter");
  expect(await input.inputValue()).toBe("遅延後の確定名");
  expect(await page.getByRole("status").innerText()).toContain("確認中");
  await page
    .getByRole("button", { name: "遅延後の確定名", exact: true })
    .waitFor();
  expect(await page.getByRole("textbox").count()).toBe(0);
});
