import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
it.each([
  375, 640, 900, 1440,
])("%ipxで投票前・全員完了・結果の空白を予約せず主要操作の位置と行の高さを保つ", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    for (const scenario of [
      {
        stories: [
          "voting-hud",
          "voting-complete-hud",
          "vote-result-awaiting-decision",
        ],
        memberCount: 12,
        isHost: true,
      },
      {
        stories: [
          "idea-voting",
          "idea-voting-complete",
          "idea-result-awaiting-decision",
        ],
        memberCount: 12,
        isHost: true,
      },
      {
        stories: [
          "voting-non-host-paused",
          "voting-complete-non-host-paused",
          "vote-result-non-host-paused",
        ],
        memberCount: 3,
        isHost: false,
      },
    ]) {
      let reference: unknown;
      let referenceHeight = 0;
      let nextReference: unknown;
      const result = scenario.stories[2];
      for (const story of scenario.stories) {
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
        const avatar = page.getByRole("button", {
          name: `参加者 ${scenario.memberCount}人`,
        });
        const timer = page.getByTestId("room-timer");
        const read = async () => ({
          hudHeight: (await hud.boundingBox())?.height,
          menu: await page
            .getByRole("button", { name: "ルームメニューを開く" })
            .boundingBox(),
          avatar: await avatar.boundingBox(),
          timer: await timer.boundingBox(),
        });
        expect((await hud.boundingBox())?.height).toBeLessThanOrEqual(
          width < 900 ? 98 : 56,
        );
        const label = page.getByTestId("vote-completion-label");
        if (story.includes("complete")) {
          expect(await label.isVisible()).toBe(true);
          const labelBox = await label.boundingBox();
          const hudBox = await hud.boundingBox();
          expect(labelBox).not.toBeNull();
          expect(hudBox).not.toBeNull();
          if (!labelBox || !hudBox)
            throw new Error("完了表示または操作バーがありません");
          if (width < 900) {
            expect(labelBox.y).toBeGreaterThanOrEqual(hudBox.y + hudBox.height);
            const context = await page
              .getByTestId("board-context-column")
              .boundingBox();
            if (!context) throw new Error("現在地表示がありません");
            if (width < 640)
              expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(
                context.y,
              );
          } else {
            const avatarBox = await avatar.boundingBox();
            if (!avatarBox) throw new Error("参加者ボタンがありません");
            expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(
              avatarBox.x,
            );
          }
        } else {
          // 非表示ラベルが幅を占有していた #487 の回帰を検知する。
          expect(await label.count()).toBe(0);
          if (width >= 900) {
            const hudBox = await hud.boundingBox();
            const avatarBox = await avatar.boundingBox();
            if (!hudBox || !avatarBox)
              throw new Error("操作バーまたは参加者ボタンがありません");
            expect(avatarBox.x - hudBox.x).toBeLessThanOrEqual(8);
          }
        }
        const next = page.getByRole("button", { name: "次のステップへ" });
        if (await next.count()) {
          const nextBox = await next.boundingBox();
          if (!nextReference) nextReference = nextBox;
          else expect(nextBox).toEqual(nextReference);
        }
        if (!reference) {
          reference = await read();
          referenceHeight = (await hud.boundingBox())?.height ?? 0;
        } else if (story === "idea-result-awaiting-decision") {
          // 最終ステップは「次へ」の代わりに無効な完了ボタンを表示する。
          // 投票前・全員完了の配置一致は上記の比較で引き続き保証する。
          const hudBox = await hud.boundingBox();
          const menuBox = await page
            .getByRole("button", { name: "ルームメニューを開く" })
            .boundingBox();
          if (!hudBox || !menuBox) throw new Error("操作バーがありません");
          expect(hudBox.height).toBeLessThanOrEqual(referenceHeight);
          expect(
            await page
              .getByRole("button", { name: "完了して成果を表示" })
              .isDisabled(),
          ).toBe(true);
          expect(await next.count()).toBe(0);
          await page
            .getByRole("button", { name: "ルームメニューを開く" })
            .click();
          await page.getByRole("button", { name: "招待", exact: true }).click();
          expect(
            await page
              .getByRole("dialog", { name: "ルームに招待" })
              .isVisible(),
          ).toBe(true);
        } else await expect.poll(read).toEqual(reference);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (story === result) {
          expect(
            await page.getByRole("button", { name: "投票結果を表示" }).count(),
          ).toBe(0);
          if (scenario.isHost && !result?.startsWith("idea"))
            expect(
              await page
                .getByRole("button", { name: "次のステップへ" })
                .isDisabled(),
            ).toBe(true);
          else if (result?.startsWith("idea"))
            expect(
              await page
                .getByRole("button", { name: "完了して成果を表示" })
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

it.each([
  375, 640, 900, 1440,
])("%ipxで最終案の決定前後に完了ボタンの位置を保つ", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    let reference: unknown;
    for (const story of [
      "idea-result-awaiting-decision",
      "idea-result-decided",
    ]) {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardheader--${story}&viewMode=story`,
      );
      const button = page.getByRole("button", { name: "完了して成果を表示" });
      await button.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const box = await button.boundingBox();
      if (!reference) {
        reference = box;
        expect(await button.isDisabled()).toBe(true);
      } else {
        expect(box).toEqual(reference);
        await button.click();
        expect(await page.getByRole("alertdialog").isVisible()).toBe(true);
      }
    }
  } finally {
    await browser.close();
  }
});
