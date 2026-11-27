// 付箋の移動が「動かしたとおりに保存されたか」を、実ブラウザ2人・実RoomDOで数える計測。
// 場面ごとの成功数と失敗の理由を JSON で出し、台帳の基準を下回った場面があれば exit 1 で終わる。
// 使い方と読み方は docs/loop/note-move-reliability.md。
// 検証専用サーバー（npm run dev:verify）へ向けて実行する。
//
//   AUTH_APP_TEST_URL=http://localhost:3000 npm run probe:note-move
//
// 環境変数: NOTE_MOVE_PROBE_LATENCY_MS（片道の遅延、既定 80）、
// NOTE_MOVE_PROBE_SCENARIOS（カンマ区切りで絞る）、NOTE_MOVE_PROBE_OUT（JSON の出力先）、
// NOTE_MOVE_PROBE_DEBUG（準備に失敗した場面の画面を保存するディレクトリ）。
// 終了コード: 0 基準どおり / 1 基準を下回った場面がある / 2 使い方の誤り / 3 計測できなかった場面がある。
// page.evaluate に渡す関数はブラウザの中で動くので、このファイルだけ DOM の型を読む。
/// <reference lib="dom" />
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import {
  compareWithBaseline,
  type NoteMoveBaseline,
} from "./note-move-baseline.mts";

const app = process.env.AUTH_APP_TEST_URL;
const latencyMs = Number(process.env.NOTE_MOVE_PROBE_LATENCY_MS ?? 80);
const only = process.env.NOTE_MOVE_PROBE_SCENARIOS?.split(",").filter(Boolean);
const outPath = process.env.NOTE_MOVE_PROBE_OUT;

type Frame = { at: number; direction: "sent" | "received"; message: Wire };
type Wire = {
  type: string;
  operationId?: string;
  status?: string;
  reason?: string;
  message?: string;
  timer?: { status?: string };
};
type Member = {
  page: Page;
  frames: Frame[];
  name: string;
  // サーバーからの通知を1件、本人の接続へ差し込む（時間切れなど、起こすのに時間がかかる通知用）。
  inject: (message: Record<string, unknown>) => void;
};
type Box = { x: number; y: number; width: number; height: number };
type Attempt = {
  scenario: string;
  member: string;
  noteId: string;
  landed: boolean;
  // 失敗の分類。landed のときは null。
  reason: string | null;
  detail?: string;
};
type ScenarioResult = {
  scenario: string;
  description: string;
  attempts: number;
  landed: number;
  failed: number;
  reasons: Record<string, number>;
  error?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openMember(
  browser: Browser,
  name: string,
  email: string,
): Promise<Member> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const frames: Frame[] = [];
  let deliver: ((payload: string) => void) | null = null;
  // 本番に近い往復遅延を入れる。ローカルの 1ms では競合の窓が開かない。
  await page.routeWebSocket(/\/ws(?:\?|$)/, (socket) => {
    const server = socket.connectToServer();
    deliver = (payload) => {
      frames.push({
        at: Date.now(),
        direction: "received",
        message: JSON.parse(payload) as Wire,
      });
      socket.send(payload);
    };
    socket.onMessage((payload) => {
      frames.push({
        at: Date.now(),
        direction: "sent",
        message: JSON.parse(String(payload)) as Wire,
      });
      setTimeout(() => {
        try {
          server.send(payload);
        } catch {
          // 終了処理中の送信は捨てる。
        }
      }, latencyMs);
    });
    server.onMessage((payload) => {
      setTimeout(() => {
        frames.push({
          at: Date.now(),
          direction: "received",
          message: JSON.parse(String(payload)) as Wire,
        });
        try {
          socket.send(payload);
        } catch {
          // 終了処理中の受信は捨てる。
        }
      }, latencyMs);
    });
  });
  await page.goto(`${app}/login?next=%2Fdev%2Fverify`);
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill("password");
  await page
    .getByRole("button", { name: "開発用ユーザーでログイン", exact: true })
    .click();
  await page.waitForURL(`${app}/dev/verify`);
  return {
    page,
    frames,
    name,
    inject: (message) => deliver?.(JSON.stringify(message)),
  };
}

