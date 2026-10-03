import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

// RoomBoard/RoomLobbyとフェイクWSを通すUI境界の検証。
// 認可・DB永続化・実WS配信はWorker/RoomDO統合テストの責務。
const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout";
const targetName = "Hana Sato";
const targetId = "22222222-2222-4222-8222-222222222222";
const confirmName = `${targetName}さんをホストにする`;
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 720 },
] as const;
let browser: Browser;
let page: Page;
beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1000 },
  );
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: viewports[0] });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function openActive(mode = "success"): Promise<void> {
  await openStory(`room-activehosttransferflow--${mode}`);
  await page.getByTestId("room-timer").getByText("02:18").waitFor();
}
function membersTrigger(sharing = false): Locator {
  return page.getByRole("button", {
    name: sharing ? "発表者と全体の順番を確認" : "参加者 2人",
    exact: true,
  });
}
async function selectTarget(sharing = false): Promise<void> {
  await membersTrigger(sharing).click();
  await page.getByRole("button", { name: targetName, exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "このユーザーをホストにしますか？" })
    .waitFor();
}
async function serverEvent(
  kind: "aba" | "recipient-left" | "disconnect" | "reconnect",
): Promise<void> {
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("host-transfer-preview", { detail }),
      ),
    kind,
  );
}
async function expectInsideViewport(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );
}
async function boardContents() {
  return {
    phase: await page.getByTestId("board-context-hud").innerText(),
    timer: await page.getByTestId("room-timer").innerText(),
    timerStatus: await page
      .getByTestId("room-timer")
      .getAttribute("data-status"),
    notes: await page
      .locator('[data-testid^="board-note-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute("data-testid"),
          content: node.textContent,
          left: (node as HTMLElement).style.left,
          top: (node as HTMLElement).style.top,
        })),
      ),
  };
}
async function expectTransferred(): Promise<void> {
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await vi.waitFor(async () => {
    expect(
      await page.getByRole("button", { name: "次のステップへ" }).count(),
    ).toBe(0);
    expect(
      await page.getByTestId("room-timer").evaluate((el) => el.tagName),
    ).toBe("SPAN");
  });
}

test("ロビーでも参加者本人からホスト変更を確認し、取消後に操作し直せる", async () => {
  await openStory("room-hosttransferflow--success");
  const target = page.getByRole("button", { name: targetName, exact: true });
  await target.click();
  await expectInsideViewport(page.getByRole("alertdialog"));
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await vi.waitFor(async () =>
    expect(
      await target.evaluate((node) => node === document.activeElement),
    ).toBe(true),
  );
  await target.press("Enter");
  await page.getByRole("button", { name: confirmName }).click();
  await page.getByText("ホストの開始を待機中", { exact: true }).waitFor();
  expect(await page.getByTestId("start-phase-button").count()).toBe(0);
});

