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
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

test.each([390, 1440])(
  "%ipxで続き取得の失敗を一覧末尾からキーボードで再試行できる",
  async (width) => {
    await page.setViewportSize({ width, height: 900 });
    const cursors: Array<string | null> = [];
    let failed = true;
    const record = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      target: "app",
      kind: "difficult",
      body: "長い意見の全文を確認します。".repeat(100),
      rating: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    };
    await page.route("**/api/feedback*", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      cursors.push(cursor);
      await route.fulfill({
        status: cursor && failed ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          cursor && failed
            ? {}
            : {
                items: cursor
                  ? [
                      record,
                      {
                        ...record,
                        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                        body: "続きの意見",
                      },
                    ]
                  : [record],
                nextCursor: cursor ? null : "next",
                canReadOutcomes: false,
              },
        ),
      });
    });
    await page.goto(
      `${origin}/iframe.html?id=feedback-feedbacklist--connected&viewMode=story`,
    );
    const more = page.getByRole("button", { name: "さらに表示" });
    await more.click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect(await page.locator("main li").count()).toBe(1);
    expect(await page.getByText("条件に合う意見はありません。").count()).toBe(
      0,
    );
    expect(await alert.boundingBox().then((box) => box?.y)).toBeGreaterThan(
      await page
        .locator("main ul")
        .boundingBox()
        .then((box) => (box ? box.y + box.height : 0)),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const retry = page.getByRole("button", { name: "再試行" });
    await retry.focus();
    failed = false;
    await page.keyboard.press("Enter");
    await page.getByText("続きの意見", { exact: true }).waitFor();
    expect(cursors).toEqual([null, "next", "next"]);
    expect(await page.locator("main li").count()).toBe(2);
  },
);
