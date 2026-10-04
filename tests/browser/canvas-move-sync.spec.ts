import { chromium, type Locator, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const app = process.env.AUTH_APP_TEST_URL;
type Bounds = { x: number; y: number; width: number; height: number };

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${app}/login?next=%2Fdev%2Fverify`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password");
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
  await page.waitForURL(`${app}/dev/verify`);
}

async function bounds(note: Locator): Promise<Bounds> {
  const box = await note.boundingBox();
  if (!box) throw new Error("移動対象が表示されていません。");
  return box;
}

async function position(note: Locator): Promise<{ x: number; y: number }> {
  return note.evaluate((element) => {
    const placed = element.closest<HTMLElement>(
      '[data-testid^="board-note-"], [data-testid^="idea-value-feasibility-map-note-"]',
    );
    if (!placed) throw new Error("付箋の配置要素がありません。");
    return {
      x: Number.parseFloat(getComputedStyle(placed).left),
      y: Number.parseFloat(getComputedStyle(placed).top),
    };
  });
}

async function drag(
  page: Page,
  note: Locator,
): Promise<{ x: number; y: number }> {
  const box = await bounds(note);
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;
  const id = await note.getAttribute("data-note-id");
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-note-id]")
          ?.getAttribute("data-note-id"),
      { x, y },
    ),
  ).toBe(id);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y + 12, { steps: 4 });
  return { x, y };
}

// Storybookのfake transportでは二者への実配信を検証できない。
// 既存auth-entryと同じ専用dev:verify指定時に、別認証contextで実RoomDOへ接続する。
// 各caseは新規ルームだけを操作し、通常DBを使わない。
describe.skipIf(!app)("実RoomDOの他者移動同期", () => {
  test.each([
    "1-2",
    "1-3",
    "3-3",
  ])("%sで他者preview・取消・確定・切断が一致する", async (checkpoint) => {
    const browser = await chromium.launch();
    try {
      const actorContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const peerContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const actor = await actorContext.newPage();
      const peer = await peerContext.newPage();
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      await Promise.all([
        actor.waitForResponse(
          (response) =>
            response.url().endsWith("/api/verification/rooms") &&
            response.request().method() === "POST",
        ),
        actor
          .getByRole("button", { name: new RegExp(`^${checkpoint} `) })
          .click(),
      ]);
      const fixed = actor.getByRole("link", {
        name: "このルームを固定して開く（追従なし）",
      });
      await fixed.waitFor();
      const href = await fixed.getAttribute("href");
      if (!href) throw new Error("検証ルームURLがありません。");
      for (const page of [actor, peer]) {
        await page.goto(`${app}${href}`);
        await page.getByTestId("board-canvas").waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
        await expect
          .poll(async () =>
            (
              await page.getByTestId("board-canvas").getAttribute("style")
            )?.includes("scale(1)"),
          )
          .toBe(true);
      }
      const notes = actor.locator(
        '[data-testid="board-canvas"] [data-testid="note-card"]',
      );
      let note: Locator | undefined;
      for (let i = 0; i < (await notes.count()); i++) {
        const candidate = notes.nth(i),
          box = await bounds(candidate);
        if (
          box.x > 380 &&
          box.y > 230 &&
          box.x + box.width < 1180 &&
          box.y + box.height < 590
        ) {
          note = candidate;
          break;
        }
      }
      if (!note) throw new Error("操作可能な付箋がありません。");
      const id = await note.getAttribute("data-note-id");
      const peerNote = peer.locator(`[data-note-id="${id}"]`).first();
      const before = await bounds(peerNote);
      const actorBefore = await bounds(note);
      const savedBefore = await position(peerNote);
      const actorCamera = await actor
        .getByTestId("board-canvas")
        .getAttribute("style");
      const pointer = await drag(actor, note);
      await expect
        .poll(async () => (await bounds(note)).x - actorBefore.x)
        .toBeGreaterThan(15);
      const preview = await bounds(note);
      expect(
        await actor.getByTestId("board-canvas").getAttribute("style"),
      ).toBe(actorCamera);
      await expect
        .poll(async () =>
          Math.abs(
            (await bounds(peerNote)).x - before.x - (preview.x - actorBefore.x),
          ),
        )
        .toBeLessThan(0.5);
      await expect
        .poll(async () =>
          Math.abs(
            (await bounds(peerNote)).y - before.y - (preview.y - actorBefore.y),
          ),
        )
        .toBeLessThan(0.5);
      // 同じdragを保持したまま再度動かし、最初の通知だけでなく追従を確認する。
      await actor.mouse.move(pointer.x + 44, pointer.y + 22, { steps: 4 });
      await expect
        .poll(async () => (await bounds(note)).x - preview.x)
        .toBeGreaterThan(10);
      const continued = await position(note);
      await expect
        .poll(async () => Math.abs((await position(peerNote)).x - continued.x))
        .toBeLessThan(0.5);
      await expect
        .poll(async () => Math.abs((await position(peerNote)).y - continued.y))
        .toBeLessThan(0.5);
      // pointerup前の取消で他者のoverlayも消し、確定座標へ戻す。
      await actor.keyboard.press("Escape");
      await actor.mouse.up();
      await expect
        .poll(async () => Math.abs((await bounds(peerNote)).x - before.x))
        .toBeLessThan(0.5);
      await expect
        .poll(async () => Math.abs((await bounds(peerNote)).y - before.y))
        .toBeLessThan(0.5);
      await peer.reload();
      await peer.getByTestId("board-canvas").waitFor();
      await peer.getByRole("button", { name: "ズームを100%に戻す" }).click();
      await expect
        .poll(async () => await position(peerNote))
        .toEqual(savedBefore);
      // 次のoperationは前回の終了通知に消されず、pointerup後の確定に揃う。
      await drag(actor, note);
      await expect
        .poll(async () => (await position(note)).x - savedBefore.x)
        .toBeGreaterThan(10);
      const second = await position(note);
      await expect
        .poll(async () => Math.abs((await position(peerNote)).x - second.x))
        .toBeLessThan(0.5);
      await actor.mouse.up();
      await expect
        .poll(async () => Math.abs((await position(peerNote)).x - second.x))
        .toBeLessThan(0.5);
      await peer.reload();
      await peer.getByTestId("board-canvas").waitFor();
      await peer.getByRole("button", { name: "ズームを100%に戻す" }).click();
      await expect
        .poll(async () => Math.abs((await position(peerNote)).x - second.x))
        .toBeLessThan(0.5);
      await expect
        .poll(async () => Math.abs((await position(peerNote)).y - second.y))
        .toBeLessThan(0.5);
      // 実ブラウザを閉じると相手の未確定表示は即時消え、保存済み位置に戻る。
      await drag(actor, note);
      await expect
        .poll(async () => (await position(peerNote)).x - second.x)
        .toBeGreaterThan(10);
      await actorContext.close();
      await expect
        .poll(async () => Math.abs((await position(peerNote)).x - second.x))
        .toBeLessThan(0.5);
      await expect
        .poll(async () => Math.abs((await position(peerNote)).y - second.y))
        .toBeLessThan(0.5);
    } finally {
      await browser.close();
    }
  });
});
