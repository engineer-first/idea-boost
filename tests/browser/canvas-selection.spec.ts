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
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-interaction&viewMode=story`,
  );
  await page.getByTestId("note-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function transform(): Promise<string> {
  return page.getByTestId("board-canvas").evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return element.style.transform;
  });
}
async function marqueeAll(): Promise<void> {
  const boxes = await page
    .getByTestId("note-card")
    .evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().toJSON()),
    );
  const x = Math.min(...boxes.map((box) => box.left)) - 20;
  const y = Math.min(...boxes.map((box) => box.top)) - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(...boxes.map((box) => box.right)) + 15,
    Math.max(...boxes.map((box) => box.bottom)) + 15,
    { steps: 8 },
  );
  await page.mouse.up();
}
async function selectedCount(count: number): Promise<void> {
  await expect
    .poll(() =>
      page.getByTestId("board-scroller").getAttribute("data-selection-count"),
    )
    .toBe(String(count));
}

async function openClockedCanvas(width = 1280, cpuRate = 1): Promise<void> {
  await page.close();
  page = await browser.newPage({ viewport: { width, height: 720 } });
  if (cpuRate > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  }
  // 読み込み済みアプリのtimer/RAFと混在させず、時計を先に導入する。
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-interaction&viewMode=story`,
  );
  await page.getByTestId("note-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await transform();
  await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));
}

test.each([
  390, 1280,
])("%ipxで各キャンバス操作のヒントをhoverの1秒後に画面内へ表示する", async (width) => {
  await openClockedCanvas(width);
  const hint = page.locator(
    '[data-slot="tooltip-content"]:not([data-state="closed"])',
  );
  for (const name of [
    "選択ツール",
    "手のひらツール",
    "キャンバスを縮小",
    "ズームを100%に戻す",
    "キャンバスを拡大",
    "付箋全体を表示",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.hover();
    await page.clock.runFor(999);
    expect(await hint.count()).toBe(0);
    await page.clock.runFor(1);
    await expect.poll(() => hint.count()).toBe(1);
    await expect
      .poll(async () => {
        await page.clock.runFor(16);
        return hint.isVisible();
      })
      .toBe(true);
    expect(await hint.textContent()).toContain(name.replace("ツール", ""));
    const bounds = await hint.boundingBox();
    if (!bounds) throw new Error("ヒントが表示されていません");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.mouse.move(width / 2, 400, { steps: 4 });
    await page.clock.runFor(400);
    await hint.waitFor({ state: "hidden" });
  }
});

test("キーボードでフォーカスしたヒントは待たずに表示し、Escapeで閉じる", async () => {
  const hand = page.getByRole("button", { name: "手のひらツール" });
  await page.getByRole("button", { name: "選択ツール" }).focus();
  await page.keyboard.press("Tab");
  expect(await hand.evaluate((el) => el === document.activeElement)).toBe(true);
  const hint = page.locator(
    '[data-slot="tooltip-content"]:not([data-state="closed"])',
  );
  await hint.waitFor({ state: "visible" });
  expect(await hint.textContent()).toContain("Space＋ドラッグ");
  await page.keyboard.press("Escape");
  await hint.waitFor({ state: "hidden" });
  expect(await hand.evaluate((el) => el === document.activeElement)).toBe(true);
});

test.each([
  1, 8,
])("CPU減速%ixでも手のひらのヒントから隣の選択ツールへ待たずに切り替わる", async (cpuRate) => {
  await openClockedCanvas(1280, cpuRate);
  const hint = page.locator(
    '[data-slot="tooltip-content"]:not([data-state="closed"])',
  );
  await page.getByRole("button", { name: "手のひらツール" }).hover();
  await page.clock.runFor(1000);
  await expect.poll(() => hint.getAttribute("data-state")).toBe("delayed-open");
  // Popperの配置RAFはReactのcommit後に登録される。停止時計でも描画を進める。
  await expect
    .poll(async () => {
      await page.clock.runFor(16);
      return hint.isVisible();
    })
    .toBe(true);
  expect(await hint.textContent()).toContain("手のひら");

  const hand = await page
    .getByRole("button", { name: "手のひらツール" })
    .boundingBox();
  const select = await page
    .getByRole("button", { name: "選択ツール" })
    .boundingBox();
  if (!hand || !select)
    throw new Error("キャンバスのツールが表示されていません");
  // 停止時計のまま連続イベントを送ると、Radixのhover猶予領域の更新より先に
  // 移動が終わる。実際の移動と同じく各ステップで描画を進める（合計64ms）。
  for (let step = 1; step <= 4; step++) {
    await page.mouse.move(
      hand.x + hand.width / 2 + ((select.x - hand.x) * step) / 4,
      hand.y + hand.height / 2 + ((select.y - hand.y) * step) / 4,
    );
    await page.clock.runFor(16);
  }
  // 1秒の表示待ちを省いた状態を検査する。常に存在するtriggerを読み、
  // ヒント未表示時にlocatorの自動待機でpollが止まることも避ける。
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "選択ツール" })
        .getAttribute("data-state"),
    )
    .toBe("instant-open");
  // Popperの配置RAFはReactのcommit後に登録される。停止時計でも描画を進める。
  await expect
    .poll(async () => {
      await page.clock.runFor(16);
      return hint.isVisible();
    })
    .toBe(true);
  expect(await hint.textContent()).toContain("選択（背景でV）");
});

