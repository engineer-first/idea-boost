import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CompletedRoomSchema } from "../../contracts/completed-rooms";
import { completedRoomFixture } from "../../contracts/completed-rooms.fixture";
import { VerificationActiveSchema } from "../../contracts/verification";
import {
  assertPortAvailable,
  prepareVerificationRuntime,
  type VerificationRuntime,
} from "../../scripts/verification-config.mjs";
import {
  stopProcesses,
  waitForReady,
} from "../../scripts/verification-process.mjs";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";
const widths = [390, 1280];

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`) });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        Array.from(
          document.querySelectorAll("main, [data-testid=home-view]"),
        ).every((element) => element.scrollWidth <= element.clientWidth),
    ),
  ).toBe(true);
}

// Storybook の Next router はモック。実際の URL 遷移は下の実 Next/Worker で検証する。
it.each(
  widths,
)("ホームの履歴入口にTabで到達でき、入力を%ipxで保持する", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const historyRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/completed-rooms"))
        historyRequests.push(request.url());
    });
    await page.goto(
      `${origin}/iframe.html?id=home-homeview--default&viewMode=story`,
    );
    const name = page.getByRole("textbox", { name: "ルーム名（任意）" });
    const code = page.getByRole("textbox", { name: "招待コード" });
    await name.fill("授業の相談");
    await code.fill("ABC123");
    const entry = page.getByRole("link", { name: /過去の成果を見る/ });
    expect(await entry.getAttribute("href")).toBe("/completed-rooms");
    expect(await entry.getAttribute("target")).not.toBe("_blank");
    expect(await page.locator("details, summary").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: "最新の一覧を取得" }).count(),
    ).toBe(0);
    await page.getByRole("button", { name: "参加する", exact: true }).focus();
    await page.keyboard.press("Tab");
    expect(
      await entry.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    const bounds = await entry.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 844) + (bounds?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.keyboard.press("Shift+Tab");
    expect(
      await page
        .getByRole("button", { name: "参加する", exact: true })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(await name.inputValue()).toBe("授業の相談");
    expect(await code.inputValue()).toBe("ABC123");
    expect(historyRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await capture(page, `home-history-${width}-entry`);
  } finally {
    await browser.close();
  }
});

it.each(
  widths,
)("専用一覧の読込・再試行・ページング・期限切れ更新を%ipxで操作できる", async (width) => {
  const browser = await chromium.launch();
  let releaseInitial: (() => void) | undefined;
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    let attempt = 0;
    const initial = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    await page.route("**/api/completed-rooms*", async (route) => {
      attempt++;
      if (attempt === 1) {
        await initial;
        await route.fulfill({ status: 503, json: {} });
      } else if (attempt === 2) {
        expect(new URL(route.request().url()).searchParams.has("cursor")).toBe(
          false,
        );
        await route.fulfill({ json: { rooms: [], nextCursor: "page-2" } });
      } else if (attempt === 3) {
        expect(new URL(route.request().url()).searchParams.get("cursor")).toBe(
          "page-2",
        );
        await route.fulfill({
          json: { rooms: [completedRoomFixture()], nextCursor: null },
        });
      } else {
        // サーバーが期限切れのルームを返さなくなった更新結果を表示する。
        expect(new URL(route.request().url()).searchParams.has("cursor")).toBe(
          false,
        );
        await route.fulfill({ json: { rooms: [], nextCursor: null } });
      }
    });
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
    await page.getByRole("status").waitFor();
    expect(
      await page.getByRole("button", { name: "最新の一覧を取得" }).isDisabled(),
    ).toBe(true);
    releaseInitial?.();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "再取得", exact: true }).click();
    const more = page.getByRole("button", { name: "次のルームを表示" });
    await more.waitFor();
    expect(await page.getByText("以前のルームはまだありません。").count()).toBe(
      0,
    );
    await more.click();
    const outcome = page.getByRole("link", { name: "成果を見る", exact: true });
    await outcome.waitFor();
    expect(await outcome.getAttribute("href")).toBe(
      `/completed-rooms/${completedRoomFixture().roomId}`,
    );
    await capture(page, `completed-rooms-${width}-success`);
    expect(attempt).toBe(3);
    await page.getByRole("button", { name: "最新の一覧を取得" }).click();
    await page.getByText("以前のルームはまだありません。").waitFor();
    expect(await outcome.count()).toBe(0);
    expect(attempt).toBe(4);
    await expectNoHorizontalOverflow(page);
  } finally {
    releaseInitial?.();
    await browser.close();
  }
});

it.each(
  widths,
)("大量・長文の専用一覧を%ipxで最後まで読んでページングできる", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const rooms = Array.from({ length: 30 }, (_, index) =>
      completedRoomFixture({
        roomId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        idea: `${index + 1}件目：${"授業で考えた長いアイデア".repeat(30)}`,
      }),
    );
    await page.route("**/api/completed-rooms*", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (cursor) {
        expect(cursor).toBe("page-2");
        await route.fulfill({
          json: { rooms: [completedRoomFixture()], nextCursor: null },
        });
      } else {
        await route.fulfill({ json: { rooms, nextCursor: "page-2" } });
      }
    });
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-container--default&viewMode=story`,
    );
    const more = page.getByRole("button", { name: "次のルームを表示" });
    await more.waitFor();
    expect(
      await page.getByRole("link", { name: "成果を見る", exact: true }).count(),
    ).toBe(30);
    await more.scrollIntoViewIfNeeded();
    const bounds = await more.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 844) + (bounds?.height ?? 0)).toBeLessThanOrEqual(844);
    await expectNoHorizontalOverflow(page);
    await capture(page, `completed-rooms-${width}-many`);
    await more.click();
    await page
      .locator(`a[href="/completed-rooms/${completedRoomFixture().roomId}"]`)
      .waitFor();
    expect(
      await page.getByRole("link", { name: "成果を見る", exact: true }).count(),
    ).toBe(31);
    expect(await more.count()).toBe(0);
    await expectNoHorizontalOverflow(page);
    const home = page.getByRole("link", { name: "ホームへ" });
    await home.scrollIntoViewIfNeeded();
    expect(await home.isVisible()).toBe(true);
  } finally {
    await browser.close();
  }
});

