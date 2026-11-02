import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  await mkdir("test-results/board-layout", { recursive: true });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function open(
  story: string,
  width: number,
  height: number,
  touch = false,
): Promise<void> {
  page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(5000);
  await page.goto(
    `${origin}/iframe.html?id=room-roomlobbyview--${story}&viewMode=story`,
  );
  await page.getByTestId("room-members").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test("20人を5列4段で省略せず表示し、ヘッダーを除く1440×800内で顔・招待・開始を読める", async () => {
  await open("host-twenty", 1440, 800);
  const avatars = page.getByTestId("room-members").getByTestId("avatar");
  expect(await avatars.count()).toBe(20);
  expect(await page.getByTestId("room-members-overflow").count()).toBe(0);
  const boxes = await avatars.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(5);
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(4);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(96);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThan(800);
  }
  const start = await page.getByTestId("start-phase-button").boundingBox();
  expect(start).not.toBeNull();
  expect((start?.y ?? 800) + (start?.height ?? 0)).toBeLessThanOrEqual(800);
  expect(boxes[19].bottom).toBeLessThan(start?.y ?? 0);
  const lastMember = await page
    .getByTestId("room-members")
    .locator(":scope > div")
    .last()
    .boundingBox();
  expect((lastMember?.y ?? 800) + (lastMember?.height ?? 0)).toBeLessThan(
    start?.y ?? 0,
  );
  expect(
    await page
      .getByRole("button", { name: "自分のアイコンを変更" })
      .isDisabled(),
  ).toBe(true);
  expect(await page.getByText(/未使用のアイコンがない/).isVisible()).toBe(true);
  await page.screenshot({
    path: "test-results/board-layout/lobby-twenty-desktop.png",
  });
});

test("自分の顔と名前だけに独立したホバーとキーボードの操作表示を出す", async () => {
  await open("host-four", 1280, 800);
  const face = page.getByRole("button", { name: "自分のアイコンを変更" });
  const overlay = face
    .locator('[aria-hidden="true"]')
    .filter({ has: page.locator("svg") });
  const name = page.getByRole("button", { name: "はな：表示名を変更" });
  const pencil = name.locator("svg");
  expect((await face.boundingBox())?.width).toBe(192);
  await page.mouse.move(1, 1);
  const opacity = () =>
    overlay.evaluate((element) => getComputedStyle(element).opacity);
  expect(await opacity()).toBe("0");
  expect(
    await pencil.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");
  await face.hover();
  expect(await opacity()).toBe("1");
  expect(
    await pencil.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");
  await page.screenshot({
    path: "test-results/board-layout/lobby-avatar-hover.png",
  });
  await name.hover();
  expect(await opacity()).toBe("0");
  expect(
    await pencil.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  await page.mouse.move(1, 1);
  await face.focus();
  expect(await opacity()).toBe("1");
  await name.focus();
  expect(
    await pencil.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  expect(await name.locator('[data-testid="avatar"]').count()).toBe(0);
  await page.screenshot({
    path: "test-results/board-layout/lobby-name-focus.png",
  });
});

test("顔の送信中もキーボードフォーカスを保ち、操作できない状態を伝える", async () => {
  await open("avatar-changing", 1280, 800);
  const face = page.getByTestId("lobby-avatar-change");
  expect(await face.getAttribute("aria-disabled")).toBe("true");
  expect(await face.getAttribute("aria-busy")).toBe("true");
  expect(
    await face.evaluate((element) => (element as HTMLButtonElement).disabled),
  ).toBe(false);
  await face.focus();
  await face.press("Enter");
  expect(
    await face.evaluate((element) => element === document.activeElement),
  ).toBe(true);
});

test.each([768, 1024, 1280])(
  "4人の顔は幅%iでも互いに重ならない",
  async (width) => {
    await open("host-four", width, 800);
    const boxes = await page
      .getByTestId("room-members")
      .getByTestId("avatar")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON()),
      );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right);
  },
);

test("6人は3列2段に揃え、少数だけの余り行を作らない", async () => {
  await open("host-six", 1440, 800);
  const boxes = await page
    .getByTestId("room-members")
    .getByTestId("avatar")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().toJSON()),
    );
  expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(3);
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(2);
});