async function openRoom(
  browser: Browser,
  checkpoint: string,
): Promise<[Member, Member]> {
  const actor = await openMember(browser, "A", "owner@example.test");
  const peer = await openMember(browser, "B", "member@example.test");
  await Promise.all([
    actor.page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/verification/rooms") &&
        response.request().method() === "POST",
    ),
    actor.page
      .getByRole("button", { name: new RegExp(`^${checkpoint} `) })
      .click(),
  ]);
  const fixed = actor.page.getByRole("link", {
    name: "このルームを固定して開く（追従なし）",
  });
  await fixed.waitFor();
  const href = await fixed.getAttribute("href");
  if (!href) throw new Error("検証ルームのURLがありません。");
  for (const member of [actor, peer]) {
    await member.page.goto(`${app}${href}`);
    await member.page.getByTestId("board-canvas").waitFor();
    await member.page.evaluate(() => document.fonts.ready);
    await member.page
      .getByRole("button", { name: "ズームを100%に戻す" })
      .click();
  }
  for (const member of [actor, peer]) await closeDialogs(member);
  const startSharing = actor.page.getByRole("button", {
    name: "最初の人を開始",
    exact: true,
  });
  if (await startSharing.count()) await startSharing.click();
  else if (
    (await actor.page.getByTestId("room-timer").getAttribute("data-status")) !==
    "running"
  )
    await actor.page.getByTestId("room-timer").click();
  for (const member of [actor, peer]) await waitTimer(member, "running");
  await wait(600);
  for (const member of [actor, peer]) await closeDialogs(member);
  return [actor, peer];
}

// 入室時に開くステップガイドなどを閉じ、ボードを操作できる状態にする。
async function closeDialogs(member: Member): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await wait(300);
    if (
      (await member.page.locator('[data-slot="dialog-overlay"]').count()) === 0
    )
      return;
    await member.page.keyboard.press("Escape");
  }
}

async function waitTimer(member: Member, status: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (
      (await member.page
        .getByTestId("room-timer")
        .getAttribute("data-status")) === status
    )
      return;
    await wait(100);
  }
  throw new Error(`タイマーが ${status} になりません。`);
}

// ボード（通常・2軸マップ）に置かれた付箋。マイ付箋の一覧は含めない。
const noteSelector = (id: string) =>
  `[data-testid="note-card"][data-note-id="${id}"]:not([data-testid="private-notes-toolbar"] *)`;

async function box(member: Member, id: string): Promise<Box | null> {
  return member.page.locator(noteSelector(id)).first().boundingBox();
}

// 画面移動や拡大率に左右されないよう、合否はボード上の座標で比べる。
async function world(
  member: Member,
  id: string,
): Promise<{ x: number; y: number; scale: number } | null> {
  const card = member.page.locator(noteSelector(id)).first();
  if ((await card.count()) === 0) return null;
  return card.evaluate((element) => {
    const placed = element.closest<HTMLElement>(
      '[data-testid^="board-note-"], [data-testid^="idea-value-feasibility-map-note-"]',
    );
    if (!placed) return null;
    const style = getComputedStyle(placed);
    return {
      x: Number.parseFloat(style.left),
      y: Number.parseFloat(style.top),
      // left / top の座標系（親）の拡大率。2軸マップは付箋自身も縮むので親で測る。
      scale:
        placed.offsetParent instanceof HTMLElement &&
        placed.offsetParent.offsetWidth > 0
          ? placed.offsetParent.getBoundingClientRect().width /
            placed.offsetParent.offsetWidth
          : 1,
    };
  });
}