// URL 指定時は既存 dev:verify を利用する。指定がない CI でも実 Next/Worker を起動し、
// Storybook router mock では保証できない Link と履歴を検査する。通常 DB は変更しない。
describe("実Next/Workerでのホーム・完了一覧・成果の移動", () => {
  let app = process.env.AUTH_APP_TEST_URL;
  let runtime: VerificationRuntime | undefined;
  const children: ChildProcess[] = [];
  let serverLog = "";

  beforeAll(async () => {
    if (app) return;
    const projectDir = process.cwd();
    runtime = await prepareVerificationRuntime(projectDir, {
      ...process.env,
      IDEA_BOOST_VERIFY_APP_PORT: "3106",
      IDEA_BOOST_VERIFY_API_PORT: "8806",
    });
    await Promise.all([
      assertPortAvailable(runtime.appPort),
      assertPortAvailable(runtime.apiPort),
    ]);
    const isolatedState = join(runtime.directory, "browser-state");
    const start = (args: string[]): ChildProcess => {
      const child = spawn(
        process.execPath,
        args.map((arg) => (arg === runtime?.persistPath ? isolatedState : arg)),
        {
          cwd: projectDir,
          env: runtime?.env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        },
      );
      children.push(child);
      child.stdout?.on("data", (data) => {
        serverLog += String(data);
      });
      child.stderr?.on("data", (data) => {
        serverLog += String(data);
      });
      return child;
    };
    const migration = start(runtime.migrateArgs);
    await new Promise<void>((resolve, reject) => {
      migration.once("error", reject);
      migration.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`検証DBの準備に失敗しました。\n${serverLog}`)),
      );
    });
    const worker = start(runtime.workerArgs);
    await waitForReady(`http://127.0.0.1:${runtime.apiPort}/api/health`, [
      worker,
    ]);
    const next = start(runtime.nextArgs);
    await waitForReady(runtime.readyUrl, [worker, next]);
    app = `http://localhost:${runtime.appPort}`;
  });

  afterAll(async () => {
    try {
      await stopProcesses(children);
    } finally {
      if (runtime) {
        await mkdir(output, { recursive: true });
        await writeFile(
          join(output, "home-history-next-worker.log"),
          serverLog,
        );
        await rm(runtime.directory, { recursive: true, force: true });
      }
    }
  });

  it.each(
    widths,
  )("%ipxでEnterから同じタブの一覧・詳細へ移動し、戻るリンクとbrowser Backが機能する", async (width) => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
      });
      const page = await context.newPage();
      for (const path of [
        "/completed-rooms",
        `/completed-rooms/${completedRoomFixture().roomId}`,
      ]) {
        await page.goto(`${app}${path}`);
        await page.waitForURL(`${app}/login?next=${encodeURIComponent(path)}`);
      }
      await page.goto(`${app}/login?next=%2Fhome`);
      await page.getByLabel("メールアドレス").fill("owner@example.test");
      await page.getByLabel("パスワード").fill("password");
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .click();
      await page.waitForURL(`${app}/home`);
      const prepared = await page.request.post(
        `${app}/api/verification/outcomes`,
        {
          data: { scenario: "completed", roomName: `履歴導線${width}px` },
          headers: { origin: app as string },
        },
      );
      expect(prepared.ok()).toBe(true);
      const { roomId } = VerificationActiveSchema.parse(await prepared.json());
      const detailResponse = await page.request.get(
        `${app}/api/completed-rooms/${roomId}`,
      );
      expect(detailResponse.ok()).toBe(true);
      const room = CompletedRoomSchema.parse(await detailResponse.json());
      await page
        .getByRole("textbox", { name: "ルーム名（任意）" })
        .fill("授業の相談");
      await page.getByRole("textbox", { name: "招待コード" }).fill("ABC123");
      await page.getByRole("button", { name: "参加する", exact: true }).focus();
      await page.keyboard.press("Tab");
      const entry = page.getByRole("link", { name: /過去の成果を見る/ });
      expect(
        await entry.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Enter");
      await page.waitForURL(`${app}/completed-rooms`);
      await page
        .getByRole("heading", { name: "以前のルーム", exact: true })
        .waitFor();
      expect(context.pages()).toHaveLength(1);
      const outcome = page.locator(`a[href="/completed-rooms/${roomId}"]`);
      await outcome.waitFor();
      await capture(page, `home-history-${width}-actual-list`);
      await outcome.click();
      await page.waitForURL(`${app}/completed-rooms/${roomId}`);
      await page
        .getByRole("heading", { name: "チームで決めた成果", exact: true })
        .waitFor();
      await page.getByText(room.idea, { exact: true }).waitFor();
      expect(context.pages()).toHaveLength(1);
      await expectNoHorizontalOverflow(page);
      await capture(page, `home-history-${width}-actual-detail`);
      const backToList = page.getByRole("link", {
        name: "以前のルームへ",
        exact: true,
      });
      expect(await backToList.getAttribute("href")).toBe("/completed-rooms");
      await backToList.click();
      await page.waitForURL(`${app}/completed-rooms`);
      await outcome.waitFor();
      await page.goBack();
      await page.waitForURL(`${app}/completed-rooms/${roomId}`);
      await page
        .getByRole("heading", { name: "チームで決めた成果", exact: true })
        .waitFor();
      await page.goBack();
      await page.waitForURL(`${app}/completed-rooms`);
      await outcome.waitFor();
      await page.goBack();
      await page.waitForURL(`${app}/home`);
      await entry.waitFor();
      expect(context.pages()).toHaveLength(1);
      await expectNoHorizontalOverflow(page);
      await capture(page, `home-history-${width}-actual-back-home`);
    } finally {
      await browser.close();
    }
  }, 90_000);
});
