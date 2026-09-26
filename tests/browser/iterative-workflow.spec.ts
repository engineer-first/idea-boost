import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/iterative-workflow";
const viewport = { width: 1280, height: 720 };
const phases = [
  { phase: 1, count: 5, goal: "課題" },
  { phase: 2, count: 4, goal: "HMW" },
  { phase: 3, count: 5, goal: "アイデア" },
] as const;
const progression =
  /^(次のステップへ|次のフェーズへ|もう一度付箋を書く|もう一度投票する|採用する付箋を選ぶ)$/;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport, reducedMotion: "reduce" });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

async function openStory(id: string, isHost = true): Promise<void> {
  const url = new URL("/iframe.html", origin);
  url.searchParams.set("id", id);
  url.searchParams.set("viewMode", "story");
  url.searchParams.set("args", `isHost:${isHost};initialGuideState:compact`);
  await page.goto(url.toString());
  if (id === "room-roomboardlayout--completed") {
    await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  } else {
    await page.getByTestId("board-context-hud").waitFor();
  }
  await page.evaluate(() => document.fonts.ready);
}

async function expectReadable(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("表示対象の寸法を取得できません");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await target.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
}

async function expectReachable(target: Locator): Promise<void> {
  await expectReadable(target);
  expect(
    await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
}

async function closeResults(): Promise<void> {
  const result = page.getByRole("dialog");
  await result.waitFor();
  await page.keyboard.press("Escape");
  await result.waitFor({ state: "hidden" });
}

for (const { phase, count, goal } of phases) {
  for (let step = 1; step <= count; step += 1) {
    for (const isHost of [true, false]) {
      test(`1280×720 ${phase}-${step} ${isHost ? "ホスト" : "参加者"}: 現在地と最大2操作を所定位置で読める`, async () => {
        await openStory(
          `room-roomboardlayout--phase-${phase}-step-${step}`,
          isHost,
        );
        const isResult = step === count;
        if (isResult) await closeResults();
        const context = page.getByTestId("board-context-hud");
        await expectReadable(context);
        expect(await context.innerText()).toContain(`${step}/${count}`);
        expect(await context.innerText()).toContain(
          `ゴール：${goal}を1つ決める`,
        );
        expect(
          await page
            .getByTestId(`board-phase-${phase}`)
            .getAttribute("aria-current"),
        ).toBe("step");
        expect(
          await page.getByTestId("board-phase-progress").locator("li").count(),
        ).toBe(3);
        expect(
          await page
            .getByRole("button", { name: "全手順を見る", exact: true })
            .getAttribute("aria-expanded"),
        ).toBe("false");
        expect(
          await page
            .getByRole("list", { name: "このフェーズの全手順" })
            .count(),
        ).toBe(0);
        expect(await context.innerText()).not.toContain("次の作業");

        const canRestart =
          step === 2 || ((phase === 1 || phase === 3) && step === 3);
        const expected = !isHost ? 0 : isResult || canRestart ? 2 : 1;
        const actions = page.getByRole("button", { name: progression });
        expect(await actions.count()).toBe(expected);
        for (const action of await actions.all()) await expectReachable(action);
        const next = page.getByRole("button", {
          name: /^次の(ステップ|フェーズ)へ$/,
        });
        if (isHost && !isResult) {
          expect(await next.count()).toBe(1);
          const box = await next.boundingBox();
          expect(box?.x).toBeGreaterThan(640);
          expect(box?.y).toBeLessThan(100);
        } else expect(await next.count()).toBe(0);
        const loop = page.getByTestId("phase-loop-hud");
        const loopButtons = loop.getByRole("button");
        expect(await loopButtons.count()).toBe(
          isHost ? (isResult ? 2 : canRestart ? 1 : 0) : 0,
        );
        if (isHost && (isResult || canRestart)) {
          const boxes = await loopButtons.evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().toJSON()),
          );
          const left = Math.min(...boxes.map((box) => box.left));
          const right = Math.max(...boxes.map((box) => box.right));
          expect(Math.abs((left + right) / 2 - 640)).toBeLessThan(12);
          expect(Math.min(...boxes.map((box) => box.top))).toBeGreaterThan(600);
          expect(right - left).toBeLessThan(560);
        }
        if (isResult) {
          const result = page.getByRole("button", { name: "投票結果を表示" });
          await expectReachable(result);
          expect((await result.boundingBox())?.x).toBeGreaterThan(640);
        }
        expect(
          await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          })),
        ).toEqual(viewport);
        await page.screenshot({
          path: `${output}/${phase}-${step}-${isHost ? "host" : "member"}.png`,
        });
      });
    }
  }
}

test.each(phases)("フェーズ$phaseの全手順をキーボードで開閉できる", async ({
  phase,
  count,
}) => {
  await openStory(`room-roomboardlayout--phase-${phase}-step-2`);
  const toggle = page.getByRole("button", {
    name: "全手順を見る",
    exact: true,
  });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const route = page.getByRole("list", { name: "このフェーズの全手順" });
  await route.waitFor();
  expect(await route.locator("li").count()).toBe(count);
  await expectReadable(route);
  expect(await route.getByRole("button").count()).toBe(0);
  expect(await route.locator('[aria-current="step"]').count()).toBe(1);
  await page.keyboard.press("Space");
  expect(await route.count()).toBe(0);
  expect(
    await toggle.evaluate((element) => document.activeElement === element),
  ).toBe(true);
});