// 画面の中央寄りにあり、ほかの付箋やHUDに隠れていない共有付箋を選ぶ。
async function draggableNotes(member: Member): Promise<string[]> {
  return member.page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="note-card"][data-note-id]',
      ),
    ).filter((card) => !card.closest('[data-testid="private-notes-toolbar"]'));
    const ids: string[] = [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const x = rect.left + rect.width * 0.4;
      const y = rect.top + rect.height * 0.4;
      if (
        rect.left < 160 ||
        rect.top < 200 ||
        rect.right > window.innerWidth - 300 ||
        rect.bottom > window.innerHeight - 160
      )
        continue;
      const hit = document.elementFromPoint(x, y)?.closest("[data-note-id]");
      const id = card.dataset.noteId;
      if (id && hit?.getAttribute("data-note-id") === id) ids.push(id);
    }
    return ids;
  });
}

type DragOptions = {
  dx: number;
  dy: number;
  steps?: number;
  holdMs?: number;
  // 掴んで動かしている途中で差し込む処理（相手の操作やタイマー）。
  during?: () => Promise<void>;
};

// 掴む→動かす→離す。離した時点で付箋があるべき画面上の位置を返す。
async function dragNote(
  member: Member,
  id: string,
  options: DragOptions,
): Promise<{ expected: { x: number; y: number } } | null> {
  const before = await box(member, id);
  const origin = await world(member, id);
  if (!before || !origin) return null;
  const x = before.x + before.width * 0.4;
  const y = before.y + before.height * 0.4;
  // 先の操作で別の付箋が重なった場合は、計測の対象から外す（別の付箋を掴んでしまうため）。
  const hit = await member.page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest("[data-note-id]")
        ?.getAttribute("data-note-id") ?? null,
    [x, y],
  );
  if (hit !== id || x < 160 || y < 200 || x > 1440 - 300 || y > 900 - 160)
    return null;
  const mouse = member.page.mouse;
  await mouse.move(x, y);
  await mouse.down();
  const steps = options.steps ?? 6;
  const half = Math.ceil(steps / 2);
  await mouse.move(x + options.dx / 2, y + options.dy / 2, { steps: half });
  if (options.during) await options.during();
  if (options.holdMs) await wait(options.holdMs);
  await mouse.move(x + options.dx, y + options.dy, { steps: steps - half });
  await mouse.up();
  return {
    expected: {
      x: origin.x + options.dx / origin.scale,
      y: origin.y + options.dy / origin.scale,
    },
  };
}

// 送った確定に結果が返り切るまで待つ（上限つき）。
async function settle(members: Member[], since: number): Promise<void> {
  const deadline = Date.now() + 4_000;
  await wait(latencyMs * 2 + 150);
  while (Date.now() < deadline) {
    const waiting = members.some((member) => {
      const recent = member.frames.filter((frame) => frame.at >= since);
      const commits = recent.filter(
        (frame) =>
          frame.direction === "sent" &&
          frame.message.type === "note:move:commit",
      );
      return commits.some(
        (commit) =>
          !recent.some(
            (frame) =>
              frame.direction === "received" &&
              frame.message.type === "note:move:result" &&
              frame.message.operationId === commit.message.operationId &&
              frame.message.status !== "active",
          ),
      );
    });
    if (!waiting) break;
    await wait(50);
  }
  await wait(latencyMs * 2 + 250);
}

