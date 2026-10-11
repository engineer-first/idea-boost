import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { decodeJwt } from "jose";
import { chromium, type Locator, type Page } from "playwright";

export type PreviewBrowserSmokeInput = {
  origin: string;
  // この実行だけで生成した架空本人のAccess JWT。実本人のCookieを読み出さない。
  accessTokens: readonly [string, string];
};

type Trace = { sent: string[]; received: string[] };
type Frame = {
  type: string;
  phase?: { kind: string; phase: number; step: number };
  notes?: Array<{
    id: string;
    authorId: string;
    visibility: string;
    content: string;
  }>;
};
async function poll(
  check: () => Promise<boolean> | boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(`Previewの2本人UI検証に失敗: ${label}`);
}
function traceSockets(page: Page): Trace {
  const trace: Trace = { sent: [], received: [] };
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/rooms/")) return;
    socket.on("framesent", ({ payload }) => trace.sent.push(String(payload)));
    socket.on("framereceived", ({ payload }) =>
      trace.received.push(String(payload)),
    );
  });
  return trace;
}
function frames(trace: Trace): Frame[] {
  return trace.received.map((raw) => JSON.parse(raw) as Frame);
}
function snapshots(trace: Trace): Frame[] {
  return frames(trace).filter((frame) => frame.type === "snapshot");
}
function privateCard(page: Page, id: string): Locator {
  return page
    .getByTestId("private-notes-toolbar")
    .locator(`[data-note-id="${id}"]`);
}
async function openPrivateNotes(page: Page): Promise<void> {
  const toolbar = page.getByTestId("private-notes-toolbar");
  if ((await toolbar.getAttribute("data-expanded")) !== "true")
    await page
      .getByRole("button", { name: "マイ付箋を開く", exact: true })
      .click();
}
async function editNote(
  page: Page,
  card: Locator,
  content: string,
): Promise<void> {
  const surface = card.getByRole("button", { name: "付箋", exact: true });
  if ((await card.locator("textarea:not([readonly])").count()) === 0) {
    await surface.focus();
    await surface.press("Enter");
    await surface.press("Enter");
  }
  const editor = card.locator("textarea:not([readonly])");
  await editor.fill(content);
  await editor.press("Tab");
  await page
    .getByTestId("board-canvas")
    .click({ position: { x: 400, y: 420 } });
}
async function publishNote(
  page: Page,
  id: string,
  dropX: number,
): Promise<void> {
  await openPrivateNotes(page);
  const box = await privateCard(page, id).boundingBox();
  assert.ok(box, "共有する付箋の表示位置が必要です。");
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 16, y, { steps: 2 });
  await page.mouse.move(dropX, 430, { steps: 16 });
  await page.mouse.up();
}
async function waitForPhase(trace: Trace, step: number): Promise<void> {
  await poll(
    () =>
      frames(trace).some(
        (frame) =>
          frame.phase?.kind === "step" &&
          frame.phase.phase === 1 &&
          frame.phase.step === step,
      ),
    `課題フェーズのステップ${step}がWSで届く`,
  );
}
async function advancePhase(
  owner: Page,
  traces: readonly Trace[],
  step: number,
): Promise<void> {
  await owner
    .getByRole("button", { name: "次のステップへ", exact: true })
    .click();
  await owner
    .getByRole("alertdialog", { name: "次のステップへ進みますか？" })
    .getByRole("button", { name: "移行する", exact: true })
    .click();
  await Promise.all(traces.map((trace) => waitForPhase(trace, step)));
}

