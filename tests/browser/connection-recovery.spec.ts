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
  page = await browser.newPage();
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

for (const width of [390, 1440]) {
  for (const terminal of [
    { story: "auth-required", label: "ログインする", href: "/login" },
    { story: "unavailable", label: "ホームへ戻る", href: "/home" },
  ]) {
    test(`停止後も文章をコピーでき、${terminal.label}へ到達できる (${width}px)`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--${terminal.story}-with-draft&viewMode=story`,
      );
      const entry = page.getByRole("link", { name: terminal.label });
      await entry.waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (width >= 640) {
        const notice = await page
          .getByTestId("board-connection-status")
          .boundingBox();
        const notes = await page
          .getByTestId("private-notes-toolbar")
          .boundingBox();
        expect(
          notes?.y,
          "停止案内がマイ付箋一覧を覆わない",
        ).toBeGreaterThanOrEqual(
          (notice?.y ?? Infinity) + (notice?.height ?? 0),
        );
      }
      await page.getByRole("button", { name: "確認・コピー" }).click();
      const draft = page.getByRole("textbox", { name: "未反映の文章 1" });
      const text = await draft.inputValue();
      await page.getByRole("button", { name: "コピー", exact: true }).click();
      await page.getByRole("status", { name: "コピー結果" }).waitFor();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        text,
      );
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await page.getByRole("button", { name: "確認・コピー" }).click();
      expect(await draft.inputValue()).toBe(text);
      await entry.scrollIntoViewIfNeeded();
      await entry.focus();
      expect(
        await entry.evaluate((element) => document.activeElement === element),
      ).toBe(true);
      expect(
        await entry.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const target = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return target !== null && element.contains(target);
        }),
      ).toBe(true);
      expect(await entry.getAttribute("href")).toBe(terminal.href);
      await entry.press("Enter");
      await page.waitForURL(`**${terminal.href}`);
    });
  }
}

for (const width of [390, 1440]) {
  test(`長文をコピーし、復旧UIを閉じて再表示できる (${width}px)`, async () => {
    await page.setViewportSize({ width, height: 844 });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(
      `${origin}/iframe.html?id=notes-notedraftrecovery--multiple-long-drafts&viewMode=story`,
    );
    await page.getByRole("button", { name: "確認・コピー" }).click();
    const second = page.getByRole("textbox", {
      name: "未反映の文章 2",
      exact: true,
    });
    await second.scrollIntoViewIfNeeded();
    const text = await second.inputValue();
    const copy = page
      .getByRole("button", { name: "コピー", exact: true })
      .nth(1);
    await copy.click();
    await page.getByRole("status", { name: "コピー結果" }).waitFor();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      text,
    );
    const box = await copy.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    expect(await page.getByRole("textbox").count()).toBe(0);
    await page.getByRole("button", { name: "確認・コピー" }).press("Enter");
    expect(await second.inputValue()).toBe(text);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test("クリップボード拒否時は全文を選択して手動回収できる", async () => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
  });
  await page.goto(
    `${origin}/iframe.html?id=notes-notedraftrecovery--conflict&viewMode=story`,
  );
  await page.getByRole("button", { name: "確認・コピー" }).click();
  await page.getByRole("button", { name: "コピー", exact: true }).click();
  await page.getByRole("alert").waitFor();
  expect(await page.getByRole("status", { name: "コピー結果" }).count()).toBe(
    0,
  );
  const text = page.getByRole("textbox", { name: "未反映の文章 1" });
  await text.focus();
  expect(
    await text.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd - element.selectionStart,
    ),
  ).toBe((await text.inputValue()).length);
});

test("390pxで復旧通知を閉じると通常の付箋操作に戻れる", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${origin}/iframe.html?id=notes-notedraftrecovery--board-toolbar-reachability&viewMode=story`,
  );
  const ordinaryAction = page.getByRole("button", { name: "マイ付箋を開く" });
  await ordinaryAction.click({ timeout: 3000 });
  await page.getByRole("button", { name: "確認・コピー" }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await ordinaryAction.click({ timeout: 3000 });
  await page.getByRole("button", { name: "確認・コピー" }).click();
  expect(await page.getByRole("textbox").inputValue()).toBe(
    "消さずに残した文章です。",
  );
});

for (const width of [390, 640, 768, 900, 1024, 1280, 1440]) {
  for (const guide of ["detail", "compact"] as const) {
    test(`接続待ちの案内は進行・ガイドを覆わず、メニューへ到達できる (${width}px / ${guide})`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(
        `${origin}/iframe.html?id=${guide === "detail" ? "room-roomboardlayout--delayed-connection" : "room-roomboardview--reconnecting"}&viewMode=story&args=connectionDelayed:true`,
      );
      const notice = page.getByTestId("board-connection-status");
      await notice.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId("step-guide").waitFor();
      const textVisibility = await notice.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const lines: { text: string; visible: boolean }[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            lines.push({
              text: node.textContent,
              visible: top !== null && element.contains(top),
            });
          }
        }
        return lines;
      });
      expect(textVisibility.length).toBeGreaterThanOrEqual(3);
      expect(textVisibility, "案内の各行が他のガイドに遮られない").toEqual(
        textVisibility.map((line) => ({ ...line, visible: true })),
      );
      expect(await notice.innerText()).toContain(
        "この画面を開いたままお待ちください",
      );
      const noticeBox = await notice.boundingBox();
      const controlsBox = await page
        .getByTestId("board-control-hud")
        .boundingBox();
      expect(noticeBox?.y).toBeGreaterThanOrEqual(
        (controlsBox?.y ?? Infinity) + (controlsBox?.height ?? 0),
      );
      expect(noticeBox?.x).toBeGreaterThanOrEqual(0);
      expect(
        (noticeBox?.x ?? Infinity) + (noticeBox?.width ?? 0),
      ).toBeLessThanOrEqual(width);
      if (width >= 640) {
        const privateNotesBox = await page
          .getByTestId("private-notes-toolbar")
          .boundingBox();
        expect(
          privateNotesBox?.y,
          "接続案内がマイ付箋一覧を覆わない",
        ).toBeGreaterThanOrEqual(
          (noticeBox?.y ?? Infinity) + (noticeBox?.height ?? 0),
        );
      }
      const contextBox = await page
        .getByTestId("board-context-column")
        .boundingBox();
      if (width === 390)
        expect(contextBox?.y).toBeGreaterThanOrEqual(
          (noticeBox?.y ?? Infinity) + (noticeBox?.height ?? 0),
        );
      if (width === 390) {
        const guide = page.getByTestId("step-guide");
        await guide.scrollIntoViewIfNeeded();
        const privateNotesBox = await page
          .getByTestId("private-notes-toolbar")
          .boundingBox();
        const guideBox = await guide.boundingBox();
        expect(
          privateNotesBox?.y,
          "マイ付箋一覧が進め方を覆わない",
        ).toBeGreaterThanOrEqual(
          // 進行欄は独立スクロールするため、実際に見える範囲で比較する。
          Math.min(
            (guideBox?.y ?? Infinity) + (guideBox?.height ?? 0),
            (contextBox?.y ?? Infinity) + (contextBox?.height ?? 0),
          ),
        );
        expect(
          await guide.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return top !== null && element.contains(top);
          }),
          "スクロールして進め方へ到達できる",
        ).toBe(true);
      }
      await page.getByRole("button", { name: "ルームメニューを開く" }).click();
      await page
        .getByRole("button", { name: "ルームを解散", exact: true })
        .waitFor();
      expect(
        await page.getByRole("button", { name: "再接続を試す" }).count(),
      ).toBe(0);
    });
  }
}
