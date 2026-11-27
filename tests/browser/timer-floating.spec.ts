import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { includeMobile, widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});
async function story(page: Page, id: string) {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.getByTestId("timer-floating").waitFor({ state: "attached" });
}
async function rect(page: Page, id: string) {
  const r = await page.getByTestId(id).boundingBox();
  if (!r) throw new Error(`${id}が表示されません`);
  return r;
}
/** 離した後、端へ寄る動きが終わってからの位置を読む */
async function settledTimer(page: Page) {
  await expect
    .poll(() =>
      page.getByTestId("timer-floating").getAttribute("data-snapping"),
    )
    .toBeNull();
  return rect(page, "timer-floating");
}
/** 作業領域（幅×高さ）のどれかの辺から12pxの所に接しているか */
function touchesEdge(
  r: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  return (
    near(r.x, 12) ||
    near(r.x + r.width, width - 12) ||
    near(r.y, 12) ||
    near(r.y + r.height, height - 12)
  );
}

test.each(widths(1280, 390))(
  "幅%dで時間切れ後の1分延長とドラッグを操作できる",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      hasTouch: width === 390,
    });
    try {
      await story(page, "room-roomtimer--interactive");
      const circle = page.getByTestId("room-timer");
      await circle.click();
      expect(await circle.getAttribute("data-status")).toBe("running");
      await circle.click();
      expect(await circle.getAttribute("data-status")).toBe("running");
      const extend = page.getByRole("button", { name: "＋1分" });
      await extend.waitFor();
      await expect
        .poll(async () => (await rect(page, "timer-floating")).width)
        .toBeCloseTo(112, 0);
      expect(await extend.locator("svg").count()).toBe(0);
      expect(
        await page
          .getByTestId("timer-floating")
          .evaluate((node) => node.getAnimations({ subtree: true }).length),
      ).toBe(0);
      const bounds = await rect(page, "timer-floating");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await extend.click();
      await circle.waitFor();
      expect(await circle.getAttribute("data-status")).toBe("running");
      await expect
        .poll(() => page.getByRole("timer").getAttribute("aria-label"))
        .toMatch(/00:5[0-9]|01:00/);
    } finally {
      await page.close();
    }
  },
);

test.each(widths(1280, 390))(
  "幅%dで実行中の円をドラッグしても一時停止しない",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await story(page, "room-roomtimer--interactive-running");
      const circle = page.getByTestId("room-timer");
      await circle.click();
      const before = await rect(page, "timer-floating");
      expect(before.width).toBeCloseTo(72);
      expect(before.height).toBeCloseTo(72);
      await page.mouse.move(before.x + 28, before.y + 28);
      await page.mouse.down();
      // 円の上で動かし始めてから運ぶ（最初の一歩で円の外へ出るとドラッグにならない）
      await page.mouse.move(before.x + 12, before.y + 44, { steps: 2 });
      await page.mouse.move(width / 2, 450, { steps: 20 });
      await page.mouse.up();
      // 画面中央で離すと、中央に残らず最寄りの端へ寄る
      const after = await settledTimer(page);
      expect(touchesEdge(after, width, 900)).toBe(true);
      expect(
        Math.abs(after.x - before.x) + Math.abs(after.y - before.y),
      ).toBeGreaterThan(100);
      expect(await circle.getAttribute("data-status")).toBe("running");
    } finally {
      await page.close();
    }
  },
);

test("延長後の時間切れでは空の円を表示しない", async () => {
  const page = await browser.newPage();
  try {
    await story(page, "room-roomtimer--ended-after-extension");
    expect(await page.getByRole("button", { name: "＋1分" }).count()).toBe(0);
    expect(await page.getByTestId("timer-floating").isVisible()).toBe(false);
  } finally {
    await page.close();
  }
});

test("工程の途中で操作欄が現れるとタイマーが避け、操作できる", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  try {
    await story(page, "room-roomboardlayout--phase-1-step-3");
    const before = await rect(page, "timer-floating");
    await page.getByTestId("room-board-view-root").evaluate((root, box) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.testid = "idea-map-size-controls-hud";
      button.textContent = "追加された操作欄";
      Object.assign(button.style, {
        position: "fixed",
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        zIndex: "40",
      });
      root.appendChild(button);
    }, before);
    const added = page.getByRole("button", { name: "追加された操作欄" });
    await expect
      .poll(async () => {
        const timer = await rect(page, "timer-floating");
        return (
          timer.x + timer.width <= before.x ||
          timer.x >= before.x + before.width ||
          timer.y + timer.height <= before.y ||
          timer.y >= before.y + before.height
        );
      })
      .toBe(true);
    await added.click();
    expect(
      await added.evaluate((element) => element === document.activeElement),
    ).toBe(true);
  } finally {
    await page.close();
  }
});

