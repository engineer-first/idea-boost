import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1000 },
  );
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
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
async function open(mode = "success") {
  await page.goto(
    `${origin}/iframe.html?id=room-hosttransferflow--${mode}&viewMode=story`,
  );
  await page
    .getByRole("button", { name: "ホストを引き継ぐ", exact: true })
    .waitFor();
}
async function selectTarget() {
  await page
    .getByRole("button", { name: "ホストを引き継ぐ", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "引き継ぎ先" })
    .selectOption({ label: "次の進行役" });
}
test("狭幅でも対象と権限を確認でき、取消と再操作ができる", async () => {
  await open();
  await selectTarget();
  const dialog = page.getByRole("alertdialog");
  expect(await dialog.innerText()).toContain("開始・進行・解散");
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${output}/497-transfer-confirm-mobile.png` });
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  expect(
    await page
      .getByRole("button", { name: "ホストを引き継ぐ", exact: true })
      .evaluate((node) => node === document.activeElement),
  ).toBe(true);
  await selectTarget();
  await page.getByRole("button", { name: "次の進行役さんに引き継ぐ" }).click();
  await page.getByText("ホストの開始を待機中", { exact: true }).waitFor();
  expect(await page.getByTestId("start-phase-button").count()).toBe(0);
  await page.screenshot({ path: `${output}/497-transfer-complete-mobile.png` });
});
test("拒否理由を表示し同じ画面から再試行できる", async () => {
  await open("refused");
  await selectTarget();
  await page.getByRole("button", { name: "次の進行役さんに引き継ぐ" }).click();
  await page.getByRole("alert").waitFor();
  expect(await page.getByRole("alert").innerText()).toContain(
    "相手が切断しました",
  );
  await page.getByRole("button", { name: "次の進行役さんに引き継ぐ" }).click();
  await page.getByText("ホストの開始を待機中", { exact: true }).waitFor();
});
test("移譲成功通知を受信する前に切断しても再接続snapshotで復元する", async () => {
  await open("reconnect");
  await selectTarget();
  await page.getByRole("button", { name: "次の進行役さんに引き継ぐ" }).click();
  await page
    .getByText("ホストの開始を待機中", { exact: true })
    .waitFor({ timeout: 10_000 });
  expect(await page.getByTestId("start-phase-button").count()).toBe(0);
  expect(await page.getByRole("alertdialog").count()).toBe(0);
});
test("対象退出では確認不能になり、別タブの往復移譲では古い確認を閉じる", async () => {
  await open();
  await selectTarget();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("host-transfer-preview", { detail: "recipient-left" }),
    ),
  );
  await vi.waitFor(async () =>
    expect(
      await page
        .getByRole("button", { name: "引き継ぐ", exact: true })
        .isDisabled(),
    ).toBe(true),
  );
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await open();
  await selectTarget();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("host-transfer-preview", { detail: "aba" }),
    ),
  );
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  expect(await page.getByTestId("start-phase-button").isEnabled()).toBe(true);
});
