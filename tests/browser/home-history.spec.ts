import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
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

type Bounds = { x: number; y: number; width: number; height: number };
type CardLayout = {
  card: Bounds;
  header: Bounds;
  form: Bounds;
  input: Bounds;
  button: Bounds;
};
type HomeLayout = {
  create: CardLayout;
  join: CardLayout;
  entry: Bounds;
};

async function capture(
  page: Page,
  name: string,
  layout?: HomeLayout,
): Promise<void> {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`) });
  if (layout) {
    await writeFile(
      join(output, `${name}.json`),
      JSON.stringify(layout, null, 2),
    );
  }
}

async function measureHomeLayout(page: Page): Promise<HomeLayout> {
  return page.getByTestId("home-view").evaluate((home) => {
    const bounds = (element: Element | null): Bounds => {
      if (!element) throw new Error("ホームの計測対象が見つかりません。");
      const rect = element.getBoundingClientRect();
      let { x, y } = rect;
      // focus/scrollIntoView による自然なスクロールと、レイアウトの移動を区別する。
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        x += parent.scrollLeft;
        y += parent.scrollTop;
      }
      return { x, y, width: rect.width, height: rect.height };
    };
    const card = (testId: string): CardLayout => {
      const element = home.querySelector(`[data-testid="${testId}"]`);
      if (!element) throw new Error(`カード ${testId} が見つかりません。`);
      return {
        card: bounds(element),
        header: bounds(element.querySelector('[data-slot="card-header"]')),
        form: bounds(element.querySelector("form")),
        input: bounds(element.querySelector("input")),
        button: bounds(element.querySelector('button[type="submit"]')),
      };
    };
    return {
      create: card("home-create-room"),
      join: card("home-join-room"),
      entry: bounds(home.querySelector('a[href="/completed-rooms"]')),
    };
  });
}

function expectClose(actual: number, expected: number, label: string): void {
  // サブピクセルの丸めだけを許容し、失敗時も後続状態の測定・画像を残す。
  expect.soft(Math.abs(actual - expected), label).toBeLessThanOrEqual(1);
}

function expectAlignedCards(
  layout: HomeLayout,
  width: number,
  state: string,
): void {
  const { create, join } = layout;
  const context = `${width}px ${state}`;
  expectClose(create.card.width, join.card.width, `${context}: カード幅`);
  expectClose(create.card.height, join.card.height, `${context}: カード高さ`);
  if (width >= 640) {
    expectClose(create.card.y, join.card.y, `${context}: カード上端`);
    expect
      .soft(join.card.x, `${context}: 横並び`)
      .toBeGreaterThanOrEqual(create.card.x + create.card.width);
  } else {
    expectClose(create.card.x, join.card.x, `${context}: カード左端`);
    const gap = join.card.y - create.card.y - create.card.height;
    expect.soft(gap, `${context}: 縦並び`).toBeGreaterThanOrEqual(0);
    expect.soft(gap, `${context}: カード間の空白`).toBeLessThanOrEqual(24);
  }
  for (const target of ["input", "button"] as const) {
    for (const dimension of ["width", "height"] as const) {
      expectClose(
        create[target][dimension],
        join[target][dimension],
        `${context}: ${target} ${dimension}`,
      );
    }
    expectClose(
      create[target].y - create.card.y,
      join[target].y - join.card.y,
      `${context}: ${target} のカード内の上端`,
    );
    if (width >= 640) {
      expectClose(
        create[target].y,
        join[target].y,
        `${context}: ${target} の上端`,
      );
    }
  }
  for (const [name, card] of Object.entries({ create, join })) {
    const left = card.input.x - card.card.x;
    const right =
      card.card.x + card.card.width - card.input.x - card.input.width;
    expectClose(left, right, `${context}: ${name} の左右内余白`);
    expectClose(
      left,
      create.input.x - create.card.x,
      `${context}: 左右カードの内余白`,
    );
    expectClose(
      card.input.x,
      card.button.x,
      `${context}: ${name} のinput/button左端`,
    );
    expectClose(
      card.input.width,
      card.button.width,
      `${context}: ${name} のinput/button幅`,
    );
    expect
      .soft(
        card.form.y - card.header.y - card.header.height,
        `${context}: ${name} の見出しとフォーム間の空白`,
      )
      .toBeLessThanOrEqual(24);
    const fieldGap = card.button.y - card.input.y - card.input.height;
    expect
      .soft(fieldGap, `${context}: ${name} のinput/button重なり`)
      .toBeGreaterThanOrEqual(0);
    // 2行の検証メッセージを確保しても、CTAの前を過剰に空けない。
    expect
      .soft(fieldGap, `${context}: ${name} のinput/button間の空白`)
      .toBeLessThanOrEqual(64);
    const bottom =
      card.card.y + card.card.height - card.button.y - card.button.height;
    expect
      .soft(bottom, `${context}: ${name} のボタンのカード内への収まり`)
      .toBeGreaterThanOrEqual(0);
    expect
      .soft(bottom, `${context}: ${name} のボタン下の空白`)
      .toBeLessThanOrEqual(32);
  }
}

function expectStableLayout(
  initial: HomeLayout,
  current: HomeLayout,
  state: string,
): void {
  for (const card of ["create", "join"] as const) {
    for (const target of ["card", "input", "button"] as const) {
      for (const dimension of ["x", "y", "width", "height"] as const) {
        expectClose(
          current[card][target][dimension],
          initial[card][target][dimension],
          `${state}: ${card} ${target} ${dimension} が動かない`,
        );
      }
    }
  }
  for (const dimension of ["x", "y", "width", "height"] as const) {
    expectClose(
      current.entry[dimension],
      initial.entry[dimension],
      `${state}: 履歴CTA ${dimension} が動かない`,
    );
  }
}

async function expectReachable(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? Infinity) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  expect((bounds?.y ?? Infinity) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
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
it.each([
  390, 640, 1280,
])("左右カードの配置を保って招待コードのblur検証と履歴入口のTab操作を%ipxで行える", async (width) => {
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
    const create = page.getByRole("button", {
      name: "新しいルームを作成",
      exact: true,
    });
    const join = page.getByRole("button", { name: "参加する", exact: true });
    const error = page.getByRole("alert");
    const entry = page.getByRole("link", { name: /過去の成果を見る/ });
    const destructive = await code.evaluate((element) => {
      // CSS最適化による百分率等の表記差を、同じブラウザのcomputed色へ正規化する。
      const reference = document.createElement("span");
      reference.hidden = true;
      reference.style.color = "var(--destructive)";
      (element.parentElement ?? document.body).append(reference);
      try {
        return getComputedStyle(reference).color;
      } finally {
        reference.remove();
      }
    });
    const initialBorder = await code.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    expect(await code.inputValue()).toBe("");
    expect(await error.count()).toBe(0);
    expect(await code.getAttribute("aria-invalid")).not.toBe("true");
    expect(initialBorder).not.toBe(destructive);
    expect(await join.isDisabled()).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    const initialLayout = await measureHomeLayout(page);
    expectAlignedCards(initialLayout, width, "initial");
    for (const target of [name, create, code, join, entry]) {
      await expectReachable(page, target);
    }
    await expectNoHorizontalOverflow(page);
    await capture(page, `home-invite-${width}-initial`, initialLayout);

    await code.focus();
    await page.keyboard.press("Tab");
    expect(await error.count()).toBe(0);
    await code.fill("ab");
    expect(await code.inputValue()).toBe("AB");
    expect(await error.count()).toBe(0);
    expect(await code.getAttribute("aria-invalid")).not.toBe("true");
    expect(await join.isDisabled()).toBe(true);
    await page.keyboard.press("Tab");
    await error.waitFor();
    expect(await code.getAttribute("aria-invalid")).toBe("true");
    const errorId = await error.getAttribute("id");
    expect(errorId).toBeTruthy();
    expect(
      (await code.getAttribute("aria-describedby"))?.split(/\s+/),
    ).toContain(errorId);
    expect(
      await error.evaluate((element) => getComputedStyle(element).color),
    ).toBe(destructive);
    await expect
      .poll(() =>
        code.evaluate((element) => getComputedStyle(element).borderColor),
      )
      .toBe(destructive);
    const errorLayout = await measureHomeLayout(page);
    expectAlignedCards(errorLayout, width, "error");
    expectStableLayout(initialLayout, errorLayout, `${width}px error`);
    for (const target of [name, create, code, error, join, entry]) {
      await expectReachable(page, target);
    }
    const inputBounds = await code.boundingBox();
    const errorBounds = await error.boundingBox();
    const joinBounds = await join.boundingBox();
    expect(inputBounds).not.toBeNull();
    expect(errorBounds).not.toBeNull();
    expect(errorBounds?.y).toBeGreaterThanOrEqual(
      (inputBounds?.y ?? 0) + (inputBounds?.height ?? 0),
    );
    expect(
      (errorBounds?.y ?? 844) + (errorBounds?.height ?? 0),
    ).toBeLessThanOrEqual(joinBounds?.y ?? 0);
    await expectNoHorizontalOverflow(page);
    await capture(page, `home-invite-${width}-error`, errorLayout);

    await code.focus();
    await page.keyboard.press("Backspace");
    expect(await code.inputValue()).toBe("A");
    expect(await error.count()).toBe(0);
    expect(await code.getAttribute("aria-invalid")).not.toBe("true");
    expect(await code.getAttribute("aria-describedby")).toBeNull();
    await code.fill("abc123");
    await page.keyboard.press("Tab");
    expect(await code.inputValue()).toBe("ABC123");
    expect(await join.isEnabled()).toBe(true);
    expect(await error.count()).toBe(0);
    expect(await code.getAttribute("aria-invalid")).not.toBe("true");
    await expect
      .poll(() =>
        code.evaluate((element) => getComputedStyle(element).borderColor),
      )
      .toBe(initialBorder);
    await expectNoHorizontalOverflow(page);
    const correctedLayout = await measureHomeLayout(page);
    expectAlignedCards(correctedLayout, width, "corrected");
    expectStableLayout(initialLayout, correctedLayout, `${width}px corrected`);
    for (const target of [name, create, code, join, entry]) {
      await expectReachable(page, target);
    }
    await capture(page, `home-invite-${width}-corrected`, correctedLayout);
    await name.fill("授業の相談");
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

  it("成功後の新規作成と以前のルームへの移動は、自動確認の応答で取り消されない", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 844 },
      });
      await page.goto(`${app}/login?next=%2Fhome`);
      await page.getByLabel("メールアドレス").fill("owner@example.test");
      await page.getByLabel("パスワード").fill("password");
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .click();
      await page.waitForURL(`${app}/home`);
      await page
        .getByRole("textbox", { name: "ルーム名（任意）" })
        .fill("前の会");
      await page
        .getByRole("button", { name: "新しいルームを作成", exact: true })
        .click();
      await page.waitForURL(/\/rooms\/[^/]+\/start/);
      // 入室ごとの一回tokenは異なるので、戻り先のルームをURL pathで照合する。
      const first = new URL(page.url());
      await page.goto(`${app}/home`);
      await page
        .getByRole("button", { name: "前のルームに戻る", exact: true })
        .waitFor();
      await page
        .getByRole("textbox", { name: "ルーム名（任意）" })
        .fill("次の会");
      await page
        .getByRole("button", { name: "新しいルームを作成", exact: true })
        .click();
      await page.waitForURL(/\/rooms\/[^/]+\/start/);
      expect(new URL(page.url()).pathname).not.toBe(first.pathname);
      await page.goto(`${app}/home`);
      await page
        .getByRole("button", { name: "前のルームに戻る", exact: true })
        .waitFor();
      await page.getByText("以前のルーム", { exact: true }).click();
      await page
        .getByRole("button", { name: /以前のルームを開く/ })
        .first()
        .click();
      await page.waitForURL(
        (url) => url.origin === first.origin && url.pathname === first.pathname,
        { timeout: 5000 },
      );
    } finally {
      await browser.close();
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
