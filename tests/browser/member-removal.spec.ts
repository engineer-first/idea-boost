import { mkdir } from "node:fs/promises";
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
  await mkdir("test-results/board-layout", { recursive: true });
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});
async function open(mode = "success", lobby = false) {
  await page.goto(
    `${origin}/iframe.html?id=room-${lobby ? "hosttransferflow" : "activehosttransferflow"}--${mode}&viewMode=story`,
  );
  await page
    .getByRole("button", { name: "Hana Sato", exact: true })
    .waitFor({ state: lobby ? "visible" : "hidden" });
  if (!lobby) await page.getByTestId("room-timer").getByText("02:18").waitFor();
}
async function select(lobby = false) {
  if (!lobby)
    await page
      .getByRole("button", { name: /参加者 2人|発表者と全体の順番を確認/ })
      .click();
  await page
    .getByRole("button", { name: "Hana Sato", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "ルームから外す…" }).click();
  await page
    .getByRole("alertdialog", { name: "この参加者をルームから外しますか？" })
    .waitFor();
}
test.each([
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 720 },
])("$name: 確認は画面内に収まり取消で参加者入口へ戻る、確定時だけ一覧から除く", async (viewport) => {
  await page.setViewportSize(viewport);
  await open();
  await select();
  const box = await page.getByRole("alertdialog").boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewport.height,
  );
  await page.screenshot({
    path: `test-results/board-layout/441-confirm-${viewport.name}.png`,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "参加者 2人" })
        .evaluate((node) => node === document.activeElement),
    )
    .toBe(true);
  await select();
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "参加者 1人" }).click();
  expect(await page.getByText("Hana Sato", { exact: true }).count()).toBe(0);
  expect(await page.getByTestId("room-timer").innerText()).toContain("02:18");
});
test("ロビーでも確認・拒否・再試行を通して退出できる", async () => {
  await open("refused", true);
  await select(true);
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  expect(
    await page.getByRole("button", { name: "Hana Sato", exact: true }).count(),
  ).toBe(0);
});
test("処理中は二重操作できずtimeout後に再試行できる", async () => {
  await open("timeout");
  await select();
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  expect(
    await page.getByRole("button", { name: "退出処理中…" }).isDisabled(),
  ).toBe(true);
  expect(
    await page
      .getByRole("button", { name: "キャンセル", exact: true })
      .isDisabled(),
  ).toBe(true);
  await page.getByRole("alert").waitFor({ timeout: 8000 });
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
});
test("共有中と非ホストでも操作条件を保つ", async () => {
  await open("phase-1-step-2");
  await select();
  await page
    .getByRole("button", { name: "ルームから外す", exact: true })
    .click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await open("participant");
  await page.getByRole("button", { name: "参加者 2人" }).click();
  expect(
    await page.getByRole("button", { name: "ルームから外す…" }).count(),
  ).toBe(0);
  expect(
    await page
      .getByRole("button", { name: "Yuki Tanaka", exact: true })
      .count(),
  ).toBe(0);
});
test("390pxの長い名前でも確定・取消へ到達できる", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-memberremovedialog--long-name&viewMode=story`,
  );
  await page.getByRole("alertdialog").waitFor();
  const confirm = page.getByRole("button", {
    name: "ルームから外す",
    exact: true,
  });
  await confirm.scrollIntoViewIfNeeded();
  expect(await confirm.isVisible()).toBe(true);
  await page.screenshot({
    path: "test-results/board-layout/441-long-name-mobile.png",
  });
});
