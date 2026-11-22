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
async function startWork(actor: Page, peer: Page): Promise<void> {
  const startSharing = actor.getByRole("button", {
    name: "最初の人を開始",
    exact: true,
  });
  if (await startSharing.count()) await startSharing.click();
  else {
    await actor.getByTestId("room-timer").click();
  }
  // 発表開始のカウントダウンを含め、通常の操作可能な状態を待つ。
  for (const page of [actor, peer])
    await expect
      .poll(() => page.getByTestId("room-timer").getAttribute("data-status"), {
        timeout: 10000,
      })
      .toBe("running");
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

async function releaseWithoutMove(
  page: Page,
  card: Locator,
  destination: { x: number; y: number },
): Promise<void> {
  const rect = await card.boundingBox();
  if (!rect) throw new Error("付箋の表示位置がありません。");
  const x = rect.x + rect.width * 0.4;
  const y = rect.y + rect.height * 0.4;
  await page.mouse.move(x, y);
  const cdp = await page.context().newCDPSession(page);
  try {
    await Promise.all([
      cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      }),
      cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...destination,
        button: "left",
        buttons: 0,
        clickCount: 1,
      }),
    ]);
  } finally {
    await cdp.detach();
  }
}

// 実RoomDO/別認証接続で、公開前の本文・枚数・previewの非配信を観測する。
// Storybookのfake transportは、この保証の代わりにしない。
describe.skipIf(!app)("共有境界の二者同期", () => {
  test.each(["1-2", "2-2", "3-2"])(
    "%sの有効dropだけが公開し、共有付箋をマイ付箋へ落としても非共有化しない",
    async (checkpoint) => {
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
          await page
            .getByRole("button", { name: "ズームを100%に戻す" })
            .click();
        }
        await startWork(actor, peer);
        await actor.getByTestId("private-notes-scroll").waitFor();
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
        // 最初のpointermoveでパネルを飛び出しても、押下位置がpreview内でずれない。
        const privateRect = await privateCard.boundingBox();
        if (!privateRect) throw new Error("マイ付箋が見つかりません。");
        const grabX = privateRect.width * 0.4;
        const grabY = privateRect.height * 0.4;
        await actor.mouse.move(privateRect.x + grabX, privateRect.y + grabY);
        await actor.mouse.down();
        await actor.mouse.move(820, 360);
        const preview = actor.getByTestId("private-note-drag-preview");
        await preview.waitFor();
        const previewRect = await preview.boundingBox();
        expect(previewRect?.x).toBeCloseTo(820 - grabX, 0);
        expect(previewRect?.y).toBeCloseTo(360 - grabY, 0);
        expect(publishCount()).toBe(0);
        expect(await peerCard.count()).toBe(0);
        await actor.keyboard.press("Escape");
        await actor.mouse.up();
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
        const hud = await actor.getByTestId("board-context-hud").boundingBox();
        if (!hud) throw new Error("HUDが見つかりません。");
        await actor.mouse.move(hud.x + hud.width / 2, hud.y + hud.height / 2, {
          steps: 8,
        });
        await actor.mouse.up();
        expect(publishCount()).toBe(0);
        expect(await peerCard.count()).toBe(0);
        // Escapeは未送信dragを取消し、同じpointerupを公開へ転用しない。
        await startDrag(actor, privateCard);
        await actor.mouse.move(820, 360, { steps: 8 });
        await actor.keyboard.press("Escape");
        await actor.mouse.up();
        expect(publishCount()).toBe(0);
        expect(await peerCard.count()).toBe(0);
        await actor.getByTestId("private-notes-scroll").waitFor();
        await startDrag(actor, privateCard);
        await actor.mouse.move(820, 360, { steps: 8 });
        expect(publishCount()).toBe(0);
        await actor.mouse.up();
        await peerCard.waitFor();
        await boardCard.waitFor();
        expect(publishCount()).toBe(1);
        // 共有付箋をマイ付箋エリアへドラッグして離しても未共有化されない。
        const returnPoint = { x: tray.x + tray.width / 2, y: tray.y + 150 };
        await startDrag(actor, boardCard);
        await actor.mouse.move(returnPoint.x, returnPoint.y, { steps: 8 });
        await actor.mouse.up();
        expect(unpublishCount()).toBe(0);
        expect(await peerCard.count()).toBe(1);
        expect(await boardCard.count()).toBe(1);
        expect(await toolbar.locator(`[data-note-id="${id}"]`).count()).toBe(0);
        await peer.reload();
        await peer.getByTestId("board-canvas").waitFor();
        expect(await peerCard.count()).toBe(1);
        // 途中moveが1回も届かない操作でも、マイ付箋からボードへの有効な最終dropだけを確定する。
        const secondPrivateCard = toolbar.getByTestId("note-card").first();
        if ((await secondPrivateCard.count()) > 0) {
          const secondId = await secondPrivateCard.getAttribute("data-note-id");
          await releaseWithoutMove(actor, secondPrivateCard, {
            x: 820,
            y: 360,
          });
          await expect.poll(publishCount, { timeout: 5_000 }).toBe(2);
          await peer.locator(`[data-note-id="${secondId}"]`).waitFor();
          await actor
            .getByTestId("board-canvas")
            .locator(`[data-note-id="${secondId}"]`)
            .waitFor();
        }
      } finally {
        await browser.close();
      }
    },
  );
});