// 1回の操作の間に本人の接続を流れたメッセージから、失敗の理由を1つに決める。
function classify(member: Member, since: number): [string, string] {
  const recent = member.frames.filter((frame) => frame.at >= since);
  const sent = (type: string) =>
    recent.filter(
      (frame) => frame.direction === "sent" && frame.message.type === type,
    );
  const received = recent.filter((frame) => frame.direction === "received");
  const result = (status: string) =>
    received.find(
      (frame) =>
        frame.message.type === "note:move:result" &&
        frame.message.status === status,
    );
  const rejected = result("rejected");
  if (rejected)
    return ["server-rejected", rejected.message.reason ?? "（理由の文面なし）"];
  const expired = result("expired");
  if (expired) return ["server-expired", expired.message.reason ?? ""];
  if (result("unknown")) return ["server-unknown", ""];
  const error = received.find((frame) => frame.message.type === "error");
  if (error) return ["server-error", error.message.message ?? ""];
  if (sent("note:move:start").length === 0)
    return ["never-started", "note:move:start を送っていない"];
  if (sent("note:move:cancel").length > 0) {
    const trigger = received
      .map((frame) => frame.message)
      .find((message) =>
        [
          "notes:moved",
          "note:updated",
          "note:deleted",
          "timer:updated",
          "phase:updated",
          "snapshot",
          "decision:updated",
          "idea-map:state",
        ].includes(message.type),
      );
    return [
      "client-cancelled",
      trigger
        ? `受信 ${trigger.type}${trigger.timer?.status ? `(${trigger.timer.status})` : ""} の後に本人側が取り消した`
        : "本人側が取り消した",
    ];
  }
  if (sent("note:move:commit").length === 0)
    return ["never-committed", "note:move:commit を送っていない"];
  if (result("accepted")) return ["accepted", "保存は成功した"];
  return ["no-result", "確定の結果が返っていない"];
}

async function judge(
  scenario: string,
  member: Member,
  watcher: Member,
  id: string,
  since: number,
  expected: { x: number; y: number } | null,
  // 同じ付箋を2人が動かした場合など、どちらかの位置に収束していればよいとき。
  alternatives: Array<{ x: number; y: number }> = [],
  // 掴む直前に相手の移動が届くと、画面上の基準がずれる。そのずれまでは「動かせた」と数える。
  // 広げた許容で、断られて相手の位置へ戻った回を成功に数えないよう、RoomDO の受理も確かめる。
  tolerance = 2,
): Promise<Attempt> {
  const base = { scenario, member: member.name, noteId: id };
  if (!expected)
    return { ...base, landed: false, reason: "probe-skipped", detail: "" };
  let mine = await world(member, id);
  let theirs = await world(watcher, id);
  const saved = tolerance <= 2 || classify(member, since)[0] === "accepted";
  const near = (
    a: { x: number; y: number } | null,
    b: { x: number; y: number },
  ) => a !== null && Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;
  const close = (a: { x: number; y: number } | null) =>
    a !== null &&
    Math.abs(a.x - expected.x) <= tolerance &&
    Math.abs(a.y - expected.y) <= tolerance;
  if (mine && !near(theirs, mine)) {
    // 相手の画面は他者の移動を滑らかに追う。追い付く時間を1回だけ待つ。
    await wait(800);
    mine = await world(member, id);
    theirs = await world(watcher, id);
  }
  if (saved && close(mine) && mine && near(theirs, mine))
    return { ...base, landed: true, reason: null };
  if (mine && near(theirs, mine) && alternatives.some((p) => near(mine, p)))
    return {
      ...base,
      landed: false,
      reason: "overwritten-by-peer",
      detail: "相手の移動先に収束した",
    };
  if (mine && near(mine, expected) && !near(theirs, mine))
    return {
      ...base,
      landed: false,
      reason: "diverged",
      detail: "本人の画面では動いたが相手の画面と位置が違う",
    };
  const [classified, detail] = classify(member, since);
  // 保存は成功したのに、離した位置にない。
  const reason =
    classified === "accepted" ? "accepted-but-displaced" : classified;
  const at = (p: { x: number; y: number } | null) =>
    p ? `(${Math.round(p.x)},${Math.round(p.y)})` : "なし";
  return {
    ...base,
    landed: false,
    reason,
    detail: `${detail} / 期待${at(expected)} 本人${at(mine)} 相手${at(theirs)}`,
  };
}

type Scenario = {
  id: string;
  description: string;
  checkpoint: string;
  // 1ルームで1回しか試せない場面を、新しいルームで繰り返す回数。
  rooms?: number;
  run: (
    actor: Member,
    peer: Member,
    record: (a: Attempt) => void,
  ) => Promise<void>;
};

const offsets = [
  { dx: 60, dy: 30 },
  { dx: -50, dy: 40 },
  { dx: 40, dy: -45 },
  { dx: -60, dy: -30 },
];

