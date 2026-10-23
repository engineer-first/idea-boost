import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { decodeJwt } from "jose";
import { chromium, type Locator, type Page } from "playwright";

export type PreviewBrowserSmokeInput = {
  origin: string;
  // この実行だけで生成した架空本人のAccess JWT。実本人のCookieを読み出さない。
  accessTokens: readonly [string, string];
  screenshotDirectory?: string;
};

type Trace = { sent: string[]; received: string[]; connections: string[][] };
type Frame = {
  type: string;
  phase?: { kind: string; phase: number; step: number };
  progress?: { allReady: boolean; readyUserIds: string[] };
  notes?: Array<{
    id: string;
    authorId: string;
    visibility: string;
    content: string;
    dotVotes?: {
      subjective: { count: number };
      objective: { count: number };
    };
  }>;
};
function completed(check: string): void {
  console.log(
    JSON.stringify({
      test: "compiled-preview-browser-collaboration",
      state: "checkpoint",
      check,
      authentication: "local test IdP; not real Google accounts",
    }),
  );
}
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
  const trace: Trace = { sent: [], received: [], connections: [] };
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/rooms/")) return;
    const received: string[] = [];
    trace.connections.push(received);
    socket.on("framesent", ({ payload }) => trace.sent.push(String(payload)));
    socket.on("framereceived", ({ payload }) => {
      const message = String(payload);
      trace.received.push(message);
      received.push(message);
    });
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
  await page.getByRole("button", { name: "ルームメニューを開く" }).focus();
}
async function publishNote(
  page: Page,
  id: string,
  dropX: number,
): Promise<void> {
  // 発表者が切り替わった直後はカウントダウン中で、まだ共有できない。
  await openPrivateNotes(page);
  await page
    .getByText("あなたの番です。付箋をボードへドラッグして共有できます。", {
      exact: true,
    })
    .waitFor();
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
// allReadyは接続中の全員が基準のため、参加者の切断でも成立しないよう人数も見る。
async function waitForAllReady(trace: Trace, step: number): Promise<void> {
  await poll(
    () => {
      const progress = frames(trace).findLast(
        (frame) => frame.type === "phase:progress",
      )?.progress;
      return progress?.allReady === true && progress.readyUserIds.length === 2;
    },
    `ステップ${step - 1}で2本人の完了がWSで届く`,
  );
}
async function advancePhase(
  owner: Page,
  traces: readonly Trace[],
  step: number,
): Promise<void> {
  // 完了ボタンの演出中は次への要求が無視されるため、固定時間ではなく
  // UIが再び操作を受け付ける状態まで待つ。
  await poll(
    async () =>
      (await owner
        .getByTestId("board-control-hud")
        .getAttribute("data-completion-cue")) === "idle",
    "作成者の完了操作が終了する",
  );
  await owner
    .getByRole("button", { name: "次のステップへ", exact: true })
    .click();
  // 全員完了の受信後でも、画面への反映が遅れれば確認が開く。一度開いた確認は
  // 全員完了後も残るため、WSの移行か確認の表示を待つ。未完了メンバーの確認は
  // 完了同期の失敗を強制移行で隠すため、ここでは受け付けない。
  const confirmation = owner.getByRole("alertdialog", {
    name: /^(次のステップへ進みますか？|全員が完了しました)$/,
  });
  await poll(
    async () =>
      frames(traces[0]).some(
        (frame) =>
          frame.phase?.kind === "step" &&
          frame.phase.phase === 1 &&
          frame.phase.step === step,
      ) || (await confirmation.isVisible()),
    `ステップ${step}への移行または確認の表示`,
  );
  if (await confirmation.isVisible())
    await confirmation
      .getByRole("button", { name: "次へ進む", exact: true })
      .click();
  await Promise.all(traces.map((trace) => waitForPhase(trace, step)));
}
async function waitForRoom(page: Page, roomUrl: string): Promise<void> {
  const expected = new URL(roomUrl);
  // 通常の招待参加は署名付き入室ticketをqueryに付けてstart経由で入る。
  await page.waitForURL(
    (url) =>
      url.origin === expected.origin && url.pathname === expected.pathname,
  );
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
    const screenshots: string[] = [];
    const capture = async (page: Page, name: string): Promise<void> => {
      if (!input.screenshotDirectory) return;
      await mkdir(input.screenshotDirectory, { recursive: true });
      const path = resolve(input.screenshotDirectory, `${name}.png`);
      // ページ本体だけを保存し、ticket付きアドレスバーやCookieは撮らない。
      await page.screenshot({ path, animations: "disabled" });
      screenshots.push(path);
    };
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
    // 個人入力では共有キャンバスを隠し、マイ付箋を全面に表示する。
    await owner.getByTestId("private-notes-workspace").waitFor();
    await owner.getByRole("button", { name: /^タイマー 未開始/ }).click();
    await owner.getByRole("button", { name: "開始", exact: true }).click();
    await owner.keyboard.press("Escape");
    await poll(() => snapshots(ownerTrace).length > 0, "作成者のWS snapshot");
    const ownerSnapshot = snapshots(ownerTrace)[0];
    assert.equal(ownerSnapshot.notes?.length, 12);
    assert.ok(
      ownerSnapshot.notes?.every(
        (note) =>
          note.authorId === sessions[0].sub && note.visibility === "private",
      ),
    );
    await owner.getByRole("button", { name: "ルームメニューを開く" }).click();
    await owner.getByRole("button", { name: "招待", exact: true }).click();
    const inviteUrl = await owner
      .getByRole("button", { name: "招待URLをコピー" })
      .innerText();
    assert.equal(new URL(inviteUrl).origin, input.origin);
    await owner.keyboard.press("Escape");
    await owner.keyboard.press("Escape");
    await member.goto(inviteUrl);
    await member.getByRole("button", { name: "参加する", exact: true }).click();
    await waitForRoom(member, roomUrl);
    await member.getByTestId("private-notes-workspace").waitFor();
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
    await capture(member, "participant-empty-drafts");

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
    await poll(
      () =>
        ownerTrace.received.some((raw) => raw.includes(ownerPrivateText)) &&
        memberTrace.received.some((raw) => raw.includes(memberPrivateText)),
      "2本人の編集内容をサーバーが受理する",
    );
    await member.reload();
    await member.getByTestId("private-notes-workspace").waitFor();
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
    completed(
      "separate sessions; invite/join; empty drafts; private add/edit; reentry",
    );

    for (const page of [owner, member])
      await page.getByRole("button", { name: "完了", exact: true }).click();
    await waitForAllReady(ownerTrace, 2);
    await advancePhase(owner, [ownerTrace, memberTrace], 2);
    await owner.getByTestId("sharing-advance").waitFor();
    await poll(
      () => owner.getByTestId("sharing-advance").isEnabled(),
      "作成者の共有ターン",
    );
    await publishNote(owner, ownerNoteId, 430);
    await poll(
      () => memberTrace.received.some((raw) => raw.includes(ownerPrivateText)),
      "共有後の作成者本文を参加者へ配信する",
    );
    await owner.getByTestId("sharing-advance").click();
    await poll(
      () => member.getByTestId("sharing-advance").isEnabled(),
      "参加者の共有ターン",
    );
    await publishNote(member, memberNoteId, 760);
    await poll(
      () => ownerTrace.received.some((raw) => raw.includes(memberPrivateText)),
      "共有後の参加者本文を作成者へ配信する",
    );
    await member.getByTestId("sharing-advance").click();

    // 最後の発表者の完了操作で整理ステップへ自動で進む。
    await Promise.all(
      [ownerTrace, memberTrace].map((trace) => waitForPhase(trace, 3)),
    );
    await capture(owner, "owner-shared-notes");
    await capture(member, "participant-shared-notes");
    for (const page of [owner, member])
      await page.getByRole("button", { name: "完了", exact: true }).click();
    await waitForAllReady(ownerTrace, 4);
    await advancePhase(owner, [ownerTrace, memberTrace], 4);
    await owner.getByRole("button", { name: /^タイマー 未開始/ }).click();
    await owner.getByRole("button", { name: "開始", exact: true }).click();
    await owner.keyboard.press("Escape");
    completed("two participants shared notes; phase 1-2 to 1-4 synchronized");
    for (const page of [owner, member]) {
      const target = page
        .getByTestId("board-canvas")
        .locator(`[data-note-id="${ownerNoteId}"]`);
      for (const [kind, count] of [
        ["主観", 1],
        ["客観", 3],
      ] as const) {
        for (let remaining: number = count; remaining > 0; remaining--) {
          const palette = page.getByRole("button", {
            name: `${kind}シール 残り${remaining}票`,
            exact: true,
          });
          // 選択した種類は連続で貼れる。同じ選択中ボタンを押すと解除する。
          if ((await palette.getAttribute("aria-pressed")) !== "true")
            await palette.click();
          const surface = target.getByRole("button", {
            name: `付箋（${kind}シールを貼る）`,
            exact: true,
          });
          await surface.waitFor();
          const box = await surface.boundingBox();
          assert.ok(box, "投票する付箋の表示位置が必要です。");
          // 先に貼ったシールと重ならない4箇所を、実カードの寸法から選ぶ。
          const right = kind === "客観" && remaining !== 2;
          const bottom = kind === "客観" && remaining !== 3;
          await surface.click({
            position: {
              x: box.width * (right ? 0.75 : 0.25),
              y: box.height * (bottom ? 0.75 : 0.25),
            },
          });
          await poll(
            () =>
              page
                .getByRole("button", {
                  name: `${kind}シール 残り${remaining - 1}票`,
                  exact: true,
                })
                .count()
                .then((count) => count === 1),
            `${kind}投票の受理と残票${remaining - 1}`,
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
    await poll(
      () =>
        member
          .getByRole("region", { name: "投票パレット" })
          .getByText("使い切りました", { exact: true })
          .count()
          .then((count) => count === 2),
      "参加者の主観・客観投票をサーバーが受理する",
    );
    await capture(member, "participant-voted");
    await advancePhase(owner, [ownerTrace, memberTrace], 5);
    completed("two voters submitted votes; result phase synchronized");
    await member.goto(`${input.origin}/preview`);
    const reentryConnection = memberTrace.connections.length;
    await member.goto(inviteUrl);
    await member.getByRole("button", { name: "参加する", exact: true }).click();
    await waitForRoom(member, roomUrl);
    await member.getByTestId("board-canvas").waitFor();
    await poll(
      () =>
        snapshots({
          ...memberTrace,
          received: memberTrace.connections.slice(reentryConnection).flat(),
        }).some(
          (frame) =>
            frame.phase?.step === 5 &&
            frame.notes?.some(
              (note) =>
                note.id === memberNoteId && note.content === memberPrivateText,
            ),
        ),
      "再参加後も共有済み本文と進行を保持する",
    );
    await poll(
      () =>
        snapshots({
          ...memberTrace,
          received: memberTrace.connections.slice(reentryConnection).flat(),
        }).some((frame) =>
          frame.notes?.some(
            (note) =>
              note.id === ownerNoteId &&
              note.dotVotes?.subjective.count === 2 &&
              note.dotVotes?.objective.count === 6,
          ),
        ),
      "再参加後のsnapshotに2人の主観2票・客観6票が保存されている",
    );
    const reenteredNote = member
      .getByTestId("board-canvas")
      .locator(`[data-note-id="${memberNoteId}"]`);
    await poll(async () => {
      if ((await reenteredNote.count()) !== 1) return false;
      return (
        (await reenteredNote.locator("textarea").inputValue()) ===
        memberPrivateText
      );
    }, "再参加後の画面に本人の共有本文が残る");
    await Promise.all(
      [owner, member].map((page) =>
        page.getByRole("button", { name: /現在地：.*課題決定/ }).waitFor(),
      ),
    );
    await owner.getByRole("button", { name: /^タイマー 未開始/ }).click();
    await owner.getByRole("button", { name: "開始", exact: true }).click();
    await owner.keyboard.press("Escape");
    await member.getByTestId("timer-work-hint").waitFor({ state: "hidden" });
    await capture(owner, "result-owner-synchronized");
    await capture(member, "result-participant-synchronized");
    console.log(
      JSON.stringify({
        test: "compiled-preview-browser-collaboration",
        state: "succeeded",
        browserContexts: 2,
        authentication: "local RS256 test IdP; not two real Google accounts",
        screenshots,
        checks: [
          "App issued separate HttpOnly sessions",
          "invite/join",
          "empty participant drafts",
          "private contents not delivered",
          "UI add/edit/share",
          "two voters",
          "phase sync",
          "reentry retains notes and both voters' results",
        ],
      }),
    );
  } finally {
    await browser.close();
  }
}
