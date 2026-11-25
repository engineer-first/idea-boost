import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { byViewport, includeMobile, sizes } from "./viewports";

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
  share = false,
): Promise<void> {
  page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(5000);
  // 共有メニューに対応する端末では「共有」も並ぶ。
  if (share)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => undefined,
      });
    });
  await page.goto(
    `${origin}/iframe.html?id=room-roomlobbyview--${story}&viewMode=story`,
  );
  await page.getByTestId("room-members").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test.each(
  [
    [1024, 499],
    [1280, 531],
    [1366, 542],
    [1440, 699],
    [1920, 979],
    // 共有に対応した端末（iPad・Safari）では「共有」も並ぶ。
    [1024, 499, "share"],
    [1100, 531, "share"],
  ].flatMap(([width, height, share]) =>
    ["host-solo", "host-four", "host-six", "host-twenty", "long-names"].map(
      (story) => ({
        width: Number(width),
        height: Number(height),
        story,
        share: share === "share",
      }),
    ),
  ),
)(
  "PCの待機領域 $width px × $height px（共有: $share）で $story の全員と開始をスクロールなしで表示する",
  async ({ width, height, story, share }) => {
    // 共通ヘッダー69pxとルートの上下余白32pxを除いた実ページの待機領域。
    await open(story, width, height, false, share);
    const start = page.getByTestId("start-phase-button");
    const initial = await start.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        reachable: element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        ),
      };
    });
    await page.screenshot({
      path: `test-results/board-layout/lobby-no-scroll-${width}-${height}-${story}.png`,
    });
    expect.soft(initial.top).toBeGreaterThanOrEqual(0);
    expect.soft(initial.bottom).toBeLessThanOrEqual(height);
    expect.soft(initial.reachable).toBe(true);
    const last = page
      .getByTestId("room-members")
      .locator(":scope > div")
      .last();
    const member = await last.boundingBox();
    const invite = await page
      .getByTestId("room-lobby-view-invite")
      .boundingBox();
    expect
      .soft((member?.y ?? height) + (member?.height ?? 0))
      .toBeLessThanOrEqual(invite?.y ?? 0);
    const scrollable = await page
      .getByTestId("room-lobby-view")
      .evaluate((lobby) =>
        [lobby, ...lobby.querySelectorAll<HTMLElement>("*")]
          // 説明パネルは低い画面では中だけスクロールしてよい。顔と開始は別に確かめる。
          .filter(
            (element) => !element.closest('[data-testid="lobby-flow-guide"]'),
          )
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              ["auto", "scroll"].includes(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 1
            );
          })
          .map((element) => ({
            tag: element.tagName,
            height: element.clientHeight,
            content: element.scrollHeight,
          })),
      );
    expect.soft(scrollable).toEqual([]);
    const avatarSizes = await page
      .getByTestId("room-members")
      .getByTestId("avatar")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().width),
      );
    expect.soft(Math.min(...avatarSizes)).toBeGreaterThanOrEqual(48);
    const members = await page
      .getByTestId("room-members")
      .locator(":scope > div")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON()),
      );
    expect
      .soft(
        members.every(
          (rect) => rect.top >= 0 && rect.bottom <= (invite?.y ?? 0),
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  },
);