test.each([
  [390, 844],
  [320, 568],
])(
  "タッチ端末%i×%iで20人の末尾と招待へ到達でき、開始操作が覆わない",
  async (width, height) => {
    await open("host-twenty", width, height, true);
    const last = page.getByTestId("room-members").getByTestId("avatar").last();
    await last.scrollIntoViewIfNeeded();
    const start = page.getByTestId("start-phase-button");
    const startBox = await start.boundingBox();
    const lastBox = await last.boundingBox();
    expect((lastBox?.y ?? height) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
      startBox?.y ?? 0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(startBox?.x).toBeGreaterThanOrEqual(0);
    expect(
      (startBox?.y ?? height) + (startBox?.height ?? 0),
    ).toBeLessThanOrEqual(height);
    const copy = page.getByRole("button", { name: "招待コードをコピー" });
    await copy.scrollIntoViewIfNeeded();
    expect(
      await copy.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/board-layout/lobby-twenty-${width}.png`,
    });
  },
);

test("タッチ端末では顔と名前の操作を常時示し、長い同名と切断者20人も横へはみ出さない", async () => {
  await open("long-names", 390, 844, true);
  const name = page.getByRole("button", { name: /：表示名を変更/ });
  expect(
    await name
      .locator("svg")
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  const last = page.getByTestId("room-members").getByTestId("avatar").last();
  await last.scrollIntoViewIfNeeded();
  expect(await page.getByTestId("member-disconnected").count()).toBe(19);
  const fieldset = page.getByTestId("room-members");
  expect(
    await fieldset.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/board-layout/lobby-long-names-mobile.png",
  });
});

test.each([
  { story: "host-four", width: 1440, height: 800, touch: false },
  { story: "host-twenty", width: 1440, height: 800, touch: false },
  { story: "host-twenty", width: 1812, height: 900, touch: false },
  { story: "host-four", width: 390, height: 844, touch: true },
  { story: "host-twenty", width: 320, height: 568, touch: true },
])(
  "背景の装飾を読み込み、$width px・$story でも名前・招待・開始を覆わない",
  async ({ story, width, height, touch }) => {
    await open(story, width, height, touch);
    const stage = page.getByRole("region", {
      name:
        story === "host-twenty"
          ? "参加メンバー"
          : "メンバーが揃ったら、はじめよう。",
      exact: true,
    });
    const backgrounds = await stage.evaluate((element) =>
      ["::before", "::after"].map((pseudo) => {
        const style = getComputedStyle(element, pseudo);
        return {
          image: style.backgroundImage,
          pointerEvents: style.pointerEvents,
        };
      }),
    );
    for (const background of backgrounds) {
      expect(background.image).not.toBe("none");
      expect(background.pointerEvents).toBe("none");
    }
    expect(
      await stage.evaluate(async (element) =>
        Promise.all(
          ["::before", "::after"].map(async (pseudo) => {
            const url = getComputedStyle(element, pseudo).backgroundImage.match(
              /url\(["']?(.*?)["']?\)/,
            )?.[1];
            if (!url) return false;
            const image = new Image();
            image.src = url;
            await image.decode();
            return image.naturalWidth > 0 && image.naturalHeight > 0;
          }),
        ),
      ),
    ).toEqual([true, true]);
    expect(
      await page
        .getByTestId("room-lobby-view")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    for (const control of [
      page.getByRole("button", { name: /：表示名を変更/ }),
      page.getByRole("button", { name: "招待コードをコピー" }),
      page.getByTestId("start-phase-button"),
    ]) {
      // 固定の開始操作と重なる画面下端から、操作面を中央へスクロールする。
      await control.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      const hit = await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return {
          matches: element.contains(target),
          label: element.getAttribute("aria-label") ?? element.textContent,
          target: target?.textContent,
          rect: rect.toJSON(),
        };
      });
      expect(hit.matches, JSON.stringify(hit)).toBe(true);
    }
    await page.screenshot({
      path: `test-results/board-layout/lobby-background-${width}-${story}.png`,
    });
  },
);
