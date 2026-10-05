import { chromium, type Locator, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const app = process.env.AUTH_APP_TEST_URL;
async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${app}/login?next=%2Fdev%2Fverify`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password");
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
  await page.waitForURL(`${app}/dev/verify`);
}
async function startDrag(page: Page, card: Locator): Promise<void> {
  const rect = await card.boundingBox();
  if (!rect) throw new Error("付箋の表示位置がありません。");
  const x = rect.x + rect.width * 0.4;
  const y = rect.y + rect.height * 0.4;
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-note-id]")
          ?.getAttribute("data-note-id"),
      { x, y },
    ),
  ).toBe(await card.getAttribute("data-note-id"));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 12, y, { steps: 2 });
}

// 実RoomDO/別認証接続で、公開前の本文・枚数・previewの非配信を観測する。
// Storybookのfake transportは、この保証の代わりにしない。
describe.skipIf(!app)("共有境界の二者同期", () => {
  test.each([
    "1-2",
    "2-2",
    "3-2",
  ])("%sの有効dropだけが公開/非共有化する", async (checkpoint) => {
    const browser = await chromium.launch();
    try {
      const actor = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      const peer = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      actor.setDefaultTimeout(5_000);
      peer.setDefaultTimeout(5_000);
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      const [response] = await Promise.all([
        actor.waitForResponse(
          (response) =>
            response.url().endsWith("/api/verification/rooms") &&
            response.request().method() === "POST",
        ),
        actor
          .getByRole("button", { name: new RegExp(`^${checkpoint} `) })
          .click(),
      ]);
      const room = (await response.json()) as { roomId: string };
      const sent: { type: string; noteId?: string }[] = [];
      const received: { type: string; note?: { id: string } }[] = [];
      actor.on("websocket", (socket) => {
        if (!socket.url().includes("/api/rooms/")) return;
        socket.on("framesent", ({ payload }) =>
          sent.push(JSON.parse(String(payload))),
        );
      });
      peer.on("websocket", (socket) => {
        if (!socket.url().includes("/api/rooms/")) return;
        socket.on("framereceived", ({ payload }) =>
          received.push(JSON.parse(String(payload))),
        );
      });
      for (const page of [actor, peer]) {
        await page.goto(`${app}/rooms/${room.roomId}`);
        await page.getByTestId("board-canvas").waitFor();
        await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
      }
      await actor.getByRole("button", { name: "マイ付箋を開く" }).click();
      const toolbar = actor.getByTestId("private-notes-toolbar");
      const privateCard = toolbar.getByTestId("note-card").first();
      const id = await privateCard.getAttribute("data-note-id");
      const peerCard = peer.locator(`[data-note-id="${id}"]`);
      const boardCard = actor
        .getByTestId("board-canvas")
        .locator(`[data-note-id="${id}"]`);
      const publishCount = () =>
        sent.filter((message) => message.type === "note:publish").length;
      const unpublishCount = () =>
        sent.filter((message) => message.type === "note:unpublish").length;
      await startDrag(actor, privateCard);
      await actor.mouse.move(820, 360, { steps: 8 });
      await actor.getByTestId("private-note-drag-preview").waitFor();
      expect(publishCount()).toBe(0);
      expect(await peerCard.count()).toBe(0);
      expect(received.some((message) => message.note?.id === id)).toBe(false);
      // 境界を往復しても非公開。Escapeは共有要求を送らない。
      const tray = await toolbar.boundingBox();
      if (!tray) throw new Error("マイ付箋パネルがありません。");
      await actor.mouse.move(tray.x + tray.width / 2, tray.y + 150, {
        steps: 8,
      });
      await actor.mouse.move(820, 360, { steps: 8 });
      await actor.keyboard.press("Escape");
      await actor.mouse.up();
      expect(publishCount()).toBe(0);
      expect(await peerCard.count()).toBe(0);
      // HUDへのdropはパネル外でも無効。
      await startDrag(actor, privateCard);
      await actor.mouse.move(820, 360, { steps: 8 });
      await actor.mouse.move(80, 85, { steps: 8 });
      await actor.mouse.up();
      expect(publishCount()).toBe(0);
      expect(await peerCard.count()).toBe(0);
      // パネル閉鎖は未送信dragを取消し、同じpointerupを公開へ転用しない。
      await startDrag(actor, privateCard);
      await actor.mouse.move(820, 360, { steps: 8 });
      await actor
        .getByRole("button", { name: "マイ付箋を閉じる" })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await actor.mouse.up();
      expect(publishCount()).toBe(0);
      expect(await peerCard.count()).toBe(0);
      await actor.getByRole("button", { name: "マイ付箋を開く" }).click();
      await startDrag(actor, privateCard);
      await actor.mouse.move(820, 360, { steps: 8 });
      expect(publishCount()).toBe(0);
      await actor.mouse.up();
      await peerCard.waitFor();
      await boardCard.waitFor();
      expect(publishCount()).toBe(1);
      // 作者hoverの戻しpreviewは他者の確定表示を消さない。
      await startDrag(actor, boardCard);
      await actor.mouse.move(tray.x + tray.width / 2, tray.y + 150, {
        steps: 8,
      });
      expect(unpublishCount()).toBe(0);
      expect(await peerCard.count()).toBe(1);
      await actor.keyboard.press("Escape");
      await actor.mouse.up();
      expect(unpublishCount()).toBe(0);
      expect(await peerCard.count()).toBe(1);
      // 戻し候補の上へ別操作面が出た場合も、背面のパネルへdropしない。
      await startDrag(actor, boardCard);
      const returnPoint = { x: tray.x + tray.width / 2, y: tray.y + 150 };
      await actor.mouse.move(returnPoint.x, returnPoint.y, { steps: 8 });
      await actor.evaluate(({ x, y }) => {
        const overlay = document.createElement("div");
        overlay.id = "share-drop-test-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.style.cssText = `position:fixed;left:${x - 40}px;top:${y - 40}px;width:80px;height:80px;z-index:2147483647;background:white`;
        document.body.append(overlay);
      }, returnPoint);
      expect(
        await actor.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("role"),
          returnPoint,
        ),
      ).toBe("dialog");
      await actor.mouse.up();
      await actor.evaluate(() =>
        document.getElementById("share-drop-test-overlay")?.remove(),
      );
      expect(unpublishCount()).toBe(0);
      expect(await peerCard.count()).toBe(1);
      await boardCard.waitFor();
      await startDrag(actor, boardCard);
      await actor.mouse.move(tray.x + tray.width / 2, tray.y + 150, {
        steps: 8,
      });
      await actor.mouse.up();
      await expect.poll(unpublishCount, { timeout: 5_000 }).toBe(1);
      await expect.poll(() => peerCard.count(), { timeout: 5_000 }).toBe(0);
      expect(unpublishCount()).toBe(1);
      await expect
        .poll(() => toolbar.locator(`[data-note-id="${id}"]`).count(), {
          timeout: 5_000,
        })
        .toBe(1);
      await peer.reload();
      await peer.getByTestId("board-canvas").waitFor();
      expect(await peerCard.count()).toBe(0);
    } finally {
      await browser.close();
    }
  });
});