const scenarios: Scenario[] = [
  {
    id: "solo",
    description: "1人が順に別々の付箋を動かす（基準）",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      for (let i = 0; i < 12; i++) {
        const id = ids[i % ids.length];
        const since = Date.now();
        const drag = await dragNote(actor, id, offsets[i % offsets.length]);
        await settle([actor, peer], since);
        record(
          await judge("solo", actor, peer, id, since, drag?.expected ?? null),
        );
      }
    },
  },
  {
    id: "select-then-drag",
    description: "付箋を1回押して選んでから、同じ付箋を動かす",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      for (let i = 0; i < 8; i++) {
        const id = ids[i % ids.length];
        const target = await box(actor, id);
        if (!target) continue;
        await actor.page.mouse.click(
          target.x + target.width * 0.4,
          target.y + target.height * 0.4,
        );
        await wait(150);
        const since = Date.now();
        const drag = await dragNote(actor, id, offsets[i % offsets.length]);
        await settle([actor, peer], since);
        record(
          await judge(
            "select-then-drag",
            actor,
            peer,
            id,
            since,
            drag?.expected ?? null,
          ),
        );
        await actor.page.keyboard.press("Escape");
      }
    },
  },
  {
    id: "double-click-then-drag",
    description:
      "付箋を2回押した（本文の編集が開く）あと、そのまま同じ付箋を動かす",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      for (let i = 0; i < 8; i++) {
        const id = ids[i % ids.length];
        const target = await box(actor, id);
        if (!target) continue;
        const x = target.x + target.width * 0.4;
        const y = target.y + target.height * 0.4;
        await actor.page.mouse.click(x, y);
        await wait(250);
        await actor.page.mouse.click(x, y);
        await wait(250);
        const since = Date.now();
        const drag = await dragNote(actor, id, offsets[i % offsets.length]);
        await settle([actor, peer], since);
        const attempt = await judge(
          "double-click-then-drag",
          actor,
          peer,
          id,
          since,
          drag?.expected ?? null,
        );
        const editing =
          (await actor.page
            .locator(noteSelector(id))
            .first()
            .getAttribute("data-editing")) === "true";
        record(
          !attempt.landed && attempt.reason === "never-started" && editing
            ? {
                ...attempt,
                reason: "blocked-by-editing",
                detail: "本文の編集中で、付箋を掴めない",
              }
            : attempt,
        );
        await actor.page.keyboard.press("Escape");
        await actor.page.mouse.click(360, 220);
        await wait(150);
      }
    },
  },
  {
    id: "share-then-move",
    description:
      "共有ステップでマイ付箋をボードへ出し、置いた直後にもう一度動かす",
    checkpoint: "1-2",
    rooms: 8,
    async run(actor, peer, record) {
      // 共有できるのは今の発表者だけ。発表者の側で操作する。
      const waits = async (member: Member) =>
        (await member.page.getByText("自分の番で発表できます").count()) > 0;
      const waiting = await waits(actor);
      // 最初の発表者は検証ルームごとに変わる。2人とも順番待ちのルームは数えない。
      if (waiting && (await waits(peer))) return;
      const sharer = waiting ? peer : actor;
      const watcher = waiting ? actor : peer;
      const card = sharer.page
        .locator(
          '[data-testid="private-notes-toolbar"] [data-testid="note-card"][data-note-id]',
        )
        .filter({ visible: true })
        .first();
      const id = await card.getAttribute("data-note-id");
      const from = await card.boundingBox();
      if (!id || !from) throw new Error("マイ付箋がありません。");
      const mouse = sharer.page.mouse;
      await mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await mouse.down();
      await mouse.move(700, 320, { steps: 8 });
      await mouse.up();
      // 共有の確定が返る前に掴み直す。
      await wait(60);
      const since = Date.now();
      const drag = await dragNote(sharer, id, { dx: 70, dy: 40 });
      await settle([sharer, watcher], since);
      await wait(600);
      const attempt = await judge(
        "share-then-move",
        sharer,
        watcher,
        id,
        since,
        drag?.expected ?? null,
      );
      record(
        drag
          ? attempt
          : {
              ...attempt,
              reason: "not-on-board",
              detail: "共有した付箋がボードに出ていない",
            },
      );
    },
  },
  {
    id: "parallel-different-notes",
    description: "2人が同時に別々の付箋を動かす（グループ化の通常の使い方）",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      const peerIds = new Set(await draggableNotes(peer));
      const shared = ids.filter((id) => peerIds.has(id));
      for (let i = 0; i < 12; i++) {
        const a = shared[(2 * i) % shared.length];
        const b = shared[(2 * i + 1) % shared.length];
        if (a === b) continue;
        const since = Date.now();
        const [dragA, dragB] = await Promise.all([
          dragNote(actor, a, { ...offsets[i % 4], holdMs: 120 }),
          dragNote(peer, b, { ...offsets[(i + 1) % 4], holdMs: 120 }),
        ]);
        await settle([actor, peer], since);
        record(
          await judge(
            "parallel-different-notes",
            actor,
            peer,
            a,
            since,
            dragA?.expected ?? null,
          ),
        );
        record(
          await judge(
            "parallel-different-notes",
            peer,
            actor,
            b,
            since,
            dragB?.expected ?? null,
          ),
        );
      }
    },
  },
  {
    id: "queued-while-peer-moves",
    description: "1人が3枚を続けて動かしている間に、相手が別の1枚を動かす",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      const peerIds = new Set(await draggableNotes(peer));
      const shared = ids.filter((id) => peerIds.has(id));
      for (let i = 0; i < 4; i++) {
        const mine = [0, 1, 2].map((k) => shared[(4 * i + k) % shared.length]);
        const theirs = shared[(4 * i + 3) % shared.length];
        if (new Set([...mine, theirs]).size < 4) continue;
        const since = Date.now();
        const peerDrag = dragNote(peer, theirs, {
          ...offsets[(i + 2) % 4],
          holdMs: 60,
        });
        const drags = [];
        for (const [k, id] of mine.entries())
          drags.push(
            await dragNote(actor, id, { ...offsets[(i + k) % 4], steps: 3 }),
          );
        const dragB = await peerDrag;
        await settle([actor, peer], since);
        for (const [k, id] of mine.entries())
          record(
            await judge(
              "queued-while-peer-moves",
              actor,
              peer,
              id,
              since,
              drags[k]?.expected ?? null,
            ),
          );
        record(
          await judge(
            "queued-while-peer-moves",
            peer,
            actor,
            theirs,
            since,
            dragB?.expected ?? null,
          ),
        );
      }
    },
  },
  {
    id: "after-peer-moved-same-note",
    description: "相手が動かし終えた直後の同じ付箋を、すぐに動かす",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      const peerIds = new Set(await draggableNotes(peer));
      const shared = ids.filter((id) => peerIds.has(id));
      for (let i = 0; i < 10; i++) {
        const id = shared[i % shared.length];
        // 相手が動かせなかった回は、この場面にならないので数えない。
        if (!(await dragNote(peer, id, { dx: 24, dy: 16, steps: 3 }))) continue;
        // 相手の確定が本人へ届く前後（遅延の0〜2倍）で掴む。
        await wait((latencyMs * 2 * (i % 5)) / 4);
        const since = Date.now();
        const drag = await dragNote(actor, id, offsets[i % 4]);
        await settle([actor, peer], since);
        record(
          await judge(
            "after-peer-moved-same-note",
            actor,
            peer,
            id,
            since,
            drag?.expected ?? null,
            [],
            45,
          ),
        );
      }
    },
  },
  {
    id: "same-note-contention",
    description: "2人が同時に同じ付箋を掴む（どちらか一方は必ず負ける）",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      const peerIds = new Set(await draggableNotes(peer));
      const shared = ids.filter((id) => peerIds.has(id));
      for (let i = 0; i < 8; i++) {
        const id = shared[i % shared.length];
        const since = Date.now();
        const [dragA, dragB] = await Promise.all([
          dragNote(actor, id, { dx: 70, dy: 20, holdMs: 200 }),
          dragNote(peer, id, { dx: -70, dy: 20, holdMs: 200 }),
        ]);
        // 片方が掴めなかった回は競合にならないので数えない。
        if (!dragA || !dragB) continue;
        await settle([actor, peer], since);
        const alternatives = [dragA?.expected, dragB?.expected].filter(
          (p): p is { x: number; y: number } => !!p,
        );
        record(
          await judge(
            "same-note-contention",
            actor,
            peer,
            id,
            since,
            dragA?.expected ?? null,
            alternatives,
          ),
        );
        record(
          await judge(
            "same-note-contention",
            peer,
            actor,
            id,
            since,
            dragB?.expected ?? null,
            alternatives,
          ),
        );
      }
    },
  },
  {
    id: "timer-ends-while-dragging",
    description: "掴んでいる最中に時間切れの通知が届く",
    checkpoint: "1-3",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      for (let i = 0; i < 4; i++) {
        const id = ids[i % ids.length];
        const since = Date.now();
        // 時間切れの後も RoomDO は移動を受け付ける。通知だけを差し込み、本人側が
        // 自分から取り消さないかを見る。
        const drag = await dragNote(actor, id, {
          ...offsets[i % 4],
          holdMs: 200,
          during: async () =>
            actor.inject({
              type: "timer:updated",
              timer: { status: "ended", durationMs: 240_000 },
              serverNow: Date.now(),
            }),
        });
        await settle([actor, peer], since);
        record(
          await judge(
            "timer-ends-while-dragging",
            actor,
            peer,
            id,
            since,
            drag?.expected ?? null,
          ),
        );
        await wait(latencyMs * 2 + 300);
      }
    },
  },
  {
    id: "map-parallel",
    description: "2軸マップで2人が同時に別々の付箋を動かす",
    checkpoint: "3-2",
    async run(actor, peer, record) {
      const ids = await draggableNotes(actor);
      const peerIds = new Set(await draggableNotes(peer));
      const shared = ids.filter((id) => peerIds.has(id));
      for (let i = 0; i < 8; i++) {
        const a = shared[(2 * i) % shared.length];
        const b = shared[(2 * i + 1) % shared.length];
        if (!a || !b || a === b) continue;
        const since = Date.now();
        const [dragA, dragB] = await Promise.all([
          dragNote(actor, a, { dx: 30, dy: 20, holdMs: 120 }),
          dragNote(peer, b, { dx: -30, dy: 20, holdMs: 120 }),
        ]);
        await settle([actor, peer], since);
        record(
          await judge(
            "map-parallel",
            actor,
            peer,
            a,
            since,
            dragA?.expected ?? null,
          ),
        );
        record(
          await judge(
            "map-parallel",
            peer,
            actor,
            b,
            since,
            dragB?.expected ?? null,
          ),
        );
      }
    },
  },
];