test.each(
  viewports,
)("$name: 参加者選択とキーボード取消が到達可能で、変更後もボード・付箋・タイマーを保つ", async (viewport) => {
  await page.setViewportSize(viewport);
  await openActive();
  const before = await boardContents();
  expect(before.notes).toHaveLength(3);
  expect(before.timer).toBe("02:18");
  await expectInsideViewport(membersTrigger());
  await page.screenshot({
    path: `${output}/508-active-session-before-transfer-${viewport.name}.png`,
  });
  await membersTrigger().press("Enter");
  await page
    .getByRole("button", { name: targetName, exact: true })
    .press("Enter");
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  await expectInsideViewport(dialog);
  expect(await dialog.innerText()).toContain(targetName);
  expect(await dialog.innerText()).toContain("開始・進行・解散");
  expect(await dialog.getByRole("combobox").count()).toBe(0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await vi.waitFor(async () =>
    expect(
      await membersTrigger().evaluate(
        (node) => node === document.activeElement,
      ),
    ).toBe(true),
  );
  await selectTarget();
  await page.screenshot({
    path: `${output}/508-active-confirm-${viewport.name}.png`,
  });
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
  expect(await boardContents()).toEqual(before);
  await page.screenshot({
    path: `${output}/508-active-session-after-transfer-${viewport.name}.png`,
  });
  await membersTrigger().click();
  await page.getByTestId(`member-host-label-${targetId}`).waitFor();
  expect(
    await page.getByRole("button", { name: targetName, exact: true }).count(),
  ).toBe(0);
  expect(
    await page
      .getByRole("button", { name: "Yuki Tanaka", exact: true })
      .count(),
  ).toBe(0);
});

test("実containerのホスト変更操作を動画に残す", async () => {
  await page.close();
  const context = await browser.newContext({
    viewport: viewports[1],
    recordVideo: { dir: output, size: viewports[1] },
  });
  page = await context.newPage();
  try {
    await openActive();
    await selectTarget();
    await page.getByRole("button", { name: confirmName }).click();
    await expectTransferred();
    await membersTrigger().click();
    await page.getByTestId(`member-host-label-${targetId}`).waitFor();
  } finally {
    await context.close();
    await page.video()?.saveAs(`${output}/508-active-host-transfer.webm`);
  }
});

test("拒否理由を同じ確認画面で読み、再試行すると変更できる", async () => {
  await openActive("refused");
  await selectTarget();
  await page.getByRole("button", { name: confirmName }).click();
  await page.getByRole("alert").waitFor();
  expect(await page.getByRole("alert").innerText()).toContain(
    "相手が切断しました",
  );
  await expectInsideViewport(page.getByRole("alertdialog"));
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
});

test("応答待ちの二重操作を止め、タイムアウト後は再試行できる", async () => {
  await openActive("timeout");
  await selectTarget();
  await page.getByRole("button", { name: confirmName }).click();
  expect(await page.getByRole("button", { name: "変更中…" }).isDisabled()).toBe(
    true,
  );
  expect(
    await page
      .getByRole("button", { name: "キャンセル", exact: true })
      .isDisabled(),
  ).toBe(true);
  await page.getByRole("alert").waitFor({ timeout: 8000 });
  expect(await page.getByRole("alert").innerText()).toContain(
    "結果を確認できませんでした",
  );
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
});

test("確認中の切断では変更できず、再接続後に同じ相手へ変更できる", async () => {
  await openActive();
  await selectTarget();
  await serverEvent("disconnect");
  await page
    .getByText("再接続してから操作してください。", { exact: true })
    .waitFor();
  expect(
    await page.getByRole("button", { name: confirmName }).isDisabled(),
  ).toBe(true);
  await serverEvent("reconnect");
  await vi.waitFor(
    async () =>
      expect(
        await page.getByRole("button", { name: confirmName }).isEnabled(),
      ).toBe(true),
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
});

test("成功通知前に切断しても再接続snapshotで新ホストと作業内容を復元する", async () => {
  await openActive("reconnect");
  const before = await boardContents();
  await selectTarget();
  await page.getByRole("button", { name: confirmName }).click();
  await page
    .getByRole("alertdialog")
    .waitFor({ state: "hidden", timeout: 10000 });
  await expectTransferred();
  expect(await boardContents()).toEqual(before);
});

test("対象退出では変更を無効化し、別タブで往復変更された古い確認を閉じる", async () => {
  await openActive();
  await selectTarget();
  await serverEvent("recipient-left");
  await page
    .getByText("このユーザーは退出しました。参加者を選び直してください。", {
      exact: true,
    })
    .waitFor();
  expect(
    await page
      .getByRole("button", { name: "ホストにする", exact: true })
      .isDisabled(),
  ).toBe(true);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await openActive();
  await selectTarget();
  await serverEvent("aba");
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await selectTarget();
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
});

const activeSteps = [
  "1-1",
  "1-2",
  "1-3",
  "1-4",
  "1-5",
  "2-1",
  "2-2",
  "2-3",
  "2-4",
  "3-1",
  "3-2",
  "3-3",
  "3-4",
  "3-5",
];
test.each(
  activeSteps,
)("Step %s: 390pxでも既存参加者UIからホスト変更を確認できる", async (step) => {
  const [phase, number] = step.split("-");
  await openActive(`phase-${phase}-step-${number}`);
  const sharing = number === "2";
  await expectInsideViewport(membersTrigger(sharing));
  // 常設の操作面積は増やさず、既存の参加者UIを入口にする。
  expect(
    await page.getByRole("button", { name: "ホスト交代", exact: true }).count(),
  ).toBe(0);
  await selectTarget(sharing);
  await expectInsideViewport(page.getByRole("alertdialog"));
  expect(
    await page.getByRole("button", { name: confirmName }).isEnabled(),
  ).toBe(true);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await vi.waitFor(async () =>
    expect(
      await membersTrigger(sharing).evaluate(
        (node) => node === document.activeElement,
      ),
    ).toBe(true),
  );
});

test("共有中も順番とタイマーを保ったまま参加者からホストを変更できる", async () => {
  await openActive("phase-1-step-2");
  const before = await boardContents();
  const presenter = await membersTrigger(true).innerText();
  await selectTarget(true);
  await page.getByRole("button", { name: confirmName }).click();
  await expectTransferred();
  expect(await boardContents()).toEqual(before);
  expect(await membersTrigger(true).innerText()).toBe(presenter);
});

test("非ホストと成果公開後にはホスト変更の入口がない", async () => {
  await openActive("participant");
  await membersTrigger().click();
  expect(
    await page
      .getByRole("button", { name: "Yuki Tanaka", exact: true })
      .count(),
  ).toBe(0);
  expect(
    await page.getByRole("button", { name: targetName, exact: true }).count(),
  ).toBe(0);
  await openStory("room-activehosttransferflow--completed");
  await page
    .getByRole("button", { name: "退出してホームへ", exact: true })
    .waitFor();
  expect(
    await page.getByRole("button", { name: /ホスト|参加者 2人/ }).count(),
  ).toBe(0);
  expect(await page.getByRole("alertdialog").count()).toBe(0);
});

test.each(
  viewports,
)("$name: 既存1-3 storyの実装後比較画像を残す", async (viewport) => {
  await page.setViewportSize(viewport);
  // 旧56e6f38のChromaticにもある同fixture・同viewportで比較する。
  await openStory("room-roomboardview--guide-phase-1-step-3");
  await page.getByTestId("board-control-hud").waitFor();
  await page.screenshot({
    path: `${output}/508-after-view-step-1-3-${viewport.name}.png`,
  });
});
