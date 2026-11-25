import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { widths } from "./viewports";

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
      const hud = await page.getByTestId("board-control-hud").boundingBox();
      if (!hud) throw new Error("操作HUDがありません");
      expect(timer.y).toBeGreaterThanOrEqual(hud.y + hud.height + 11);
      const next = await page
        .getByRole("button", { name: "できた！", exact: true })
        .boundingBox();
      if (!next) throw new Error("進行ボタンがない");
      expect(next.x + next.width).toBeLessThan(width);
      await speaker.click();
      expect(await page.getByText("ホスト", { exact: true }).count()).toBe(0);
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
    expect(await page.getByRole("timer").textContent()).toBe("03:00");
    expect(
      await page
        .getByRole("button", { name: "できた！", exact: true })
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

  it.each(widths(1440, 900, 390))(
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

  it("人数が多くても今の発表者を枠内に見せ、並びを手で送るスクロール領域にしない", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-sharingpresenter--many-presenters&viewMode=story`,
      );
      const order = page.getByTestId("sharing-order");
      await order.waitFor();
      // Web フォントの読込で名前の幅が変わった後も枠内に残ることを確かめる。
      await page.evaluate(() => document.fonts.ready);
      const measure = () =>
        order.evaluate((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const current = element.querySelector('[data-current="true"]');
          if (!current) throw new Error("今の発表者がない");
          // アバターだけでなく「発表中」と名前のラベルまで枠内に入れる。
          const target = (
            current.parentElement ?? current
          ).getBoundingClientRect();
          return {
            // ボタンの中ではフォーカスを置けないため、axe の scrollable-region-focusable に当たる auto / scroll にしない。
            overflowX: style.overflowX,
            overflows: element.scrollWidth > element.clientWidth,
            currentInside:
              target.left >= box.left - 1 && target.right <= box.right + 1,
          };
        });
      const result = await measure();
      expect(result.overflows).toBe(true);
      expect(["auto", "scroll"]).not.toContain(result.overflowX);
      await expect.poll(async () => (await measure()).currentInside).toBe(true);
      // 画面の回転や縮小で枠が狭くなっても、手で送れない分を寄せ直して見せる。
      await page
        .getByRole("button", { name: "発表者と全体の順番を確認" })
        .evaluate((element) => {
          (element as HTMLElement).style.width = "180px";
        });
      await expect.poll(async () => (await measure()).currentInside).toBe(true);
    } finally {
      await page.close();
    }
  });

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
