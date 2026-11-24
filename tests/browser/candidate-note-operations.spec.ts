import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";
import { includeMobile } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ colorScheme: "dark" });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
}

test("重なった付箋から操作帯へ移動しても対象を切り替えず最前面で操作できる", async () => {
  await openStory("notes-notecard--overlapped-candidate-action");
  const target = page.locator('[data-note-id="target-note"]');
  const targetAction = page.locator(
    '[data-candidate-action-note-id="target-note"]',
  );
  const frontAction = page.locator(
    '[data-candidate-action-note-id="front-note"]',
  );
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  if (!targetBox) return;

  const start = { x: targetBox.x + 20, y: targetBox.y + 20 };
  await page.mouse.move(start.x, start.y);
  await expect
    .poll(() =>
      targetAction.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  const actionBox = await targetAction.boundingBox();
  expect(actionBox).not.toBeNull();
  if (!actionBox) return;
  const end = {
    x: actionBox.x + actionBox.width / 2,
    y: actionBox.y + actionBox.height / 2,
  };

  for (let step = 1; step <= 20; step += 1) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * step) / 20,
      start.y + ((end.y - start.y) * step) / 20,
    );
    await page.waitForTimeout(20);
  }

  expect(
    await targetAction.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  expect(
    await frontAction.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");
  expect(
    await targetAction.evaluate(
      (element) =>
        document.elementFromPoint(
          element.getBoundingClientRect().left +
            element.getBoundingClientRect().width / 2,
          element.getBoundingClientRect().top +
            element.getBoundingClientRect().height / 2,
        ) === element,
    ),
  ).toBe(true);

  const targetSurface = target.getByRole("button", { name: "付箋" });
  const frontSurface = page
    .locator('[data-note-id="front-note"]')
    .getByRole("button", { name: "付箋" });
  await targetSurface.focus();
  await page.keyboard.press("Tab");
  expect(
    await targetAction.evaluate(
      (element) => element === document.activeElement,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await frontSurface.evaluate(
      (element) => element === document.activeElement,
    ),
  ).toBe(true);

  await page.evaluate(() => {
    const overlay = document.createElement("div");
    overlay.id = "test-dialog-layer";
    Object.assign(overlay.style, {
      inset: "0",
      pointerEvents: "auto",
      position: "fixed",
      zIndex: "50",
    });
    document.body.append(overlay);
  });
  expect(
    await targetAction.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      )?.id;
    }),
  ).toBe("test-dialog-layer");
});

test.skipIf(!includeMobile)(
  "タッチ端末では最後にタップした付箋だけ候補操作を表示する",
  async () => {
    await page.close();
    page = await browser.newPage({
      colorScheme: "dark",
      hasTouch: true,
      viewport: { height: 640, width: 480 },
    });
    await openStory("notes-notecard--multiple-candidate-actions-for-touch");
    const firstSurface = page
      .locator('[data-note-id="first-note"]')
      .getByRole("button", { name: "付箋" });
    const secondSurface = page
      .locator('[data-note-id="second-note"]')
      .getByRole("button", { name: "付箋" });
    const firstAction = page.locator(
      '[data-candidate-action-note-id="first-note"]',
    );
    const secondAction = page.locator(
      '[data-candidate-action-note-id="second-note"]',
    );
    const target = page
      .getByTestId("candidate-target-corner")
      .first()
      .locator("..");

    await firstAction.waitFor({ state: "attached" });
    expect(
      await firstAction.evaluate(
        (element) => getComputedStyle(element).opacity,
      ),
    ).toBe("0");
    expect(
      await target.evaluate((element) => getComputedStyle(element).opacity),
    ).toBe("0");

    await firstSurface.tap();

    await expect
      .poll(() =>
        firstAction.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    expect(
      await target.evaluate((element) => getComputedStyle(element).opacity),
    ).toBe("1");

    await secondSurface.tap();

    await expect
      .poll(() =>
        firstAction.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("0");
    expect(
      await secondAction.evaluate(
        (element) => getComputedStyle(element).opacity,
      ),
    ).toBe("1");
  },
);

test.skipIf(!includeMobile).each(["host", "participant"])(
  "候補外の付箋（%s）は実タッチで本文を読みやすくし、復帰可能な場合だけ操作を出す",
  async (role) => {
    await page.close();
    page = await browser.newPage({
      hasTouch: true,
      viewport: { width: 480, height: 640 },
    });
    await openStory(`notes-notecard--excluded-for-${role}`);
    await page.waitForFunction(
      () =>
        (
          window as unknown as {
            __STORYBOOK_PREVIEW__: { currentRender?: { phase: string } };
          }
        ).__STORYBOOK_PREVIEW__.currentRender?.phase === "finished",
    );
    const surface = page.getByRole("button", { name: "候補外の付箋" });
    const card = page.getByTestId("note-card");
    await surface.evaluate((element) => element.blur());
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("0.45");
    await surface.tap();
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("0.9");
    const restore = page.getByRole("button", { name: "候補に戻す" });
    if (role === "host") {
      await expect
        .poll(() =>
          restore.evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe("1");
    } else expect(await restore.count()).toBe(0);
  },
);