test.skipIf(!includeMobile)(
  "390pxの問い共有でタイマー下のマイ付箋が下部の操作欄を覆わない",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await story(page, "room-roomboardlayout--phase-2-step-2");
      const notes = await rect(page, "private-notes-toolbar");
      expect(notes.y + notes.height).toBeLessThanOrEqual(844);
      expect(
        await page.getByRole("textbox", { name: "付箋を書く" }).count(),
      ).toBe(0);
      await page.getByTestId("private-notes-scroll").hover();
    } finally {
      await page.close();
    }
  },
);

test.each(widths(1280, 768, 390))(
  "幅%dでHUD・タイマー・開いたマイ付箋を重ねず、移動先も画面内に収める",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await story(page, "room-roomboardview--floating-timer-running");
      const hud = await rect(page, "board-control-hud");
      const timer = await rect(page, "timer-floating");
      expect(timer.y).toBeGreaterThanOrEqual(hud.y + hud.height + 11);
      const openNotes = page.getByRole("button", {
        name: "マイ付箋を開く",
        exact: true,
      });
      if (await openNotes.count()) await openNotes.click();
      const notes = await rect(page, "private-notes-toolbar");
      expect(notes.y).toBeGreaterThanOrEqual(timer.y + timer.height + 11);
      await page.mouse.move(timer.x + 28, timer.y + 28);
      await page.mouse.down();
      await page.mouse.move(notes.x + 40, notes.y + 40, { steps: 12 });
      await page.mouse.up();
      const parked = await settledTimer(page);
      const overlaps =
        parked.x < notes.x + notes.width &&
        parked.x + parked.width > notes.x &&
        parked.y < notes.y + notes.height &&
        parked.y + parked.height > notes.y;
      expect(overlaps).toBe(false);
      expect(parked.x).toBeGreaterThanOrEqual(0);
      expect(parked.x + parked.width).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  },
);

test.each(widths(1280, 1024))(
  "幅%dで上中央のステップ表示の近くで離しても、ステップ表示に重ねず端へ寄る",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await story(page, "room-roomboardview--floating-timer-running");
      const trail = await rect(page, "phase-step-trail");
      const timer = await rect(page, "timer-floating");
      await page.mouse.move(timer.x + 28, timer.y + 28);
      await page.mouse.down();
      await page.mouse.move(timer.x + 12, timer.y + 44, { steps: 2 });
      await page.mouse.move(
        trail.x + trail.width / 2,
        trail.y + trail.height + 60,
        { steps: 12 },
      );
      await page.mouse.up();
      const parked = await settledTimer(page);
      const overlaps =
        parked.x < trail.x + trail.width &&
        parked.x + parked.width > trail.x &&
        parked.y < trail.y + trail.height &&
        parked.y + parked.height > trail.y;
      expect(overlaps).toBe(false);
      const root = await rect(page, "room-board-view-root");
      expect(
        touchesEdge(
          { ...parked, x: parked.x - root.x, y: parked.y - root.y },
          root.width,
          root.height,
        ),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);

test.each(
  [
    "step-1-1-personal-writing",
    "guide-phase-2-step-1",
    "guide-phase-3-step-1",
  ].flatMap((id) => [
    [id, 1280, 800],
    [id, 1180, 820],
  ]) as [string, number, number][],
)(
  "%s（%d×%d）で円形タイマーがマイ付箋の枠に重ならない",
  async (id, width, height) => {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    try {
      await story(page, `room-roomboardview--${id}`);
      await page.getByTestId("private-notes-toolbar").waitFor();
      // 枠の上端は配置計算のあとで決まる。落ち着いた位置で比べる
      await expect
        .poll(async () => {
          const [timer, notes] = await Promise.all([
            rect(page, "timer-floating"),
            rect(page, "private-notes-toolbar"),
          ]);
          const apart =
            timer.y + timer.height <= notes.y ||
            timer.x >= notes.x + notes.width ||
            timer.x + timer.width <= notes.x ||
            timer.y >= notes.y + notes.height;
          return apart;
        })
        .toBe(true);
      // 重なりはタイマーではなく枠の側で避ける。タイマーは右上（HUD の下）のまま
      const [root, hud, timer] = await Promise.all([
        rect(page, "room-board-view-root"),
        rect(page, "board-control-hud"),
        rect(page, "timer-floating"),
      ]);
      expect(
        Math.abs(root.x + root.width - 12 - timer.x - timer.width),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(hud.y + hud.height + 12 - timer.y)).toBeLessThanOrEqual(
        1,
      );
    } finally {
      await page.close();
    }
  },
);

test.each([
  [1280, 800],
  [1180, 820],
] as [number, number][])(
  "2-1（%d×%d）でタイマーを一時停止しても、マイ付箋の枠は同じ位置で重ならない",
  async (width, height) => {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    try {
      const settledTop = async (id: string) => {
        await story(page, `room-roomboardview--${id}`);
        await page.getByTestId("private-notes-toolbar").waitFor();
        let top = Number.NaN;
        await expect
          .poll(async () => {
            const [timer, notes] = await Promise.all([
              rect(page, "timer-floating"),
              rect(page, "private-notes-toolbar"),
            ]);
            top = notes.y;
            return (
              timer.y + timer.height <= notes.y ||
              timer.x >= notes.x + notes.width ||
              timer.x + timer.width <= notes.x ||
              timer.y >= notes.y + notes.height
            );
          })
          .toBe(true);
        return top;
      };
      const running = await settledTop("guide-phase-2-step-1");
      const paused = await settledTop("guide-phase-2-step-1-paused");
      // 一時停止と再開で枠と付箋一覧が上下に跳ねない
      expect(Math.abs(paused - running)).toBeLessThanOrEqual(1);
    } finally {
      await page.close();
    }
  },
);

test("幅982pxでマイ付箋を開いてもタイマーを右上HUDの下に保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 982, height: 390 },
    reducedMotion: "reduce",
  });
  try {
    await story(page, "room-roomboardview--floating-timer-running");
    const openNotes = page.getByRole("button", {
      name: "マイ付箋を開く",
      exact: true,
    });
    if (await openNotes.count()) await openNotes.click();
    await expect
      .poll(async () => {
        const [root, timer] = await Promise.all([
          rect(page, "room-board-view-root"),
          rect(page, "timer-floating"),
        ]);
        return Math.abs(root.x + root.width - 12 - timer.x - timer.width);
      })
      .toBeLessThanOrEqual(1);
    const timer = await rect(page, "timer-floating");
    const hud = await rect(page, "board-control-hud");
    const notes = await rect(page, "private-notes-toolbar");
    expect(timer.y).toBeGreaterThanOrEqual(hud.y + hud.height + 11);
    expect(notes.y).toBeGreaterThanOrEqual(timer.y + timer.height + 11);
  } finally {
    await page.close();
  }
});

