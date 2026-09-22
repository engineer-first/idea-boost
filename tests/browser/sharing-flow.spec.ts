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
  it.each([
    1280, 768,
  ])("%ipxで発表者・タイマー・操作を重ねずに表示する", async (width) => {
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
  });
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
