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
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

async function expectReachable(target: Locator): Promise<void> {
  expect(
    await target.evaluate((element) => {
      return Array.from(element.getClientRects()).some(
        (box) =>
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= window.innerHeight &&
          box.right <= window.innerWidth &&
          element.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          ),
      );
    }),
  ).toBe(true);
}

for (const height of [844, 600]) {
  for (const role of ["host", "guest"]) {
    test(`390×${height} ${role}: 見出しを読み、ホイールで開始・退出・プライバシーへ到達する`, async () => {
      await page.setViewportSize({ width: 390, height });
      await page.goto(
        `${origin}/iframe.html?id=room-roomlobbyview--${role}-six&viewMode=story`,
      );
      await page.getByTestId("room-lobby-view").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await expectReachable(page.getByRole("heading", { level: 1 }));
      const privacy = page.getByRole("link", { name: /保存とプライバシー/ });
      await expectReachable(privacy);
      expect(await privacy.getAttribute("target")).toBe("_blank");
      await page.mouse.move(195, height / 2);
      await page.mouse.wheel(0, 2400);
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="leave-button"]');
        return (
          button && button.getBoundingClientRect().bottom <= window.innerHeight
        );
      });
      await expectReachable(page.getByTestId("leave-button"));
      if (role === "host") {
        await expectReachable(page.getByTestId("start-phase-button"));
        await page.getByTestId("start-phase-button").click({ trial: true });
      } else {
        expect(await page.getByTestId("start-phase-button").count()).toBe(0);
      }
      await page.getByTestId("leave-button").click();
      await page.getByRole("alertdialog").waitFor();
      await page
        .getByRole("button", { name: "キャンセル" })
        .click({ trial: true });
      await expectReachable(page.getByRole("button", { name: "キャンセル" }));
      await page.getByRole("button", { name: "キャンセル" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    });
  }
}

for (const role of ["host", "guest"]) {
  test(`390px ${role}: 20人の長い名前でも横にはみ出さず、省略一覧で本人・ホストを確認できる`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomlobbyview--${role}-many-long-names&viewMode=story`,
    );
    const lobby = page.getByTestId("room-lobby-view");
    await lobby.waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await lobby.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const overflow = page.getByRole("button", { name: "他 9 名" });
    await overflow.scrollIntoViewIfNeeded();
    await expectReachable(overflow);
    await overflow.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const lastName = dialog.getByText(
      "とても長い表示名の参加者・プロジェクトチームメンバー20",
      { exact: true },
    );
    await lastName.scrollIntoViewIfNeeded();
    await expectReachable(lastName);
    if (role === "guest") {
      expect(await lastName.locator("..").innerText()).toContain("あなた");
      expect(
        await dialog
          .getByText("とても長い表示名の参加者・プロジェクトチームメンバー19", {
            exact: true,
          })
          .locator("..")
          .innerText(),
      ).toContain("ホスト");
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    expect(
      await overflow.evaluate((element) => element === document.activeElement),
    ).toBe(true);
  });
}