test.each(
  phases,
)("フェーズ$phaseの追加執筆確認は全員への影響を示しEscapeで戻れる", async ({
  phase,
}) => {
  await openStory(`room-roomboardlayout--phase-${phase}-step-2`);
  const trigger = page.getByRole("button", {
    name: "もう一度付箋を書く",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", {
    name: "もう少し考えるために、個人作業へ戻りますか？",
  });
  await dialog.waitFor();
  await expectReadable(dialog);
  const text = await dialog.innerText();
  for (const statement of [
    "全員",
    "タイマー",
    "共有済み付箋と下書きは残",
    "本人が共有するまで",
  ])
    expect(text).toContain(statement);
  const confirm = dialog.getByRole("button", {
    name: "個人作業へ戻る",
    exact: true,
  });
  await expectReachable(confirm);
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: `${output}/restart-writing-${phase}.png` });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  expect(
    await trigger.evaluate((element) => document.activeElement === element),
  ).toBe(true);
});

test.each(
  phases,
)("フェーズ$phaseの再投票確認は候補件数と票の削除だけを説明する", async ({
  phase,
  count,
}) => {
  await openStory(`room-roomboardlayout--phase-${phase}-step-${count}`);
  await closeResults();
  const trigger = page.getByRole("button", {
    name: "もう一度投票する",
    exact: true,
  });
  await trigger.press("Enter");
  const dialog = page.getByRole("alertdialog", {
    name: "候補3件に投票し直しますか？",
  });
  await dialog.waitFor();
  await expectReadable(dialog);
  expect(await dialog.innerText()).toContain("付箋は消えません");
  expect(await dialog.innerText()).toContain("候補外");
  expect(await dialog.locator("li, blockquote").count()).toBe(0);
  await expectReachable(
    dialog.getByRole("button", { name: "前回の票を消して始める", exact: true }),
  );
  await page.screenshot({ path: `${output}/revote-${phase}.png` });
  await dialog
    .getByRole("button", { name: "キャンセル", exact: true })
    .press("Enter");
  await dialog.waitFor({ state: "hidden" });
  expect(
    await trigger.evaluate((element) => document.activeElement === element),
  ).toBe(true);
  expect(await page.getByRole("button", { name: progression }).count()).toBe(2);
});

test("採用はキーボードで候補を選ぶと確認ダイアログなしで選択を終える", async () => {
  await openStory("room-roomboardview--ready-to-decide");
  await closeResults();
  await page
    .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
    .press("Enter");
  const cancel = page.getByRole("button", {
    name: "選択をキャンセル",
    exact: true,
  });
  await cancel.waitFor();
  await expectReachable(cancel);
  expect((await cancel.boundingBox())?.y).toBeGreaterThan(600);
  expect(
    await page
      .getByRole("button", { name: "もう一度投票する", exact: true })
      .count(),
  ).toBe(0);
  const candidate = page.getByRole("button", { name: /採用する付箋:/ }).first();
  await candidate.press("Enter");
  expect(await page.getByRole("alertdialog").count()).toBe(0);
  expect(await cancel.count()).toBe(0);
  expect(await page.getByRole("button", { name: progression }).count()).toBe(2);
  await page.screenshot({ path: `${output}/adoption-without-confirm.png` });
});

test.each([
  true,
  false,
])("最終採用済み isHost=%s は全員へ成果を示しループ操作を消す", async (isHost) => {
  await openStory("room-roomboardlayout--completed", isHost);
  await page.getByRole("heading", { name: "採用したアイデア" }).waitFor();
  expect(await page.getByRole("dialog").count()).toBe(0);
  expect(await page.getByRole("button", { name: progression }).count()).toBe(0);
  await page.getByRole("button", { name: "ボードへ戻る" }).click();
  const complete = page
    .getByRole("status")
    .filter({ hasText: "スプリント完了" });
  await expectReadable(complete);
  expect(await page.getByRole("button", { name: progression }).count()).toBe(0);
  await page.screenshot({
    path: `${output}/complete-${isHost ? "host" : "member"}.png`,
  });
});

test.each(
  phases,
)("フェーズ$phaseで最初の投票へ進む確認に戻れない範囲と下書きを示す", async ({
  phase,
  count,
}) => {
  await openStory(`room-roomboardlayout--phase-${phase}-step-${count - 2}`);
  await page
    .getByRole("button", { name: "次のステップへ", exact: true })
    .press("Enter");
  const dialog = page.getByRole("alertdialog", {
    name: "次のステップへ進みますか？",
  });
  await dialog.waitFor();
  expect(await page.getByRole("alertdialog").count()).toBe(1);
  expect(await dialog.innerText()).toContain("個人作業・共有には戻れません");
  expect(await dialog.innerText()).toContain("未共有の下書き");
  await expectReadable(dialog);
  await expectReachable(
    dialog.getByRole("button", { name: "移行する", exact: true }),
  );
  await page.screenshot({ path: `${output}/first-vote-${phase}.png` });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
});

test("課題の採用確定後は右上だけで次フェーズへ進み下書き破棄を確認する", async () => {
  await openStory("room-roomboardview--decided");
  await closeResults();
  expect(
    await page.getByTestId("phase-loop-hud").getByRole("button").count(),
  ).toBe(0);
  const actions = page.getByRole("button", { name: progression });
  expect(await actions.count()).toBe(1);
  const next = page.getByRole("button", {
    name: "次のステップへ",
    exact: true,
  });
  await expectReachable(next);
  expect((await next.boundingBox())?.x).toBeGreaterThan(640);
  expect((await next.boundingBox())?.y).toBeLessThan(100);
  await next.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  expect(await dialog.innerText()).toContain("未共有の下書きを破棄");
  expect(await dialog.innerText()).toContain("前のフェーズへは戻れません");
  await expectReadable(dialog);
});
