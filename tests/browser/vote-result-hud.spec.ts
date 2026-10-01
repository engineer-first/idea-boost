import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
it.each([
  375, 640, 900, 1440,
])("%ipxで投票前・全員完了・結果の操作バーとavatar/timer位置を保つ", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    for (const result of [
      "vote-result-awaiting-decision",
      "idea-result-awaiting-decision",
    ]) {
      let reference: unknown;
      for (const story of [
        result.startsWith("idea") ? "idea-voting" : "voting-hud",
        result.startsWith("idea")
          ? "idea-voting-complete"
          : "voting-complete-hud",
        result,
      ]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardheader--${story}&viewMode=story`,
        );
        const hud = page.getByTestId("board-control-hud");
        await hud.waitFor();
        await page.evaluate(() => document.fonts.ready);
        await hud.evaluate(async (element) => {
          await new Promise(requestAnimationFrame);
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished),
          );
        });
        const avatar = page.getByRole("button", { name: "参加者 12人" });
        const timer = page.getByTestId("room-timer");
        const read = async () => ({
          hud: await hud.boundingBox(),
          avatar: await avatar.boundingBox(),
          timer: await timer.boundingBox(),
        });
        if (!reference) reference = await read();
        else await expect.poll(read).toEqual(reference);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (story === result) {
          expect(
            await page.getByRole("button", { name: "投票結果を表示" }).count(),
          ).toBe(0);
          if (!result.startsWith("idea"))
            expect(
              await page
                .getByRole("button", { name: "次のステップへ" })
                .isDisabled(),
            ).toBe(true);
          else
            expect(
              await page
                .getByRole("button", { name: "完了して成果を表示" })
                .count(),
            ).toBe(0);
        }
      }
    }
  } finally {
    await browser.close();
  }
});
