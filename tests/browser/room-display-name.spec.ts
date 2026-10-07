import { chromium } from "playwright";
import { beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
test.each([
  { width: 390, connectionDelayMs: 0 },
  { width: 1280, connectionDelayMs: 0 },
  { width: 390, connectionDelayMs: 1500 },
  { width: 1280, connectionDelayMs: 1500 },
])("$width px / 接続遅延 $connectionDelayMs ms: 一覧に隠れた本人の編集を取消・保存した後に展開ボタンへ戻る", async ({
  width,
  connectionDelayMs,
}) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(
      `${origin}/iframe.html?id=room-hosttransferflow--overflow-self&viewMode=story&args=connectionDelayMs:${connectionDelayMs}`,
    );
    const overflow = page.getByRole("button", { name: "他 2 名" });
    for (const save of [false, true]) {
      await overflow.press("Enter");
      const trigger = page.getByRole("button", {
        name: "Yuki Tanaka：呼び名を変更",
      });
      // press は disabled の解除を待たないため、接続・同期後に操作する。
      await trigger.waitFor();
      await vi.waitFor(async () =>
        expect(await trigger.isEnabled()).toBe(true),
      );
      await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: "このルームでの呼び名" });
      await dialog.waitFor();
      // 閉じるアニメーション中の一覧も Escape を受け取るため、解除後に編集する。
      await page.getByTestId("room-members-overflow-dialog").waitFor({
        state: "detached",
      });
      const input = page.getByRole("textbox", { name: "呼び名" });
      await vi.waitFor(async () =>
        expect(await input.evaluate((e) => e === document.activeElement)).toBe(
          true,
        ),
      );
      if (save) {
        await input.fill("一覧の本人");
        await input.press("Enter");
      } else await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await vi.waitFor(async () =>
        expect(
          await overflow.evaluate((e) => e === document.activeElement),
        ).toBe(true),
      );
    }
  } finally {
    await browser.close();
  }
});
beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90000, interval: 1000 },
  );
});
test.each([
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
])("$width px: 本人表示からキーボードで編集・取消・保存し同名の対象を色で区別する", async (viewport) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(
      `${origin}/iframe.html?id=room-hosttransferflow--success&viewMode=story`,
    );
    const trigger = page.getByRole("button", {
      name: "Yuki Tanaka：呼び名を変更",
    });
    await trigger.waitFor();
    await vi.waitFor(async () => expect(await trigger.isEnabled()).toBe(true));
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog", { name: "このルームでの呼び名" });
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    );
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await vi.waitFor(async () =>
      expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(
        true,
      ),
    );
    await trigger.press("Enter");
    const input = page.getByRole("textbox", { name: "呼び名" });
    await input.fill("　 ");
    await input.press("Enter");
    await page.getByRole("alert").waitFor();
    await input.fill("あ".repeat(41));
    await input.press("Enter");
    expect(await page.getByRole("alert").innerText()).toContain("40");
    await input.fill("Hana Sato");
    await input.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Hana Sato：呼び名を変更" })
      .waitFor();
    await page.getByRole("button", { name: "Hana Sato", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.waitFor();
    expect(await confirm.innerText()).toContain("識別色: 青色");
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  } finally {
    await browser.close();
  }
});
