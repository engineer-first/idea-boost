import { chromium, type Locator, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const app = process.env.AUTH_APP_TEST_URL;
const evidence = process.env.MOVE_HISTORY_EVIDENCE_DIR;

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${app}/login?next=%2Fdev%2Fverify`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password");
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
  await page.waitForURL(`${app}/dev/verify`);
}

async function prepare(
  actor: Page,
  peer: Page,
  checkpoint: string,
): Promise<void> {
  await actor.goto(`${app}/dev/verify`);
  const [response] = await Promise.all([
    actor.waitForResponse(
      (r) =>
        r.url().endsWith("/api/verification/rooms") &&
        r.request().method() === "POST",
    ),
    actor.getByRole("button", { name: new RegExp(`^${checkpoint} `) }).click(),
  ]);
  const created = (await response.json()) as { roomId: string };
  const fixed = actor.getByRole("link", {
    name: "このルームを固定して開く（追従なし）",
  });
  await expect
    .poll(() => fixed.getAttribute("href"))
    .toBe(`/rooms/${created.roomId}`);
  const href = await fixed.getAttribute("href");
  for (const page of [actor, peer]) {
    await page.goto(`${app}${href}`);
    await page.getByTestId("board-canvas").waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
}

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

async function drag(
  page: Page,
  note: Locator,
  dx = 50,
  dy = 25,
): Promise<void> {
  const box = await note.boundingBox();
  if (!box) throw new Error("操作対象がありません。");
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function targets(page: Page, count: number): Promise<Locator[]> {
  const cards = page.getByTestId("board-canvas").getByTestId("note-card");
  const selected: Locator[] = [];
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const box = await card.boundingBox();
    if (
      box &&
      box.x > 380 &&
      box.y > 210 &&
      box.x + box.width < 1180 &&
      box.y + box.height < 580
    ) {
      const id = await card.getAttribute("data-note-id");
      selected.push(page.locator(`[data-note-id="${id}"]`).first());
      if (selected.length === count) break;
    }
  }
  expect(selected).toHaveLength(count);
  return selected;
}

function undo(page: Page): Locator {
  return page.getByRole("button", { name: /^移動を元に戻す/ });
}
function redo(page: Page): Locator {
  return page.getByRole("button", { name: /^移動をやり直す/ });
}

// AUTH_APP_TEST_URLの専用dev:verifyだけを操作。別認証contextで実RoomDOに接続する。
describe.skipIf(!app)("共有移動Undo/Redoの実RoomDO統合", () => {
  test("AT-030/031: 3枚同時復帰・連続履歴・他者更新の全拒否", async () => {
    const browser = await chromium.launch();
    try {
      const actorContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ...(evidence
          ? {
              recordVideo: {
                dir: evidence,
                size: { width: 1280, height: 720 },
              },
            }
          : {}),
      });
      const peerContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const actor = await actorContext.newPage();
      const peer = await peerContext.newPage();
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      await prepare(actor, peer, "1-2");
      const notes = await targets(actor, 3);
      const before = await Promise.all(notes.map(position));
      for (const note of notes)
        await note
          .getByRole("button", { name: "付箋", exact: true })
          .click({ modifiers: ["Shift"] });
      await drag(actor, notes[0]);

      await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      const moved = await Promise.all(notes.map(position));
      expect(moved.every((p, i) => p.x !== before[i].x)).toBe(true);
      if (evidence)
        await actor.screenshot({ path: `${evidence}/after-move.png` });
      await undo(actor).click();
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(before);
      await redo(actor).click();
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(moved);
      await drag(actor, notes[0], 40, 20);
      await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      const twice = await Promise.all(notes.map(position));
      await actor.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(moved);
      await actor.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(before);
      await actor.keyboard.press("ControlOrMeta+Shift+z");
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(moved);
      await actor.keyboard.press("ControlOrMeta+Shift+z");
      await expect.poll(() => Promise.all(notes.map(position))).toEqual(twice);
      const id = await notes[0].getAttribute("data-note-id");
      const peerNote = peer.locator(`[data-note-id="${id}"]`).first();
      await expect.poll(() => position(peerNote)).toEqual(twice[0]);
      await drag(peer, peerNote, -40, -15);
      await expect
        .poll(async () => (await position(notes[0])).x === twice[0].x)
        .toBe(false);
      const protectedPositions = await Promise.all(notes.map(position));
      await actor.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => undo(actor).isDisabled()).toBe(true);
      expect(await Promise.all(notes.map(position))).toEqual(
        protectedPositions,
      );
      if (evidence)
        await actor.screenshot({ path: `${evidence}/peer-conflict.png` });
      await actorContext.close();
      await peerContext.close();
    } finally {
      await browser.close();
    }
  }, 90_000);
  test("AT-029/030: 評価mapのUndo/Redoと本文・IMEのnative Undo", async () => {
    const browser = await chromium.launch();
    try {
      const actor = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      const peer = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      let inverses = 0;
      const receivedPositions = new Map<string, { x: number; y: number }>();
      actor.on("websocket", (socket) =>
        socket.on("framesent", ({ payload }) => {
          try {
            if (JSON.parse(String(payload)).type === "note:move:inverse")
              inverses++;
          } catch {}
        }),
      );
      actor.on("websocket", (socket) =>
        socket.on("framereceived", ({ payload }) => {
          try {
            const message = JSON.parse(String(payload)) as {
              type: string;
              note?: { id: string; x: number; y: number };
              notes?: { id: string; x: number; y: number }[];
            };
            const notes =
              message.type === "note:updated" && message.note
                ? [message.note]
                : message.type === "notes:moved"
                  ? (message.notes ?? [])
                  : [];
            for (const value of notes)
              receivedPositions.set(value.id, { x: value.x, y: value.y });
          } catch {}
        }),
      );
      await prepare(actor, peer, "3-2");
      const note = actor
        .getByTestId("board-canvas")
        .getByTestId("note-card")
        .filter({ hasText: "学びたいことプロフィール" });
      const before = await position(note);
      await drag(actor, note, 35, 20);
      await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      const moved = await position(note);
      expect(moved).not.toEqual(before);
      await undo(actor).click();
      await expect.poll(() => position(note)).toEqual(before);
      await redo(actor).click();
      await expect.poll(() => position(note)).toEqual(moved);
      inverses = 0;
      const id = await note.getAttribute("data-note-id");
      const normalizedMoved = receivedPositions.get(id ?? "");
      expect(normalizedMoved).toBeDefined();
      await note.getByRole("button", { name: "付箋", exact: true }).click();
      await actor.keyboard.press("Enter");
      const editor = note.locator("textarea");
      await expect.poll(() => note.getAttribute("data-editing")).toBe("true");
      const original = await editor.inputValue();
      await editor.click();
      await editor.press("End");
      await editor.pressSequentially(" native Undo", { delay: 30 });
      const typed = await editor.inputValue();
      expect(typed).not.toEqual(original);
      await actor.keyboard.press("ControlOrMeta+z");
      expect(await editor.inputValue()).not.toEqual(typed);
      expect(receivedPositions.get(id ?? "")).toEqual(normalizedMoved);
      expect(inverses).toBe(0);
      await editor.evaluate((element) =>
        element.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "z",
            ctrlKey: true,
            isComposing: true,
            bubbles: true,
          }),
        ),
      );
      expect(inverses).toBe(0);
      if (evidence)
        await actor.screenshot({ path: `${evidence}/native-editor.png` });
    } finally {
      await browser.close();
    }
  }, 90_000);

  test("AT-031: 分類の消滅後に名前と非移動メンバーを復元する", async () => {
    const browser = await chromium.launch();
    try {
      const actor = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      const peer = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      await prepare(actor, peer, "1-3");
      const label = actor
        .getByTestId("group-name-display")
        .filter({ hasText: "学び合う相手探し" });
      const cards = actor.getByTestId("board-canvas").getByTestId("note-card");
      const texts = [
        "空きコマに一緒に勉強する仲間",
        "友達の空き時間がわからず",
        "授業の質問を気軽に",
      ];
      const deltas = [
        [-160, 150],
        [-230, 10],
        [40, -140],
      ];
      for (let i = 0; i < 3; i++) {
        const note = cards.filter({ hasText: texts[i] });
        await drag(actor, note, deltas[i][0], deltas[i][1]);
        await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      }
      await expect.poll(() => label.count()).toBe(0);
      if (evidence)
        await actor.screenshot({ path: `${evidence}/group-removed.png` });
      await undo(actor).click();
      await expect.poll(() => label.count()).toBe(1);
      await expect
        .poll(() =>
          peer
            .getByTestId("group-name-display")
            .filter({ hasText: "学び合う相手探し" })
            .count(),
        )
        .toBe(1);
      if (evidence)
        await actor.screenshot({ path: `${evidence}/group-restored.png` });
      await redo(actor).click();
      await expect.poll(() => label.count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 90_000);
  test("共有・非共有化の成功が移動履歴の境界になる（#524統合）", async () => {
    const browser = await chromium.launch();
    try {
      const actor = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      const peer = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      const shareResults: string[] = [];
      actor.on("websocket", (socket) =>
        socket.on("framereceived", ({ payload }) => {
          try {
            const m = JSON.parse(String(payload));
            if (m.type === "note:share:result") shareResults.push(m.status);
          } catch {}
        }),
      );
      await login(actor, "owner@example.test");
      await login(peer, "member@example.test");
      await prepare(actor, peer, "1-2");
      const board = actor.getByTestId("board-canvas");
      const original = board
        .getByTestId("note-card")
        .filter({ hasText: "学食が空く時間" });
      const id = await original.getAttribute("data-note-id");
      await drag(actor, original, 35, 20);
      await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      const start = await original.boundingBox();
      if (!start) throw new Error("戻す付箋がありません");
      await actor.mouse.move(
        start.x + start.width * 0.4,
        start.y + start.height * 0.4,
      );
      await actor.mouse.down();
      await actor.mouse.move(
        start.x + start.width * 0.4 + 20,
        start.y + start.height * 0.4,
        { steps: 4 },
      );
      const toolbar = actor.getByTestId("private-notes-toolbar");
      const drop = await toolbar.boundingBox();
      if (!drop) throw new Error("マイ付箋がありません");
      await actor.mouse.move(
        drop.x + drop.width / 2,
        drop.y + drop.height / 2,
        { steps: 10 },
      );
      await actor.mouse.up();
      await expect
        .poll(() => board.locator(`[data-note-id="${id}"]`).count())
        .toBe(0);
      await expect
        .poll(() => peer.locator(`[data-note-id="${id}"]`).count())
        .toBe(0);
      await expect.poll(() => undo(actor).isDisabled()).toBe(true);
      const another = board
        .getByTestId("note-card")
        .filter({ hasText: "初対面の人を勉強会に" });
      await drag(actor, another, 30, 10);
      await expect.poll(() => undo(actor).isEnabled()).toBe(true);
      const open = actor.getByRole("button", { name: "マイ付箋を開く" });
      if (await open.isVisible()) await open.click();
      const privateNote = toolbar.locator(`[data-note-id="${id}"]`);
      const source = await privateNote.boundingBox();
      if (!source) throw new Error("非共有付箋がありません");
      await actor.mouse.move(
        source.x + source.width * 0.4,
        source.y + source.height * 0.4,
      );
      await actor.mouse.down();
      await actor.mouse.move(850, 240, { steps: 15 });
      await actor.mouse.up();
      await expect
        .poll(() => board.locator(`[data-note-id="${id}"]`).count())
        .toBe(1);
      await expect
        .poll(() => peer.locator(`[data-note-id="${id}"]`).count())
        .toBe(1);
      await expect.poll(() => undo(actor).isDisabled()).toBe(true);
      if (process.env.REQUIRE_SHARE_RECEIPT === "1")
        expect(shareResults.filter((s) => s === "committed")).toHaveLength(2);
      if (evidence)
        await actor.screenshot({ path: `${evidence}/share-boundary.png` });
    } finally {
      await browser.close();
    }
  }, 90_000);
});
