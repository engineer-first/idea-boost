import { chromium } from "playwright";
import { beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
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