test("選択ツールは付箋上でも矢印になり、handから戻すと矢印へ戻る", async () => {
  const viewport = page.getByTestId("board-scroller");
  const surfaces = page.locator("[data-canvas-note-surface='true']");
  const cursors = async () => ({
    background: await viewport.evaluate((el) => getComputedStyle(el).cursor),
    notes: await surfaces.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).cursor),
    ),
  });
  expect(await surfaces.count()).toBe(3);
  await surfaces.first().hover();
  expect(await cursors()).toEqual({
    background: "default",
    notes: ["default", "default", "default"],
  });
  await page.getByRole("button", { name: "手のひらツール" }).click();
  await surfaces.first().hover();
  expect(await cursors()).toEqual({
    background: "grab",
    notes: ["grab", "grab", "grab"],
  });
  await page.getByRole("button", { name: "選択ツール" }).click();
  await surfaces.first().hover();
  expect(await cursors()).toEqual({
    background: "default",
    notes: ["default", "default", "default"],
  });
});

test("選択ツールのマイ付箋も矢印カーソルを表示する", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-private&viewMode=story`,
  );
  await page.getByRole("button", { name: "マイ付箋を開く" }).click();
  const surface = page
    .getByTestId("private-notes-toolbar")
    .locator("[data-canvas-note-surface='true']")
    .first();
  await surface.waitFor();
  await surface.hover();
  expect(await surface.evaluate((el) => getComputedStyle(el).cursor)).toBe(
    "default",
  );
});

test("AT-006/008: group背景で3枚を囲みShiftで解除し、handは付箋を動かさない", async () => {
  const before = await transform();
  const stack = await page
    .getByTestId("note-card")
    .evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).style.zIndex),
    );
  await marqueeAll();
  await selectedCount(3);
  expect(await transform()).toBe(before);
  expect(
    await page
      .getByTestId("note-card")
      .evaluateAll((cards) =>
        cards.map((card) => (card as HTMLElement).style.zIndex),
      ),
  ).toEqual(stack);
  const note = page.getByTestId("note-card").nth(1);
  await note
    .getByRole("button", { name: "付箋", exact: true })
    .click({ modifiers: ["Shift"] });
  await selectedCount(2);
  await note
    .getByRole("button", { name: "付箋", exact: true })
    .click({ modifiers: ["Shift"] });
  await selectedCount(3);
  await page.getByRole("button", { name: "手のひらツール" }).click();
  const positions = await page
    .getByTestId("note-card")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("style")));
  const bounds = await note.boundingBox();
  if (!bounds) throw new Error("付箋が見つかりません");
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 90, { steps: 5 });
  await page.mouse.up();
  expect(await transform()).not.toBe(before);
  expect(
    await page
      .getByTestId("note-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("style"))),
  ).toEqual(positions);
  await selectedCount(3);
  await page.getByTestId("board-scroller").focus();
  await page.keyboard.press("Escape");
  await selectedCount(0);
  expect(
    await page
      .getByRole("button", { name: "手のひらツール" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await page.keyboard.press("Escape");
  expect(
    await page
      .getByRole("button", { name: "選択ツール" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

test("AT-004/009: 矩形中はwheel・Hを処理せずEscapeは開始前選択に戻す", async () => {
  await page
    .getByTestId("note-card")
    .first()
    .getByRole("button", { name: "付箋", exact: true })
    .click();
  await selectedCount(1);
  const before = await transform();
  // fit 後の付箋位置に依存せず、キャンバスの空白から矩形を開始する。
  const start = await page.getByTestId("board-scroller").evaluate((el) => {
    const box = el.getBoundingClientRect();
    for (let y = box.bottom - 200; y > box.top + 80; y -= 40) {
      for (let x = box.right - 300; x > box.left + 400; x -= 40) {
        const hit = document.elementFromPoint(x, y);
        if (
          hit instanceof HTMLElement &&
          hit.dataset.canvasBackground === "true"
        )
          return { x, y };
      }
    }
    throw new Error("矩形選択を開始できる空白がありません");
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 100, start.y - 100, { steps: 5 });
  await page.getByTestId("canvas-marquee").waitFor();
  await page.keyboard.press("h");
  await page.mouse.wheel(0, 100);
  expect(await transform()).toBe(before);
  expect(
    await page
      .getByRole("button", { name: "選択ツール" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await selectedCount(1);
  expect(await page.getByTestId("canvas-marquee").count()).toBe(0);
});

test("AT-008/010: 選択付箋のSpaceはpanだけ、hは本文末尾の文字", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-sharing&viewMode=story`,
  );
  await page.getByTestId("note-card").first().waitFor();
  const note = page.getByTestId("note-card").first();
  await note.getByRole("button", { name: "付箋", exact: true }).click();
  const text = await note.locator("textarea").inputValue();
  const position = await note.getAttribute("style");
  const before = await transform();
  const box = await note.boundingBox();
  if (!box) throw new Error("付箋が見つかりません");
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 80, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await transform()).not.toBe(before);
  expect(await note.getAttribute("style")).toBe(position);
  expect(await note.locator("textarea").inputValue()).toBe(text);
  await note.getByRole("button", { name: "付箋", exact: true }).focus();
  await page.keyboard.press("h");
  expect(await note.locator("textarea").inputValue()).toBe(`${text}h`);
  expect(
    await page
      .getByRole("button", { name: "選択ツール" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await page.keyboard.press("Escape");
  await selectedCount(1);
});

test.each([
  25, 100, 200,
])("AT-003: zoom%s%%の描画矩形で付箋を対象にできる", async (zoom) => {
  await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
  await page.getByTestId("board-scroller").evaluate((viewport, zoom) => {
    viewport.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 640,
        clientY: 360,
        ctrlKey: true,
        deltaY: -Math.log(zoom / 100) / 0.002,
      }),
    );
  }, zoom);
  await expect
    .poll(() =>
      page.getByRole("button", { name: "ズームを100%に戻す" }).innerText(),
    )
    .toBe(`${zoom}%`);
  const note = page.getByTestId("note-card").nth(1);
  const box = await note.boundingBox();
  if (!box) throw new Error("付箋が見つかりません");
  // 矩形の始点は対象の右下の空白。小さな交差でも対象に含まれる。
  await page.mouse.move(box.x + box.width + 10, box.y + box.height + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, {
    steps: 4,
  });
  await page.mouse.up();
  expect(await note.getAttribute("data-selected")).toBe("true");
});

