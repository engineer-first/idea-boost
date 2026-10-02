import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { completedRoomFixture } from "../../contracts/completed-rooms.fixture";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";

it.each([390, 1280])(
  "ホーム履歴の開閉・再試行・ページングと入力を%ipxで保持する",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      let attempt = 0;
      let releaseInitial!: () => void;
      const initial = new Promise<void>((resolve) => {
        releaseInitial = resolve;
      });
      await page.route("**/api/completed-rooms*", async (route) => {
        attempt++;
        if (attempt === 1) {
          await initial;
          await route.fulfill({ status: 503, json: {} });
        } else if (attempt === 2) {
          await route.fulfill({ json: { rooms: [], nextCursor: "page-2" } });
        } else if (attempt === 3) {
          expect(
            new URL(route.request().url()).searchParams.get("cursor"),
          ).toBe("page-2");
          await route.fulfill({
            json: { rooms: [completedRoomFixture()], nextCursor: null },
          });
        } else {
          // サーバーが期限切れのルームを返さなくなった更新結果を表示する。
          await route.fulfill({ json: { rooms: [], nextCursor: null } });
        }
      });
      await page.goto(
        `${origin}/iframe.html?id=home-homeview--default&viewMode=story`,
      );
      const name = page.getByRole("textbox", { name: "ルーム名（任意）" });
      const code = page.getByRole("textbox", { name: "招待コード" });
      await name.fill("授業の相談");
      await code.fill("ABC123");
      const summary = page
        .locator("summary")
        .filter({ hasText: "以前のルーム" });
      await summary.scrollIntoViewIfNeeded();
      await mkdir(output, { recursive: true });
      await page.screenshot({
        path: `${output}/home-history-${width}-closed.png`,
      });
      const url = page.url();
      await summary.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("status").waitFor();
      expect(
        await summary.evaluate((el) => el.parentElement?.hasAttribute("open")),
      ).toBe(true);
      expect(
        await summary.evaluate((el) => el === document.activeElement),
      ).toBe(true);
      expect(page.url()).toBe(url);
      expect(
        await page
          .getByRole("button", { name: "最新の一覧を取得" })
          .isDisabled(),
      ).toBe(true);
      releaseInitial();
      await page.getByRole("alert").waitFor();
      await page.getByRole("button", { name: "再取得", exact: true }).click();
      const more = page.getByRole("button", { name: "次のルームを表示" });
      await more.waitFor();
      expect(
        await page.getByText("以前のルームはまだありません。").count(),
      ).toBe(0);
      await more.click();
      // 閉じた details 内も検査するため、accessibility tree ではなく DOM を参照する。
      const outcome = page.locator(
        `a[href="/completed-rooms/${completedRoomFixture().roomId}"]`,
      );
      await outcome.waitFor();
      expect(await outcome.getAttribute("href")).toBe(
        `/completed-rooms/${completedRoomFixture().roomId}`,
      );
      expect(await page.getByRole("link", { name: "ホームへ" }).count()).toBe(
        0,
      );
      expect(await page.getByRole("main").count()).toBe(0);
      await summary.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/home-history-${width}-open.png`,
      });
      for (let index = 0; index < 3; index++) {
        await summary.focus();
        await page.keyboard.press("Space");
        expect(
          await summary.evaluate((el) =>
            el.parentElement?.hasAttribute("open"),
          ),
        ).toBe(false);
        expect(await outcome.isVisible()).toBe(false);
        expect(
          await summary.evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("Tab");
        expect(
          await outcome.evaluate((el) => el === document.activeElement),
        ).toBe(false);
        await summary.focus();
        await page.keyboard.press("Enter");
        expect(await outcome.isVisible()).toBe(true);
        expect(await name.inputValue()).toBe("授業の相談");
        expect(await code.inputValue()).toBe("ABC123");
        expect(
          await page
            .getByRole("button", { name: "参加する", exact: true })
            .isEnabled(),
        ).toBe(true);
      }
      expect(attempt).toBe(3);
      await page.getByRole("button", { name: "最新の一覧を取得" }).click();
      await page.getByText("以前のルームはまだありません。").waitFor();
      expect(await outcome.count()).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // 専用画面は既存の見出し・ホーム導線を残す。
      await page.goto(
        `${origin}/iframe.html?id=completedrooms-container--default&viewMode=story`,
      );
      await page
        .getByRole("heading", { name: "以前のルーム", exact: true })
        .waitFor();
      expect(
        await page.getByRole("link", { name: "ホームへ" }).getAttribute("href"),
      ).toBe("/home");
      expect(await page.getByRole("main").count()).toBe(1);
    } finally {
      await browser.close();
    }
  },
);

it.each([390, 1280])(
  "大量・長文のホーム履歴を%ipxで最後まで読んで閉じられる",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(
        `${origin}/iframe.html?id=home-homeview--history-many-rooms&viewMode=story`,
      );
      const more = page.getByRole("button", { name: "次のルームを表示" });
      await more.waitFor();
      expect(await page.getByRole("link", { name: "成果を見る" }).count()).toBe(
        30,
      );
      await more.scrollIntoViewIfNeeded();
      const bounds = await more.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect((bounds?.y ?? 1000) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
        844,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await mkdir(output, { recursive: true });
      await page.screenshot({
        path: `${output}/home-history-${width}-many.png`,
      });
      const summary = page.locator("summary");
      await summary.scrollIntoViewIfNeeded();
      await summary.click();
      expect(await more.isVisible()).toBe(false);
      const name = page.getByRole("textbox", { name: "ルーム名（任意）" });
      await name.scrollIntoViewIfNeeded();
      await name.fill("大量の履歴を閉じた後も作成できる");
      expect(await name.inputValue()).toBe("大量の履歴を閉じた後も作成できる");
    } finally {
      await browser.close();
    }
  },
);
