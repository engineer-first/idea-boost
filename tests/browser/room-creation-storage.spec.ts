import { build } from "esbuild";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueCreationId } from "../../contracts/room-creation";
import type * as Store from "../../features/room-lifecycle/logic/room-creation-storage";
import type { RoomCreationIntent } from "../../features/room-lifecycle/logic/room-creation-storage";

declare global {
  interface Window {
    creationStore: typeof Store;
  }
}
let browser: Browser, context: BrowserContext, bundle: string;
const USER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222",
  ROOM = "33333333-3333-4333-8333-333333333333";
function record(): RoomCreationIntent {
  return {
    ...issueCreationId(),
    expectedPrincipal: USER,
    generation: crypto.randomUUID(),
    name: " private name ",
    state: "prepared",
  };
}
async function tab(): Promise<Page> {
  const p = await context.newPage();
  await p.route("https://storage.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>保存検証</title>",
    }),
  );
  await p.goto("https://storage.test/");
  await p.addScriptTag({ content: bundle });
  return p;
}
beforeAll(async () => {
  const result = await build({
    entryPoints: ["features/room-lifecycle/logic/room-creation-storage.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "creationStore",
    alias: { "@": process.cwd() },
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch();
  context = await browser.newContext();
});
afterAll(async () => {
  await context?.close();
  await browser?.close();
});
describe("IndexedDB実ブラウザtransaction", () => {
  it("同時候補は一つの選択へ収束し、別意図は明示切替で独立保存", async () => {
    const a = await tab(),
      b = await tab();
    const first = record(),
      second = record();
    const results = await Promise.all([
      a.evaluate(
        (v) =>
          window.creationStore.saveRoomCreationIntent(v.expectedPrincipal, v),
        first,
      ),
      b.evaluate(
        (v) =>
          window.creationStore.saveRoomCreationIntent(v.expectedPrincipal, v),
        second,
      ),
    ]);
    expect(results[0].requestId).toBe(results[1].requestId);
    expect(results[0].name).toBe("private name");
    await b.evaluate(
      (user) => window.creationStore.clearRoomCreationIntent(user),
      USER,
    );
    const next = record();
    await b.evaluate(
      (v) =>
        window.creationStore.saveRoomCreationIntent(v.expectedPrincipal, v),
      next,
    );
    await a.evaluate(
      ({ user, previous, room }) =>
        window.creationStore.saveRoomCreationResult(user, previous, room),
      { user: USER, previous: results[0], room: ROOM },
    );
    expect(
      (
        await b.evaluate(
          (user) => window.creationStore.readRoomCreationIntent(user),
          USER,
        )
      )?.requestId,
    ).toBe(next.requestId);
    expect(
      await a.evaluate(
        (user) => window.creationStore.readRoomCreationIntent(user),
        OTHER,
      ),
    ).toBeNull();
    await a.close();
    await b.close();
  });
  it("tab閉鎖/reload・端末時計の前後変更後も同IDとknown receiptを復元", async () => {
    let p = await tab();
    const current = await p.evaluate(
      (user) => window.creationStore.readRoomCreationIntent(user),
      USER,
    );
    if (!current) throw new Error();
    await p.evaluate(
      ({ user, v }) => window.creationStore.markRoomCreationSubmitted(user, v),
      { user: USER, v: current },
    );
    await p.close();
    p = await tab();
    await p.evaluate(() => {
      Date.now = () => 1;
    });
    expect(
      (
        await p.evaluate(
          (user) => window.creationStore.readRoomCreationIntent(user),
          USER,
        )
      )?.requestId,
    ).toBe(current.requestId);
    await p.evaluate(
      ({ user, v, room }) =>
        window.creationStore.saveRoomCreationResult(user, v, room),
      { user: USER, v: current, room: ROOM },
    );
    await p.reload();
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => {
      Date.now = () => 2 ** 48;
    });
    expect(
      await p.evaluate(
        (user) => window.creationStore.readRoomCreationIntent(user),
        USER,
      ),
    ).toMatchObject({ state: "known", roomId: ROOM, name: "" });
    await p.close();
  });
  it("put成功直後abortでもpromiseをrejectしrecordをcommitしない", async () => {
    const p = await tab();
    await p.evaluate(
      (user) => window.creationStore.clearRoomCreationIntent(user),
      USER,
    );
    const next = record();
    await p.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        const request = add.apply(this, args);
        request.addEventListener("success", () => this.transaction.abort());
        return request;
      };
    });
    expect(
      await p.evaluate(async (v) => {
        try {
          await window.creationStore.saveRoomCreationIntent(
            v.expectedPrincipal,
            v,
          );
          return "sent";
        } catch {
          return "not-sent";
        }
      }, next),
    ).toBe("not-sent");
    await p.close();
    const fresh = await tab();
    expect(
      await fresh.evaluate(
        (user) => window.creationStore.readRoomCreationIntent(user),
        USER,
      ),
    ).toBeNull();
    await fresh.close();
  });
  it("破損recordは新しいIDで置換せずfail closed", async () => {
    const p = await tab(),
      v = record();
    await p.evaluate(
      (v) =>
        window.creationStore.saveRoomCreationIntent(v.expectedPrincipal, v),
      v,
    );
    await p.evaluate(
      async ({ user, id }) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open("idea-boost-room-creations", 1);
          r.onsuccess = () => resolve(r.result);
        });
        await new Promise<void>((resolve) => {
          const tx = db.transaction("intents", "readwrite");
          tx.objectStore("intents").put({}, `${user}:${id}`);
          tx.oncomplete = () => resolve();
        });
        db.close();
      },
      { user: USER, id: v.requestId },
    );
    expect(
      await p.evaluate(async (user) => {
        try {
          await window.creationStore.readRoomCreationIntent(user);
          return false;
        } catch {
          return true;
        }
      }, USER),
    ).toBe(true);
    await p.close();
  });
});
it("壊れた控えの明示破棄後だけ新たな控えを作れる", async () => {
  const p = await tab();
  await p.evaluate(
    (user) => window.creationStore.discardRoomCreationRecords(user),
    USER,
  );
  expect(
    await p.evaluate(
      (user) => window.creationStore.readRoomCreationIntent(user),
      USER,
    ),
  ).toBeNull();
  const v = record();
  expect(
    (
      await p.evaluate(
        (v) =>
          window.creationStore.saveRoomCreationIntent(v.expectedPrincipal, v),
        v,
      )
    ).requestId,
  ).toBe(v.requestId);
  await p.close();
});

it("同じタブの作成成功通知も再訪の入口へ届ける", async () => {
  const page = await tab();
  const count = await page.evaluate(() => {
    let calls = 0;
    const stop = window.creationStore.subscribeRoomCreations(() => {
      calls++;
    });
    window.creationStore.notifyRoomCreations();
    stop();
    return calls;
  });
  expect(count).toBe(1);
});

it("移動中の通知は同じタブのBroadcastChannelからも確認を再開しない", async () => {
  const page = await tab();
  const count = await page.evaluate(async () => {
    let calls = 0;
    const stop = window.creationStore.subscribeRoomCreations(() => {
      calls++;
    });
    window.creationStore.notifyRoomCreations(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    stop();
    return calls;
  });
  expect(count).toBe(0);
});