test("AT-023: 390pxでもツール入口とnative Spaceを維持する", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const hand = page.getByRole("button", { name: "手のひらツール" });
  await hand.focus();
  await page.keyboard.press("Space");
  expect(await hand.getAttribute("aria-pressed")).toBe("true");
  const box = await hand.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  const viewport = page.getByTestId("board-scroller");
  await viewport.focus();
  await page.keyboard.press("v");
  expect(
    await page
      .getByRole("button", { name: "選択ツール" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

test("AT-024: Chromiumのtouch入力は空白panとtap選択を保ち、矩形に置換しない", async () => {
  const touchPage = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    hasTouch: true,
  });
  try {
    await touchPage.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-interaction&viewMode=story`,
    );
    await touchPage.getByTestId("note-card").first().waitFor();
    const before = await touchPage
      .getByTestId("board-canvas")
      .getAttribute("style");
    const cdp = await touchPage.context().newCDPSession(touchPage);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 1000, y: 400 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 1050, y: 450 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => touchPage.getByTestId("board-canvas").getAttribute("style"))
      .not.toBe(before);
    expect(await touchPage.getByTestId("canvas-marquee").count()).toBe(0);
    const note = touchPage.getByTestId("note-card").first();
    await note.getByRole("button", { name: "付箋", exact: true }).tap();
    expect(await note.getAttribute("data-selected")).toBe("true");
  } finally {
    await touchPage.close();
  }
});

for (const focusTarget of ["body", "toolbar"] as const) {
  test(`AT-004: private dragの${focusTarget} focusからEscapeは1段取消し後続dropで共有しない`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-private&viewMode=story`,
    );
    await page.getByTestId("note-card").first().waitFor();
    await page.getByRole("button", { name: "マイ付箋を開く" }).click();
    const privateCard = page
      .getByTestId("private-notes-list")
      .getByTestId("note-card");
    await privateCard
      .getByRole("button", { name: "付箋", exact: true })
      .focus();
    const box = await privateCard.boundingBox();
    if (!box) throw new Error("マイ付箋が必要");
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 50, { steps: 4 });
    await expect
      .poll(() => page.getByTestId("private-note-drag-preview").count())
      .toBe(1);
    expect(
      await page.evaluate(() => document.activeElement === document.body),
    ).toBe(true);
    if (focusTarget === "toolbar")
      await page.getByTestId("private-notes-scroll").evaluate((el) => {
        el.tabIndex = -1;
        el.focus();
      });
    await page.keyboard.press("Escape");
    await expect
      .poll(() => page.getByTestId("private-note-drag-preview").count())
      .toBe(0);
    await expect
      .poll(() => privateCard.getAttribute("data-selected"))
      .toBe("true");
    expect(
      await page.getByRole("button", { name: "手のひらツール" }).isEnabled(),
    ).toBe(true);
    const viewport = await page.getByTestId("board-scroller").boundingBox();
    if (!viewport) throw new Error("共有canvasが必要");
    await page.mouse.move(
      viewport.x + viewport.width / 2,
      viewport.y + viewport.height / 2,
      { steps: 3 },
    );
    await page.mouse.up();
    expect(await privateCard.count()).toBe(1);
    expect(
      await page.getByTestId("board-scroller").getByTestId("note-card").count(),
    ).toBe(3);
    await page.getByRole("button", { name: "手のひらツール" }).click();
    expect(
      await page
        .getByRole("button", { name: "手のひらツール" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
}

for (const source of ["palette", "sticker"] as const) {
  test(`AT-002/004: ${source}の所有capture喪失は票を保ち古いup/clickを捨て、新pressを受理する`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-voting&viewMode=story`,
    );
    const palette = page.getByRole("button", { name: /客観シール 残り/ });
    await palette.waitFor();
    const sticker = page
      .getByRole("button", { name: "客観シール 1票を1票取り消す" })
      .first();
    const countBefore = await page
      .getByRole("button", { name: "客観シール 1票を1票取り消す" })
      .count();
    const owner = source === "palette" ? palette : sticker;
    await owner.evaluate((el) => {
      el.addEventListener("gotpointercapture", (event) => {
        el.dataset.ownerPointer = String((event as PointerEvent).pointerId);
      });
      el.addEventListener("lostpointercapture", (event) => {
        el.dataset.lostPointer = String((event as PointerEvent).pointerId);
      });
    });
    const box = await owner.boundingBox();
    if (!box) throw new Error("vote ownerが必要");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 30,
      box.y + box.height / 2 + 15,
      { steps: 4 },
    );
    const hand = page.getByRole("button", { name: "手のひらツール" });
    expect(await hand.isDisabled()).toBe(true);
    await owner.evaluate((el) => {
      el.dispatchEvent(
        new PointerEvent("lostpointercapture", {
          bubbles: true,
          pointerId: Number(el.dataset.ownerPointer) + 1,
        }),
      );
    });
    expect(await hand.isDisabled()).toBe(true);
    await owner.evaluate((el) => {
      const id = Number(el.dataset.ownerPointer);
      if (!el.hasPointerCapture(id)) throw new Error("所有captureが必要");
      el.releasePointerCapture(id);
    });
    await page.mouse.move(
      box.x + box.width / 2 + 35,
      box.y + box.height / 2 + 15,
    );
    await expect
      .poll(() =>
        owner.evaluate(
          (el) => el.dataset.lostPointer === el.dataset.ownerPointer,
        ),
      )
      .toBe(true);
    await expect.poll(() => hand.isEnabled()).toBe(true);
    await page.mouse.up();
    await owner.evaluate((el) => {
      for (let duplicate = 0; duplicate < 2; duplicate++)
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(
      await page
        .getByRole("button", { name: "客観シール 1票を1票取り消す" })
        .count(),
    ).toBe(countBefore);
    expect(await palette.getAttribute("aria-pressed")).toBe("false");
    await palette.focus();
    await page.keyboard.press("Enter");
    expect(await palette.getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press("Space");
    expect(await palette.getAttribute("aria-pressed")).toBe("false");
    await palette.click();
    expect(await palette.getAttribute("aria-pressed")).toBe("true");
  });
}

test("AT-002: private閾値前mouse press中はnative tool activationを受理せず取消後に再操作できる", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-private&viewMode=story`,
  );
  await page.getByRole("button", { name: "マイ付箋を開く" }).click();
  const surface = page
    .getByTestId("private-notes-list")
    .getByRole("button", { name: "付箋", exact: true });
  await surface.focus();
  const box = await surface.boundingBox();
  if (!box) throw new Error("private surfaceが必要");
  const camera = await transform();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  const hand = page.getByRole("button", { name: "手のひらツール" });
  expect(await hand.isDisabled()).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  expect(await hand.getAttribute("aria-pressed")).toBe("false");
  await page.mouse.move(box.x + 65, box.y + 50, { steps: 4 });
  await expect
    .poll(() => page.getByTestId("private-note-drag-preview").count())
    .toBe(1);
  expect(await transform()).toBe(camera);
  await page.getByTestId("private-notes-scroll").evaluate((el) => {
    el.tabIndex = -1;
    el.focus();
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => hand.isEnabled()).toBe(true);
  expect(
    await page
      .getByTestId("private-notes-list")
      .getByTestId("note-card")
      .count(),
  ).toBe(1);
  await hand.click();
  expect(await hand.getAttribute("aria-pressed")).toBe("true");
});

test("AT-002/024: private第一touchの所有中はcanvas第二touchをpanへ渡さない", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--canvas-input-private&viewMode=story`,
  );
  await page.getByRole("button", { name: "マイ付箋を開く" }).click();
  const surface = page
    .getByTestId("private-notes-list")
    .getByRole("button", { name: "付箋", exact: true });
  const box = await surface.boundingBox();
  if (!box) throw new Error("private surfaceが必要");
  const camera = await transform();
  const cdp = await page.context().newCDPSession(page);
  const first = { x: box.x + 20, y: box.y + 20, id: 91 };
  const second = { x: 1000, y: 400, id: 92 };
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    expect(
      await page.getByRole("button", { name: "手のひらツール" }).isDisabled(),
    ).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first, second],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...first, x: first.x + 40, y: first.y + 30 },
        { ...second, x: second.x + 50, y: second.y + 40 },
      ],
    });
    await expect
      .poll(() => page.getByTestId("private-note-drag-preview").count())
      .toBe(1);
    expect(await transform()).toBe(camera);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...first, x: first.x + 45, y: first.y + 35 },
        { ...second, x: second.x + 100, y: second.y + 80 },
      ],
    });
    expect(await transform()).toBe(camera);
    await page.getByTestId("board-scroller").focus();
    await page.keyboard.press("Escape");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await page.getByTestId("private-note-drag-preview").count()).toBe(0);
    expect(
      await page
        .getByTestId("private-notes-list")
        .getByTestId("note-card")
        .count(),
    ).toBe(1);
    expect(
      await page.getByTestId("board-scroller").getByTestId("note-card").count(),
    ).toBe(3);
    expect(
      await page.getByRole("button", { name: "手のひらツール" }).isEnabled(),
    ).toBe(true);
  } finally {
    await cdp.detach();
  }
});

for (const tool of ["選択ツール", "手のひらツール"] as const) {
  test(`AT-023: ${tool}中の本人シールnative Spaceは1回取消しcameraを動かさない`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-voting&viewMode=story`,
    );
    const sticker = page.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    await sticker.waitFor();
    await sticker.evaluate((el) => {
      el.addEventListener("click", () => {
        document.body.dataset.stickerClicks = String(
          Number(document.body.dataset.stickerClicks ?? 0) + 1,
        );
      });
    });
    await page.getByRole("button", { name: tool }).click();
    const camera = await transform();
    await sticker.focus();
    await page.keyboard.press("Space");
    await expect.poll(() => sticker.count()).toBe(0);
    expect(await page.evaluate(() => document.body.dataset.stickerClicks)).toBe(
      "1",
    );
    expect(
      await page.getByRole("button", { name: "客観シール 残り3票" }).count(),
    ).toBe(1);
    expect(await transform()).toBe(camera);
  });
}

for (const releaseFirst of ["first", "second"] as const) {
  test(`AT-002/024: note第一touchとpalette第二touchは${releaseFirst}先解放でも単一所有`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-voting&viewMode=story`,
    );
    const cards = page.getByTestId("note-card");
    const surface = cards
      .nth(1)
      .getByRole("button", { name: "付箋", exact: true });
    const palette = page.getByRole("button", { name: "客観シール 残り2票" });
    await palette.waitFor();
    const a = await surface.boundingBox();
    const b = await palette.boundingBox();
    const c = await cards.nth(2).boundingBox();
    if (!a || !b || !c) throw new Error("touch対象のboundsが必要");
    await surface.evaluate((el) =>
      el.addEventListener("pointerdown", (event) => {
        (el as HTMLElement).dataset.pointerId = String(
          (event as PointerEvent).pointerId,
        );
      }),
    );
    await palette.evaluate((el) =>
      el.addEventListener(
        "pointerdown",
        (event) => {
          (el as HTMLElement).dataset.pointerId = String(
            (event as PointerEvent).pointerId,
          );
        },
        { capture: true },
      ),
    );
    await page.evaluate(() =>
      document.addEventListener(
        "pointerdown",
        (event) => {
          if ((event.target as Element).closest("[data-vote-palette]")) {
            document.body.dataset.rejectedPointerId = String(event.pointerId);
            (event.target as HTMLElement).dataset.rejectedTarget = "true";
          }
        },
        { capture: true },
      ),
    );
    const cdp = await page.context().newCDPSession(page);
    const first = { id: 111, x: a.x + 20, y: a.y + 20 };
    const second = { id: 112, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const moved = { ...second, x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const camera = await transform();
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [first],
      });
      expect(
        await surface.evaluate((el) =>
          el.hasPointerCapture(Number((el as HTMLElement).dataset.pointerId)),
        ),
      ).toBe(true);
      await palette.focus();
      await page.keyboard.press("Enter");
      expect(await palette.getAttribute("aria-pressed")).toBe("false");
      await page.keyboard.press("Space");
      expect(await palette.getAttribute("aria-pressed")).toBe("false");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [first, second],
      });
      const rejectedId = await page.evaluate(() =>
        Number(document.body.dataset.rejectedPointerId),
      );
      expect(rejectedId).toBeGreaterThan(0);
      expect(
        await palette.evaluate(
          (el, id) => el.hasPointerCapture(id),
          rejectedId,
        ),
      ).toBe(false);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [first, moved],
      });
      expect(await page.locator("[data-state='preview']").count()).toBe(0);
      expect(
        await page
          .locator("[data-rejected-target]")
          .evaluate((el, id) => el.hasPointerCapture(id), rejectedId),
      ).toBe(false);
      expect(
        await surface.evaluate((el) =>
          el.hasPointerCapture(Number((el as HTMLElement).dataset.pointerId)),
        ),
      ).toBe(true);
      expect(await transform()).toBe(camera);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: releaseFirst === "first" ? [first] : [moved],
      });
      if (releaseFirst === "second") {
        expect(
          await page
            .getByRole("button", { name: "手のひらツール" })
            .isDisabled(),
        ).toBe(true);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await selectedCount(1);
      expect(await cards.nth(1).getAttribute("data-selected")).toBe("true");
      expect(await page.locator("[data-state='preview']").count()).toBe(0);
      expect(await cards.nth(2).locator("[data-vote-sticker-id]").count()).toBe(
        0,
      );
      expect(await palette.count()).toBe(1);
      await palette.evaluate(
        (el, id) =>
          el.dispatchEvent(
            new PointerEvent("click", {
              bubbles: true,
              cancelable: true,
              detail: 1,
              pointerId: id,
            }),
          ),
        rejectedId,
      );
      await cards.nth(2).evaluate(
        (el, id) =>
          el.dispatchEvent(
            new PointerEvent("click", {
              bubbles: true,
              cancelable: true,
              detail: 1,
              pointerId: id,
            }),
          ),
        rejectedId,
      );
      expect(await palette.getAttribute("aria-pressed")).toBe("false");
      expect(await cards.nth(2).locator("[data-vote-sticker-id]").count()).toBe(
        0,
      );
      await palette.focus();
      await page.keyboard.press("Enter");
      expect(await palette.getAttribute("aria-pressed")).toBe("true");
      await page.keyboard.press("Space");
      expect(await palette.getAttribute("aria-pressed")).toBe("false");
      await page.mouse.move(second.x, second.y);
      await page.mouse.down();
      await page.mouse.move(moved.x, moved.y, { steps: 5 });
      await expect
        .poll(() => page.locator("[data-state='preview']").count())
        .toBe(1);
      await page.mouse.up();
      await expect
        .poll(() => cards.nth(2).locator("[data-vote-sticker-id]").count())
        .toBe(1);
      expect(
        await page.getByRole("button", { name: "客観シール 残り1票" }).count(),
      ).toBe(1);
      expect(
        await page.getByRole("button", { name: "手のひらツール" }).isEnabled(),
      ).toBe(true);
    } finally {
      await cdp.detach();
    }
  });
}

for (const key of ["Enter", "Space"] as const) {
  test(`CI-IN002: active sticker drag中の別note ${key}は配送せず正当drop後は投票可能`, async () => {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-voting&viewMode=story`,
    );
    const palette = page.getByRole("button", { name: "客観シール 残り2票" });
    await palette.click();
    const owner = page.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    const cards = page.getByTestId("note-card");
    const surface = cards.nth(2).getByRole("button", { name: /付箋/ });
    const a = await owner.boundingBox();
    const b = await cards.nth(2).boundingBox();
    if (!a || !b) throw new Error("投票drag boundsが必要");
    await owner.evaluate((el) =>
      el.addEventListener("gotpointercapture", (event) => {
        el.dataset.pointerId = String((event as PointerEvent).pointerId);
      }),
    );
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
    await expect
      .poll(() => page.locator("[data-state='preview']").count())
      .toBe(1);
    await surface.focus();
    await surface.evaluate((el) => {
      el.addEventListener(
        "keydown",
        (event) => {
          queueMicrotask(() => {
            el.dataset.nativeKeyPrevented = String(event.defaultPrevented);
          });
        },
        { capture: true },
      );
    });
    for (const shortcut of ["Control+Enter", "Meta+Space", "F10"] as const) {
      await page.keyboard.press(shortcut);
      expect(await surface.getAttribute("data-native-key-prevented")).toBe(
        "false",
      );
      expect(await cards.nth(2).locator("[data-vote-sticker-id]").count()).toBe(
        0,
      );
    }
    await page.keyboard.press(key);
    expect(await cards.nth(2).locator("[data-vote-sticker-id]").count()).toBe(
      0,
    );
    expect(await palette.count()).toBe(1);
    expect(
      await owner.evaluate((el) =>
        el.hasPointerCapture(Number(el.dataset.pointerId)),
      ),
    ).toBe(true);
    expect(await page.locator("[data-state='preview']").count()).toBe(1);
    expect(
      await page.getByRole("button", { name: "手のひらツール" }).isDisabled(),
    ).toBe(true);
    await page.keyboard.down("Control");
    await page.keyboard.down("Space");
    expect(await surface.getAttribute("data-native-key-prevented")).toBe(
      "false",
    );
    await page.mouse.up();
    await page.keyboard.up("Space");
    await page.keyboard.up("Control");
    await expect
      .poll(() => cards.nth(2).locator("[data-vote-sticker-id]").count())
      .toBe(1);
    expect(await cards.first().locator("[data-vote-sticker-id]").count()).toBe(
      0,
    );
    expect(await palette.count()).toBe(1);
    expect(await page.getByTestId("vote-stamp-cursor").count()).toBe(1);
    expect(
      await page.getByRole("button", { name: "手のひらツール" }).isEnabled(),
    ).toBe(true);
    await surface.focus();
    await page.keyboard.press(key);
    await expect
      .poll(() => cards.nth(2).locator("[data-vote-sticker-id]").count())
      .toBe(2);
    expect(
      await page.getByRole("button", { name: "客観シール 残り1票" }).count(),
    ).toBe(1);
  });
}