// localhostのHTTPSだけを使う。テストIdPのJWTをサーバーが検証し、通常の
// Preview session Cookieを発行した後は、本物のApp/API/RoomDOをUIから操作する。
// ブラウザの証明書例外はMiniflareの自己署名証明書だけのためで、本番設定を変えない。
export async function smokePreviewBrowserCollaboration(
  input: PreviewBrowserSmokeInput,
): Promise<void> {
  const url = new URL(input.origin);
  assert.equal(url.protocol, "https:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const browser = await chromium.launch();
  try {
    const contexts = await Promise.all(
      input.accessTokens.map(async (token) => {
        const context = await browser.newContext({
          ignoreHTTPSErrors: true,
          viewport: { width: 1440, height: 900 },
        });
        await context.addCookies([
          {
            name: "CF_Authorization",
            value: token,
            url: input.origin,
            secure: true,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        return context;
      }),
    );
    const [owner, member] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    owner.setDefaultTimeout(15_000);
    member.setDefaultTimeout(15_000);
    const ownerTrace = traceSockets(owner);
    const memberTrace = traceSockets(member);
    await Promise.all(
      [owner, member].map((page) => page.goto(`${input.origin}/preview`)),
    );
    await Promise.all(
      [owner, member].map((page) =>
        page.getByRole("heading", { name: "確認するステップを選ぶ" }).waitFor(),
      ),
    );
    const sessions = await Promise.all(
      contexts.map(async (context) => {
        const session = (await context.cookies()).find(
          (cookie) => cookie.name === "__Host-idea_boost_preview_session",
        );
        assert.ok(
          session,
          "AppがPreview session Cookieを発行する必要があります。",
        );
        assert.ok(session.httpOnly && session.secure);
        return decodeJwt(session.value);
      }),
    );
    assert.notEqual(
      sessions[0].sub,
      sessions[1].sub,
      "2本人を同じアプリユーザーへ割り当ててはいけません。",
    );

    await owner.getByRole("button", { name: /^1-1 / }).click();
    await owner.waitForURL(/\/rooms\/[a-f0-9-]+$/);
    const roomUrl = owner.url();
    await owner.getByTestId("board-canvas").waitFor();
    await poll(() => snapshots(ownerTrace).length > 0, "作成者のWS snapshot");
    const ownerSnapshot = snapshots(ownerTrace)[0];
    assert.equal(ownerSnapshot.notes?.length, 12);
    assert.ok(
      ownerSnapshot.notes?.every(
        (note) =>
          note.authorId === sessions[0].sub && note.visibility === "private",
      ),
    );
    await owner.getByRole("button", { name: "招待", exact: true }).click();
    const inviteUrl = await owner
      .getByRole("button", { name: "招待URLをコピー" })
      .innerText();
    assert.equal(new URL(inviteUrl).origin, input.origin);
    await owner.keyboard.press("Escape");
    await member.goto(inviteUrl);
    await member.getByRole("button", { name: "参加する", exact: true }).click();
    await member.waitForURL(roomUrl);
    await member.getByTestId("board-canvas").waitFor();
    await poll(() => snapshots(memberTrace).length > 0, "参加者のWS snapshot");
    assert.equal(
      snapshots(memberTrace)[0].notes?.length,
      0,
      "参加者のマイ付箋は空から始まります。",
    );
    assert.equal(
      await member
        .getByTestId("private-notes-toolbar")
        .getByTestId("note-card")
        .count(),
      0,
    );

    const ownerNoteId = ownerSnapshot.notes?.[0].id;
    assert.ok(ownerNoteId);
    const ownerPrivateText = "ローカル本人Aだけの編集済み下書き";
    const memberPrivateText = "ローカル本人Bだけの追加済み下書き";
    await editNote(owner, privateCard(owner, ownerNoteId), ownerPrivateText);
    await member
      .getByRole("button", { name: "付箋を追加", exact: true })
      .click();
    const added = member
      .getByTestId("private-notes-toolbar")
      .getByTestId("note-card")
      .first();
    await added.waitFor();
    const memberNoteId = await added.getAttribute("data-note-id");
    assert.ok(memberNoteId);
    await editNote(member, added, memberPrivateText);
    await poll(
      () =>
        ownerTrace.sent.some((raw) => raw.includes(ownerPrivateText)) &&
        memberTrace.sent.some((raw) => raw.includes(memberPrivateText)),
      "2本人の編集要求を実WSで送る",
    );
    await member.reload();
    await member.getByTestId("board-canvas").waitFor();
    await poll(
      () =>
        snapshots(memberTrace).some((frame) =>
          frame.notes?.some(
            (note) =>
              note.id === memberNoteId && note.content === memberPrivateText,
          ),
        ),
      "再入室後の参加者の下書き",
    );
    assert.ok(
      !memberTrace.received.some((raw) => raw.includes(ownerPrivateText)),
      "作成者の私有本文を参加者へ配信してはいけません。",
    );
    assert.ok(
      !ownerTrace.received.some((raw) => raw.includes(memberPrivateText)),
      "参加者の私有本文を作成者へ配信してはいけません。",
    );

    await advancePhase(owner, [ownerTrace, memberTrace], 2);
    await owner
      .getByRole("button", { name: "次の人へ", exact: true })
      .waitFor();
    await poll(
      () =>
        owner
          .getByRole("button", { name: "次の人へ", exact: true })
          .isEnabled(),
      "作成者の共有ターン",
    );
    await publishNote(owner, ownerNoteId, 430);
    await poll(
      () => memberTrace.received.some((raw) => raw.includes(ownerPrivateText)),
      "共有後の作成者本文を参加者へ配信する",
    );
    await owner.getByRole("button", { name: "次の人へ", exact: true }).click();
    await poll(
      () =>
        member
          .getByRole("button", { name: "次の人へ", exact: true })
          .isEnabled(),
      "参加者の共有ターン",
    );
    await publishNote(member, memberNoteId, 760);
    await poll(
      () => ownerTrace.received.some((raw) => raw.includes(memberPrivateText)),
      "共有後の参加者本文を作成者へ配信する",
    );
    await member.getByRole("button", { name: "次の人へ", exact: true }).click();

    await advancePhase(owner, [ownerTrace, memberTrace], 3);
    await advancePhase(owner, [ownerTrace, memberTrace], 4);
    for (const page of [owner, member]) {
      const target = page
        .getByTestId("board-canvas")
        .locator(`[data-note-id="${ownerNoteId}"]`);
      for (const [kind, count] of [
        ["主観", 1],
        ["客観", 3],
      ] as const) {
        for (let remaining = count; remaining > 0; remaining--) {
          await page
            .getByRole("button", {
              name: `${kind}シール 残り${remaining}票`,
              exact: true,
            })
            .click();
          await target
            .getByRole("button", { name: /^付箋/ })
            .click({ position: { x: 50 + remaining * 12, y: 55 } });
          await poll(
            () =>
              page
                .getByRole("button", {
                  name: `${kind}シール 残り${remaining - 1}票`,
                  exact: true,
                })
                .count()
                .then((count) => count === 1),
            "投票の受理と残票",
          );
        }
      }
    }
    assert.ok(
      ownerTrace.sent.some((raw) =>
        raw.includes('"type":"note:vote-sticker:add"'),
      ),
    );
    assert.ok(
      memberTrace.sent.some((raw) =>
        raw.includes('"type":"note:vote-sticker:add"'),
      ),
    );
    await advancePhase(owner, [ownerTrace, memberTrace], 5);
    await member.goto(`${input.origin}/preview`);
    await member.goto(inviteUrl);
    await member.getByRole("button", { name: "参加する", exact: true }).click();
    await member.waitForURL(roomUrl);
    await member.getByTestId("board-canvas").waitFor();
    await poll(
      () =>
        snapshots(memberTrace).some(
          (frame) =>
            frame.phase?.step === 5 &&
            frame.notes?.some(
              (note) =>
                note.id === memberNoteId && note.content === memberPrivateText,
            ),
        ),
      "再参加後も共有済み本文と進行を保持する",
    );
    console.log(
      JSON.stringify({
        test: "compiled-preview-browser-collaboration",
        state: "succeeded",
        browserContexts: 2,
        authentication: "local RS256 test IdP; not two real Google accounts",
        checks: [
          "App issued separate HttpOnly sessions",
          "invite/join",
          "empty participant drafts",
          "private contents not delivered",
          "UI add/edit/share",
          "two voters",
          "phase sync",
          "reentry retains notes",
        ],
      }),
    );
  } finally {
    await browser.close();
  }
}
