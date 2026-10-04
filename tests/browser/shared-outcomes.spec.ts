import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";
import { buildSharedOutcome } from "../../contracts/shared-outcomes.fixture";

const storybook = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const app = process.env.SHARED_OUTCOMES_APP_TEST_URL;
const evidence =
  process.env.SHARED_OUTCOMES_EVIDENCE_DIR ?? "test-results/shared-outcomes";
async function login(page: Page): Promise<void> {
  await page.goto(`${app}/login?next=%2Fshared-outcomes`);
  await page.getByLabel("メールアドレス").fill("owner@example.test");
  await page.getByLabel("パスワード").fill("password");
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
  await page.waitForURL(`${app}/shared-outcomes`);
}
test("PC・モバイルで長いルーム名と検索・絞り込みが画面内に収まる", async () => {
  const browser = await chromium.launch();
  try {
    await mkdir(evidence, { recursive: true });
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(
        `${storybook}/iframe.html?id=sharedoutcomes-sharedoutcomesview--long-name&viewMode=story`,
      );
      const search = page.getByRole("searchbox");
      await search.waitFor();
      expect(
        await page
          .locator("main")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      for (const control of [
        search,
        page.getByLabel("記録", { exact: true }),
        page.getByLabel("到達フェーズ"),
        page.getByLabel("保存状態"),
        page.getByLabel("開始日"),
        page.getByLabel("終了日"),
      ]) {
        const box = await control.boundingBox();
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect(
          (box?.x ?? viewport.width) + (box?.width ?? 0),
        ).toBeLessThanOrEqual(viewport.width);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({
        path: `${evidence}/long-name-${viewport.width}.png`,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
describe.skipIf(!app)("専用dev:verifyの共有成果", () => {
  test("追加取得・再試行・詳細・戻る・進むでも位置と取得済み一覧が保たれる", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      await login(page);
      const records = Array.from({ length: 51 }, (_, index) =>
        buildSharedOutcome({
          roomId: `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
          name: `運営の振り返り ${index + 1}`,
        }),
      );
      let failMore = true;
      await page.route("**/api/shared-outcomes**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/history"))
          return route.fulfill({ json: { entries: [], nextCursor: null } });
        if (url.pathname !== "/api/shared-outcomes")
          return route.fulfill({
            json: records.find((record) =>
              url.pathname.endsWith(record.roomId),
            ),
          });
        if (url.searchParams.has("cursor")) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          if (failMore)
            return route.fulfill({
              status: 503,
              json: { error: "unavailable" },
            });
          return route.fulfill({
            json: { outcomes: [records[50]], nextCursor: null },
          });
        }
        return route.fulfill({
          json: { outcomes: records.slice(0, 50), nextCursor: "50" },
        });
      });
      await page.reload();
      await page.getByRole("link", { name: /運営の振り返り 50 / }).waitFor();
      const more = page.getByRole("button", { name: "次の成果を表示" });
      await more.scrollIntoViewIfNeeded();
      const top = await page
        .locator("main")
        .evaluate((element) => element.scrollTop);
      await more.click();
      expect(
        await page
          .getByRole("link")
          .filter({ hasText: "運営の振り返り" })
          .count(),
      ).toBe(50);
      await page.getByRole("button", { name: "再試行", exact: true }).waitFor();
      expect(
        await page.locator("main").evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(top - 50);
      failMore = false;
      await page.getByRole("button", { name: "再試行", exact: true }).click();
      const last = page.getByRole("link", { name: /運営の振り返り 51 / });
      await last.waitFor();
      await last.scrollIntoViewIfNeeded();
      const savedTop = await page
        .locator("main")
        .evaluate((element) => element.scrollTop);
      await last.click();
      await page.getByRole("heading", { name: "決定した3項目" }).waitFor();
      expect(new URL(page.url()).searchParams.get("roomId")).toBe(
        records[50].roomId,
      );
      await page.goBack();
      await page.getByRole("status").filter({ hasText: "51件" }).waitFor();
      expect(
        Math.abs(
          (await page
            .locator("main")
            .evaluate((element) => element.scrollTop)) - savedTop,
        ),
      ).toBeLessThan(2);
      expect(
        await last.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.goForward();
      await page.getByRole("heading", { name: "決定した3項目" }).waitFor();
      await page.getByRole("button", { name: "成果一覧へ戻る" }).click();
      await page.getByRole("status").filter({ hasText: "51件" }).waitFor();
      expect(
        Math.abs(
          (await page
            .locator("main")
            .evaluate((element) => element.scrollTop)) - savedTop,
        ),
      ).toBeLessThan(2);
    } finally {
      await browser.close();
    }
  });
  test("実Workerの検索・保存状態の絞り込みと深いリンクを操作できる", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await login(page);
      const response = await page.request.get(
        `${app}/api/shared-outcomes?q=新サービス&saveStatus=failed`,
      );
      const { outcomes } = await response.json();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(outcomes[0].lastUsedAt));
      await page.getByLabel("開始日").fill("2000-01-01");
      await page.getByLabel("終了日").fill("2000-01-01");
      await page.getByRole("button", { name: "検索", exact: true }).click();
      await page
        .getByRole("heading", { name: "条件に一致する成果はありません" })
        .waitFor();
      expect(await page.locator("a[data-room-id]").count()).toBe(0);
      await page.getByLabel("開始日").fill(date);
      await page.getByLabel("終了日").fill(date);
      await page.getByRole("searchbox").fill("新サービス");
      await page.getByRole("button", { name: "検索", exact: true }).click();
      await page.getByLabel("保存状態").selectOption("failed");
      await page.getByRole("link", { name: /新サービスの企画/ }).waitFor();
      const links = page.locator("a[data-room-id]");
      expect(await links.count()).toBe(1);
      await links.first().click();
      await page.getByRole("heading", { name: "決定した3項目" }).waitFor();
      const deepUrl = page.url();
      await page.reload();
      await page.getByRole("heading", { name: "決定した3項目" }).waitFor();
      expect(page.url()).toBe(deepUrl);
      await page.getByRole("button", { name: "成果一覧へ戻る" }).click();
      await page.getByRole("searchbox").waitFor();
      expect(await page.getByRole("searchbox").inputValue()).toBe("新サービス");
      expect(await page.getByLabel("保存状態").inputValue()).toBe("failed");
      expect(await page.getByLabel("開始日").inputValue()).toBe(date);
      expect(await page.getByLabel("終了日").inputValue()).toBe(date);
      expect(new URL(page.url()).searchParams.get("from")).toBe(date);
      expect(new URL(page.url()).searchParams.get("to")).toBe(date);
    } finally {
      await browser.close();
    }
  });
});