test.each(widths(1280, 900, 640, 390))(
  "幅%dの共有完了後は書き足しの確認と次への操作に到達できる",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--floating-timer-sharing-complete&viewMode=story`,
      );
      const controls = page.getByTestId("board-control-hud");
      await controls.waitFor();
      expect(await page.getByTestId("timer-floating").count()).toBe(0);
      for (const name of ["1-1に戻って書き足す", "次のステップへ"]) {
        const b = controls.getByRole("button", { name, exact: true });
        expect(await b.isVisible()).toBe(true);
        const r = await b.boundingBox();
        expect(r?.height).toBeGreaterThanOrEqual(40);
        expect(r?.x).toBeGreaterThanOrEqual(0);
        expect(r ? r.x + r.width : Infinity).toBeLessThanOrEqual(width);
        expect(
          await b.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              ),
            );
          }),
        ).toBe(true);
      }
      expect(
        await controls
          .getByRole("button", { name: "共有を続ける", exact: true })
          .count(),
      ).toBe(0);
      await controls
        .getByRole("button", { name: /^\d-1に戻って書き足す$/ })
        .click();
      const dialog = page.getByRole("alertdialog", {
        name: "全員で1-1に戻って、付箋を書き足しますか？",
      });
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect(bounds ? bounds.x + bounds.width : Infinity).toBeLessThanOrEqual(
        width,
      );
      for (const name of ["キャンセル", "1-1に戻って書き足す"]) {
        const action = dialog.getByRole("button", { name, exact: true });
        expect(await action.isVisible()).toBe(true);
        expect(
          await action.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await action.click({ trial: true });
      }
      await dialog.getByRole("button", { name: "キャンセル" }).press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await expect
        .poll(() =>
          controls
            .getByRole("button", { name: /^\d-1に戻って書き足す$/ })
            .evaluate((element) => document.activeElement === element),
        )
        .toBe(true);
    } finally {
      await page.close();
    }
  },
);

test("最後の発表者のできた後に上部から次の操作を選べる", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await story(page, "room-roomboardview--sharing-last-presenter");
    await page.getByRole("button", { name: "できた！", exact: true }).click();
    const controls = page.getByTestId("board-control-hud");
    await controls
      .getByRole("button", { name: /^\d-1に戻って書き足す$/ })
      .waitFor();
    expect(
      await controls
        .getByRole("button", { name: "共有を続ける", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await controls
        .getByRole("button", { name: "次のステップへ", exact: true })
        .isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByTestId("board-location-trigger")
        .getAttribute("aria-label"),
    ).toContain("課題共有");
    expect(await page.getByTestId("timer-floating").count()).toBe(0);
  } finally {
    await page.close();
  }
});