test.each([
  { story: "host-four", width: 1280, height: 699 },
  { story: "host-twenty", width: 1280, height: 699 },
  { story: "host-four", width: 1366, height: 542 },
])(
  "PCの待機領域 $width px × $height px で $story の進み方と全ステップを14px以上の文字でパネル内のスクロールで読める",
  async ({ story, width, height }) => {
    await open(story, width, height);
    const guide = page.getByTestId("lobby-flow-guide");
    await page.screenshot({
      path: `test-results/board-layout/lobby-flow-guide-${width}-${height}-${story}.png`,
    });
    const layout = await guide.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const items = [...element.querySelectorAll("li")];
      const fontSizes = [...element.querySelectorAll("li, li *")]
        .filter((node) =>
          [...node.childNodes].some(
            (child) =>
              child.nodeType === Node.TEXT_NODE &&
              child.textContent?.trim() !== "",
          ),
        )
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      // 最後のステップまでパネルの中で送れること。
      items.at(-1)?.scrollIntoView({ block: "end" });
      const last = items.at(-1)?.getBoundingClientRect();
      return {
        guide: rect.toJSON(),
        count: items.length,
        minFontSize: Math.min(...fontSizes),
        last: last?.toJSON(),
      };
    });
    // 進み方3枚・フェーズ3つ・ステップ14件。
    expect(layout.count).toBe(20);
    expect(layout.minFontSize).toBeGreaterThanOrEqual(14);
    expect(layout.last?.bottom).toBeLessThanOrEqual(layout.guide.bottom + 1);
    expect(layout.guide.bottom).toBeLessThanOrEqual(height);
    const stage = await page.getByTestId("room-members").boundingBox();
    expect((stage?.x ?? 0) - layout.guide.right).toBeGreaterThanOrEqual(16);
  },
);

test("20人を5列4段で省略せず表示し、ヘッダーを除く1440×960内で顔・招待・開始を読め、顔も変更できる", async () => {
  await open("host-twenty", 1440, 960);
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
    expect(box.bottom).toBeLessThan(960);
  }
  const start = await page.getByTestId("start-phase-button").boundingBox();
  expect(start).not.toBeNull();
  expect((start?.y ?? 960) + (start?.height ?? 0)).toBeLessThanOrEqual(960);
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
  ).toBe(false);
  expect(await page.getByText(/未使用のアイコンがない/).count()).toBe(0);
  await page.screenshot({
    path: "test-results/board-layout/lobby-twenty-desktop.png",
  });
});

test("自分の顔は変えられる印を常に角に出し、顔と名前に独立したホバーとキーボードの操作表示を出す", async () => {
  await open("host-four", 1280, 800);
  const face = page.getByRole("button", { name: "自分のアイコンを変更" });
  const overlay = face
    .locator('[aria-hidden="true"]')
    .filter({ has: page.locator("svg") });
  const name = page.getByRole("button", { name: "はな：表示名を変更" });
  const pencil = name.locator("svg");
  expect((await face.boundingBox())?.width).toBeGreaterThanOrEqual(96);
  await page.mouse.move(1, 1);
  const opacity = () =>
    overlay.evaluate((element) => getComputedStyle(element).opacity);
  // ホバーしなくても、印で顔を変えられると分かる（大きさは stories で確かめる）。
  expect(await overlay.isVisible()).toBe(true);
  expect(await opacity()).toBe("1");
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
  expect(await opacity()).toBe("1");
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

test.each(
  [1024, 1050, 1090, 1180, 1280, 1440, 1920].flatMap((width) =>
    ["host-solo", "host-six"].map((story) => ({ width, story })),
  ),
)(
  "共有に対応した端末の幅 $width px・$story でも、招待コード・リンクをコピー・共有・スタートが重ならず、文言を省略しない",
  async ({ width, story }) => {
    await open(story, width, 800, false, true);
    const controls = [
      page.getByRole("button", { name: "招待コードをコピー" }),
      page.getByRole("button", { name: "招待リンクをコピー" }),
      page.getByRole("button", { name: "招待リンクを共有" }),
      page.getByTestId("start-phase-button"),
    ];
    await controls[2].waitFor();
    const boxes = [];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      if (box) boxes.push(box);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${i} と ${j} が重なる`).toBe(false);
      }
    // 文言を「リン…」のように省略しない。
    expect(
      await controls[1]
        .locator("span")
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
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

test.each(sizes([390, 844]))(
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

test.skipIf(!includeMobile)(
  "タッチ端末では顔と名前の操作を常時示し、長い同名と切断者20人も横へはみ出さない",
  async () => {
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
  },
);

test.each(
  byViewport(
    { story: "host-four", width: 1440, height: 800, touch: false },
    { story: "host-twenty", width: 1440, height: 800, touch: false },
    { story: "host-twenty", width: 1812, height: 900, touch: false },
    { story: "host-four", width: 390, height: 844, touch: true },
  ),
)(
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
