import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test("同じStorybook iframeでstoryを切り替えてもモックを再起動せず、切替先の操作を実行できる", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(
      `${origin}/?path=/story/room-activehosttransferflow--success`,
    );
    const iframe = page.frameLocator("#storybook-preview-iframe");
    await iframe
      .getByRole("button", { name: "参加者 2人", exact: true })
      .waitFor();
    const documentId = crypto.randomUUID();
    await iframe.locator("body").evaluate((body, value) => {
      body.dataset.mswLifecycleDocument = value;
    }, documentId);

    // iframe.htmlへの再navigationではなく、managerから同じiframeのstoryを変更する。
    await page
      .locator('[data-item-id="room-activehosttransferflow--refused"]')
      .click();
    await page.waitForURL(/room-activehosttransferflow--refused/);
    await iframe
      .getByRole("button", { name: "参加者 2人", exact: true })
      .click();
    await iframe
      .getByRole("button", { name: "Hana Sato", exact: true })
      .click();
    await iframe
      .getByRole("button", { name: "Hana Satoさんをホストにする" })
      .click();
    await iframe.getByRole("alert").waitFor();
    expect(await iframe.getByRole("alert").innerText()).toContain(
      "相手が切断しました",
    );
    expect(
      await iframe.locator("body").getAttribute("data-msw-lifecycle-document"),
    ).toBe(documentId);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});