for (const gesture of ["pan", "note-drag"] as const) {
  for (const key of ["Enter", "Space"] as const) {
    test(`CI-PHASE002: ${gesture}所有中の採用${key}と遅延Spaceは0、freshは1`, async () => {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--canvas-input-adoption&viewMode=story`,
      );
      await page
        .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
        .click();
      const targets = page.locator("[data-adopt-target]");
      const target = targets.nth(1);
      const camera = await transform();
      const viewport = page.getByTestId("board-scroller");
      await viewport.evaluate((el) =>
        el.addEventListener("gotpointercapture", (event) => {
          el.dataset.ownerPointer = String((event as PointerEvent).pointerId);
        }),
      );
      const beforeNotes = await page
        .getByTestId("note-card")
        .evaluateAll((cards) =>
          cards.map((card) => card.parentElement?.getAttribute("style")),
        );
      if (gesture === "pan") {
        await page.getByTestId("board-scroller").focus();
        await page.keyboard.down("Space");
        await page.mouse.move(1100, 400);
        await page.mouse.down();
        await page.mouse.move(1150, 440, { steps: 5 });
        expect(await transform()).not.toBe(camera);
      } else {
        const box = await targets.first().boundingBox();
        if (!box) throw new Error("採用drag対象が必要");
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 70, box.y + 60, { steps: 5 });
        expect(await transform()).toBe(camera);
      }
      const hand = page.getByRole("button", { name: "手のひらツール" });
      await expect.poll(() => hand.isDisabled()).toBe(true);
      await target.focus();
      if (gesture === "pan" && key === "Space")
        await page.keyboard.down("Space");
      else await page.keyboard.press(key);
      expect(
        await page.getByTestId("canvas-input-adoption-count").textContent(),
      ).toBe("0");
      expect(await targets.count()).toBe(3);
      expect(await hand.isDisabled()).toBe(true);
      expect(
        await viewport.evaluate((el) =>
          el.hasPointerCapture(Number(el.dataset.ownerPointer)),
        ),
      ).toBe(true);
      await page.keyboard.down("Control");
      await page.keyboard.down("Space");
      await page.mouse.up();
      await page.keyboard.up("Space");
      await page.keyboard.up("Control");
      expect(
        await page.getByTestId("canvas-input-adoption-count").textContent(),
      ).toBe("0");
      expect(await targets.count()).toBe(3);
      await expect.poll(() => hand.isEnabled()).toBe(true);
      if (gesture === "pan") {
        expect(
          await page
            .getByTestId("note-card")
            .evaluateAll((cards) =>
              cards.map((card) => card.parentElement?.getAttribute("style")),
            ),
        ).toEqual(beforeNotes);
      } else {
        expect(
          await page
            .getByTestId("note-card")
            .first()
            .evaluate((card) => card.parentElement?.getAttribute("style")),
        ).not.toBe(beforeNotes[0]);
      }
      await target.focus();
      await page.keyboard.press(key);
      await expect
        .poll(() =>
          page.getByTestId("canvas-input-adoption-count").textContent(),
        )
        .toBe("1");
      expect(await targets.count()).toBe(0);
    });
  }
}

test.each([
  { width: 1280, height: 720 },
  { width: 390, height: 720 },
  { width: 1280, height: 400 },
])("$width×$heightで操作ヒント全文へ到達し、選択を維持してEscapeだけ閉じる", async (size) => {
  await page.setViewportSize(size);
  await page.reload();
  await page.getByTestId("note-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const note of await page.getByTestId("note-card").all()) {
    await note
      .getByRole("button", { name: "付箋", exact: true })
      .click({ modifiers: ["Shift"] });
  }
  await selectedCount(3);
  const summary = page.getByLabel("キャンバス操作のヒント", { exact: true });
  await summary.click();
  const panel = page.getByTestId("canvas-operation-help");
  const bounds = await panel.boundingBox();
  if (!bounds) throw new Error("操作ヒントが表示されていません");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
  expect(
    await panel.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    ),
  ).toBeGreaterThanOrEqual(14);
  await panel.focus();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  const before = await transform();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => panel.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await transform()).toBe(before);
  const last = panel.getByText("では削除しません。", { exact: false });
  await last.scrollIntoViewIfNeeded();
  expect(
    await last.evaluate((el) => {
      const content = el.getBoundingClientRect();
      const container = el.closest("section")?.getBoundingClientRect();
      return (
        !!container &&
        content.top >= container.top &&
        content.bottom <= container.bottom
      );
    }),
  ).toBe(true);
  // CTAの上でも本文を実際に操作できることを確認する。
  await last.click();
  expect(await panel.isVisible()).toBe(true);
  await panel.focus();
  await page.keyboard.press("Escape");
  expect(await panel.isVisible()).toBe(false);
  expect(await summary.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
  await selectedCount(3);
  const announcement = page
    .getByTestId("canvas-zoom-hud")
    .locator('[aria-live="polite"]')
    .filter({ hasText: "選択した付箋：3枚" });
  expect(await announcement.count()).toBe(1);
  expect(
    await announcement.evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1);
});

test("外側の付箋・ツール・wheel・panはヒントを閉じて同じ操作を実行する", async () => {
  const summary = page.getByLabel("キャンバス操作のヒント", { exact: true });
  const panel = page.getByTestId("canvas-operation-help");
  await summary.click();
  await page
    .getByTestId("note-card")
    .first()
    .getByRole("button", { name: "付箋", exact: true })
    .click();
  expect(await panel.isVisible()).toBe(false);
  await selectedCount(1);
  await summary.click();
  const hand = page.getByRole("button", { name: "手のひらツール" });
  await hand.click();
  expect(await panel.isVisible()).toBe(false);
  expect(await hand.getAttribute("aria-pressed")).toBe("true");
  await summary.click();
  const beforeWheel = await transform();
  await page.mouse.move(1100, 400);
  await page.mouse.wheel(0, 120);
  await expect.poll(transform).not.toBe(beforeWheel);
  expect(await panel.isVisible()).toBe(false);
  await summary.click();
  await panel.focus();
  const beforePan = await transform();
  await page.mouse.move(1100, 400);
  await page.mouse.down();
  await page.mouse.move(1160, 430, { steps: 5 });
  await page.mouse.up();
  await expect.poll(transform).not.toBe(beforePan);
  expect(await panel.isVisible()).toBe(false);
  expect(await summary.evaluate((el) => el === document.activeElement)).toBe(
    false,
  );
});

test("短高ヒントのArrow/Pageはnative読書に届き、HUDボタンのカメラ操作は維持する", async () => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.reload();
  await page.getByTestId("note-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const note of await page.getByTestId("note-card").all()) {
    await note
      .getByRole("button", { name: "付箋", exact: true })
      .click({ modifiers: ["Shift"] });
  }
  await selectedCount(3);
  const summary = page.getByLabel("キャンバス操作のヒント", { exact: true });
  await summary.click();
  const panel = page.getByTestId("canvas-operation-help");
  const bounds = await panel.boundingBox();
  if (!bounds) throw new Error("操作ヒントが表示されていません");
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
  const beforeCamera = await transform();
  for (const key of ["PageDown", "PageUp", "ArrowDown", "ArrowUp"]) {
    const down = key.endsWith("Down");
    await panel.evaluate(
      async (el, initial) => {
        if (el.scrollTop === initial) return;
        const resetCompleted = new Promise<void>((resolve) => {
          el.addEventListener("scrollend", () => resolve(), { once: true });
        });
        el.scrollTo({ top: initial, behavior: "instant" });
        // 位置の再設定によるscrollendを、次のキーの完了と混同しない。
        await resetCompleted;
      },
      down ? 0 : 200,
    );
    const beforeScroll = await panel.evaluate((el) => el.scrollTop);
    await panel.focus();
    // キーを送る前にlistenerの登録完了を待つ。
    await panel.evaluate((el) => {
      el.dataset.scrollCompleted = "false";
      el.addEventListener(
        "scrollend",
        () => {
          el.dataset.scrollCompleted = "true";
        },
        { once: true },
      );
    });
    await page.keyboard.press(key);
    // 前キーのnative smooth scrollが完了してから次の読書位置へ戻す。
    await expect
      .poll(() => panel.getAttribute("data-scroll-completed"))
      .toBe("true");
    const afterScroll = await panel.evaluate((el) => el.scrollTop);
    if (down) expect(afterScroll).toBeGreaterThan(beforeScroll);
    else expect(afterScroll).toBeLessThan(beforeScroll);
    expect(await transform()).toBe(beforeCamera);
    expect(await panel.isVisible()).toBe(true);
  }
  await page.keyboard.press("Escape");
  expect(await panel.isVisible()).toBe(false);
  expect(await summary.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
  await selectedCount(3);
  await page.getByRole("button", { name: "キャンバスを縮小" }).focus();
  for (const key of ["ArrowDown", "PageDown"]) {
    const before = await transform();
    await page.keyboard.press(key);
    await expect.poll(transform).not.toBe(before);
  }
});
