import { chromium, type Locator, type Page } from "playwright";
import { describe, expect, test } from "vitest";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

const app = process.env.AUTH_APP_TEST_URL;
const evidence = process.env.MOVE_QUEUE_EVIDENCE_DIR;

async function position(note: Locator): Promise<{ x: number; y: number }> {
  return note.evaluate((element) => {
    const placed = element.closest<HTMLElement>(
      '[data-testid^="board-note-"], [data-testid^="idea-value-feasibility-map-note-"]',
    );
    if (!placed) throw new Error("配置要素がありません。");
    return {
      x: Number.parseFloat(getComputedStyle(placed).left),
      y: Number.parseFloat(getComputedStyle(placed).top),
    };
  });
}

async function prepare(page: Page, checkpoint: string): Promise<void> {
  await page.goto(`${app}/login?next=%2Fdev%2Fverify`);
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("owner@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("password");
  await page
    .getByRole("button", { name: "開発用ユーザーでログイン", exact: true })
    .click();
  await page.waitForURL(`${app}/dev/verify`);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/verification/rooms") &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: new RegExp(`^${checkpoint} `) }).click(),
  ]);
  const { roomId } = (await response.json()) as { roomId: string };
  await page.goto(`${app}/rooms/${roomId}`);
  await page.getByTestId("board-canvas").waitFor();
  await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
  await page
    .getByRole("button", { name: "最初の人を開始", exact: true })
    .click();
  await expect
    .poll(() => page.getByTestId("room-timer").getAttribute("data-status"), {
      timeout: 10_000,
    })
    .toBe("running");
}

// 実RoomDOへの保存応答だけを遅らせ、入力・描画・保存・履歴の接続を検証する。
describe.skipIf(!app)("短い連続ドラッグの保存待ち", () => {
  test.each([
    { checkpoint: "1-2", input: "move", delay: 250 },
    { checkpoint: "1-2", input: "up-only", delay: 0 },
    { checkpoint: "1-2", input: "up-only", delay: 250 },
    { checkpoint: "1-2", input: "small-move", delay: 250 },
    { checkpoint: "3-2", input: "up-only", delay: 250 },
  ])("$checkpoint / $input / 受信遅延$delay msでも16回追従・保存しUndo/Redoできる", async ({
    checkpoint,
    input,
    delay,
  }) => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...(evidence
          ? {
              recordVideo: {
                dir: evidence,
                size: { width: 1440, height: 1000 },
              },
            }
          : {}),
      });
      const page = await context.newPage();
      const commits = new Set<string>();
      const accepted = new Set<string>();
      const failures: ServerMessage[] = [];
      const timers = new Set<ReturnType<typeof setTimeout>>();
      await page.routeWebSocket(/\/ws(?:\?|$)/, (socket) => {
        const server = socket.connectToServer();
        socket.onMessage((payload) => {
          const message = JSON.parse(String(payload)) as ClientMessage;
          if (message.type === "note:move:commit")
            commits.add(message.operationId);
          server.send(payload);
        });
        server.onMessage((payload) => {
          const timer = setTimeout(() => {
            timers.delete(timer);
            const message = JSON.parse(String(payload)) as ServerMessage;
            if (message.type === "note:move:result") {
              if (
                message.status === "accepted" &&
                commits.has(message.operationId)
              )
                accepted.add(message.operationId);
              if (message.status === "rejected" || message.status === "unknown")
                failures.push(message);
            }
            socket.send(payload);
          }, delay);
          timers.add(timer);
        });
      });
      try {
        await prepare(page, checkpoint);
        // 通常ボードは他者の付箋、mapは本人の付箋を使う（#719と再click編集の境界）。
        const note = page.locator(
          `[data-testid="note-card"][data-note-id="d1000000-0000-4000-8000-${checkpoint === "3-2" ? "000000000306" : "000000000104"}"]`,
        );
        const positions = [await position(note)];
        const cdp = await context.newCDPSession(page);
        for (let i = 0; i < 16; i++) {
          const box = await note.boundingBox();
          if (!box) throw new Error("操作対象がありません。");
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          const dx = i % 2 ? -45 : 45;
          await page.mouse.move(x, y);
          // 途中moveなし／閾値内のみ／通常moveを、DOM合成でなくnative入力で比較する。
          await Promise.all([
            cdp.send("Input.dispatchMouseEvent", {
              type: "mousePressed",
              x,
              y,
              button: "left",
              buttons: 1,
              clickCount: 1,
            }),
            ...(input === "up-only"
              ? []
              : [
                  cdp.send("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    x: x + (input === "small-move" ? 2 : dx),
                    y: y + (input === "small-move" ? 1 : 5),
                    button: "left",
                    buttons: 1,
                  }),
                ]),
            cdp.send("Input.dispatchMouseEvent", {
              type: "mouseReleased",
              x: x + dx,
              y: y + 5,
              button: "left",
              buttons: 0,
              clickCount: 1,
            }),
          ]);
          // ACKを待たず次を掴む。描画後の位置もその都度検査する。
          await page.waitForTimeout(40);
          const moved = await note.boundingBox();
          expect(moved?.x).toBeCloseTo(box.x + dx, 0);
          expect(moved?.y).toBeCloseTo(box.y + 5, 0);
          positions.push(await position(note));
        }
        await expect.poll(() => accepted.size, { timeout: 10_000 }).toBe(16);
        expect(commits.size).toBe(16);
        expect(failures).toEqual([]);
        const undo = page.getByRole("button", { name: /^移動を元に戻す/ });
        const redo = page.getByRole("button", { name: /^移動をやり直す/ });
        for (const index of [15, 14]) {
          await expect.poll(() => undo.isEnabled()).toBe(true);
          await undo.click();
          await expect.poll(() => position(note)).toEqual(positions[index]);
        }
        for (const index of [15, 16]) {
          await expect.poll(() => redo.isEnabled()).toBe(true);
          await redo.click();
          await expect.poll(() => position(note)).toEqual(positions[index]);
        }
        await page.reload();
        await note.waitFor();
        await expect.poll(() => position(note)).toEqual(positions[16]);
        expect(failures).toEqual([]);
      } finally {
        for (const timer of timers) clearTimeout(timer);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 60_000);
});