async function main(): Promise<void> {
  if (!app) {
    console.error(
      "AUTH_APP_TEST_URL に検証専用サーバー（npm run dev:verify）のURLを指定してください。",
    );
    process.exit(2);
  }
  const unknown = (only ?? []).filter(
    (id) => !scenarios.some((scenario) => scenario.id === id),
  );
  if (unknown.length > 0 || only?.length === 0) {
    console.error(
      `NOTE_MOVE_PROBE_SCENARIOS に無い場面名があります: ${unknown.join(", ") || "（空）"}。場面名: ${scenarios.map((scenario) => scenario.id).join(", ")}`,
    );
    process.exit(2);
  }
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    console.error(
      "NOTE_MOVE_PROBE_LATENCY_MS は 0 以上の数で指定してください。",
    );
    process.exit(2);
  }
  const results: ScenarioResult[] = [];
  const failures: Attempt[] = [];
  for (const scenario of scenarios) {
    if (only && !only.includes(scenario.id)) continue;
    const attempts: Attempt[] = [];
    let error: string | undefined;
    for (let room = 0; room < (scenario.rooms ?? 1); room++) {
      let browser: Browser | undefined;
      try {
        browser = await chromium.launch();
        // 入室の読み込みが遅れることがあるので、1回だけやり直す。
        const [actor, peer] = await openRoom(
          browser,
          scenario.checkpoint,
        ).catch(() => openRoom(browser as Browser, scenario.checkpoint));
        // 掴めなかった回（別の付箋の下に隠れた等）は計測に数えない。
        await scenario.run(actor, peer, (attempt) => {
          if (attempt.reason !== "probe-skipped") attempts.push(attempt);
        });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        if (process.env.NOTE_MOVE_PROBE_DEBUG)
          for (const [index, context] of (browser?.contexts() ?? []).entries())
            await context
              .pages()[0]
              ?.screenshot({
                path: `${process.env.NOTE_MOVE_PROBE_DEBUG}/${scenario.id}-${room}-${index}.png`,
              })
              .catch(() => {});
      } finally {
        await browser?.close();
      }
    }
    const failed = attempts.filter((attempt) => !attempt.landed);
    failures.push(...failed);
    const reasons: Record<string, number> = {};
    for (const attempt of failed) {
      const key = attempt.reason ?? "unknown";
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
    results.push({
      scenario: scenario.id,
      description: scenario.description,
      attempts: attempts.length,
      landed: attempts.length - failed.length,
      failed: failed.length,
      reasons,
      ...(error ? { error } : {}),
    });
    console.error(
      `${scenario.id}: ${attempts.length - failed.length}/${attempts.length} ${JSON.stringify(reasons)}${error ? ` error=${error}` : ""}`,
    );
  }
  const attempts = results.reduce((sum, r) => sum + r.attempts, 0);
  const landed = results.reduce((sum, r) => sum + r.landed, 0);
  const baseline = JSON.parse(
    await readFile(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../docs/loop/note-move-baseline.json",
      ),
      "utf8",
    ),
  ) as NoteMoveBaseline & { latencyMs: number };
  // 下限は決まった遅延で測った値。遅延を変えると競合の起き方が変わるので、比べない。
  const comparable = latencyMs === baseline.latencyMs;
  const comparison = compareWithBaseline(
    results,
    comparable ? baseline : { scenarios: {} },
  );
  const report = {
    measuredAt: new Date().toISOString(),
    latencyMs,
    attempts,
    landed,
    failed: attempts - landed,
    ...comparison,
    scenarios: results,
    failures,
  };
  const json = JSON.stringify(report, null, 2);
  if (outPath) await writeFile(outPath, `${json}\n`);
  console.log(json);
  const percent = (rate: number) => `${Math.round(rate * 100)}%`;
  for (const gap of comparison.regressions)
    console.error(
      `基準を下回りました: ${gap.scenario} ${percent(gap.landedRate)} < ${percent(gap.minLandedRate)}`,
    );
  for (const id of comparison.inconclusive)
    console.error(`計測できませんでした: ${id}`);
  for (const gap of comparison.improved)
    console.error(
      `基準を上回りました（直した PR で基準を引き上げる）: ${gap.scenario} ${percent(gap.landedRate)} > ${percent(gap.minLandedRate)}`,
    );
  if (!comparable)
    console.error(
      `下限は片道 ${baseline.latencyMs}ms で測った値です。${latencyMs}ms の結果は下限と比べていません。`,
    );
  if (comparison.regressions.length > 0) process.exitCode = 1;
  else if (comparison.inconclusive.length > 0 || !comparable)
    process.exitCode = 3;
}

// 計測そのものが動かなかったとき（ブラウザが無い、下限の JSON が壊れている等）は、
// 「下限を下回った」の exit 1 と区別する。
await main().catch((cause) => {
  console.error("計測を実行できませんでした:", cause);
  process.exitCode = 3;
});
