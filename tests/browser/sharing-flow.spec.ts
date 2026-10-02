import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
describe("共有HUD", () => {
  it.each([1280, 768])(
    "%ipxで発表者・タイマー・操作を重ねずに表示する",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--sharing-active&viewMode=story`,
      );
      const speaker = page.getByRole("button", {
        name: "発表者と全体の順番を確認",
      });
      await speaker.waitFor();
      const box = await speaker.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(220);
      const timer = await page.getByTestId("room-timer").boundingBox();
      if (!box || !timer) throw new Error("共有HUDがない");
      expect(box.x + box.width).toBeLessThanOrEqual(timer.x);
      const next = await page
        .getByRole("button", { name: "次の人へ", exact: true })
        .boundingBox();
      if (!next) throw new Error("進行ボタンがない");
      expect(next.x + next.width).toBeLessThan(width);
      await speaker.click();
      expect(await page.getByText("進行役", { exact: true }).isVisible()).toBe(
        true,
      );
      await page.close();
    },
  );
  it("動きを減らす設定では交代案内を静止表示する", async () => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--sharing-transition&viewMode=story`,
    );
    const notice = page
      .getByRole("status")
      .filter({ hasText: "さんのターンです" });
    await notice.waitFor();
    expect(
      await notice.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toBe("none");
    expect(await page.getByRole("timer").innerText()).toBe("03:00");
    expect(
      await page
        .getByRole("button", { name: "次の人へ", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.close();
  });
});

describe("共有する人の表示", () => {
  it("同位置にいる別の操作者の名前を重ねない", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-remotecursor--long-name-at-same-position&viewMode=story`,
      );
      const cursors = page.locator("[data-testid^='remote-cursor-']");
      await cursors.first().waitFor({ state: "attached" });
      const labels = await cursors.evaluateAll((elements) =>
        elements.map((element) => {
          const label = element.querySelector("div");
          if (!label) throw new Error("名前ラベルがない");
          const { top, bottom } = label.getBoundingClientRect();
          return { top, bottom };
        }),
      );
      expect(labels).toHaveLength(2);
      expect(labels[1].top).toBeGreaterThanOrEqual(labels[0].bottom);
    } finally {
      await page.close();
    }
  });

  it.each([1440, 900, 390])(
    "%ipxで交代案内が現在地と発表者カードを覆わない",
    async (width) => {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardlayout--sharing-transition&viewMode=story`,
        );
        const notice = page
          .getByRole("status")
          .filter({ hasText: "さんのターンです" });
        await notice.waitFor();
        const box = await notice.boundingBox();
        if (!box) throw new Error("交代案内がない");
        for (const target of [
          page.getByTestId("board-context-hud"),
          page.getByTestId("board-control-hud"),
        ]) {
          const hud = await target.boundingBox();
          if (!hud) throw new Error("共有HUDがない");
          const overlaps =
            box.x < hud.x + hud.width &&
            box.x + box.width > hud.x &&
            box.y < hud.y + hud.height &&
            box.y + box.height > hud.y;
          expect(overlaps).toBe(false);
        }
      } finally {
        await page.close();
      }
    },
  );

  it.each([
    "room-sharingpresenter--ready",
    "room-sharingpresenter--active",
    "room-sharingannouncement--default",
  ])("%sを単体で描画できる", async (id) => {
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
      if (id.includes("sharingpresenter")) {
        await page
          .getByRole("button", { name: "発表者と全体の順番を確認" })
          .waitFor();
      } else {
        await page.getByRole("status").waitFor();
      }
    } finally {
      await page.close();
    }
  });
});
