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
  { phase: 2, count: 4, goal: "問い" },
  { phase: 3, count: 5, goal: "アイデア" },
] as const;
const progression =
  /^(次へ進む|次のフェーズへ|付箋を書き足す|もう一度投票する|採用する付箋を選ぶ)$/;
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
  url.searchParams.set("args", `isHost:${isHost}`);
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

for (const { phase, count } of phases) {
  for (let step = 1; step <= count; step += 1) {
    for (const isHost of [true, false]) {
      test(`1280×720 ${phase}-${step} ${isHost ? "ホスト" : "参加者"}: 現在地と最大2有効操作を所定位置で読める`, async () => {
        await openStory(
          `room-roomboardlayout--phase-${phase}-step-${step}`,
          isHost,
        );
        const isResult = step === count;
        const context = page.getByTestId("board-context-hud");
        await expectReadable(context);
        const location = page.getByRole("button", { name: /現在地/ });
        expect(await location.isVisible()).toBe(true);
        expect(await location.getAttribute("aria-expanded")).toBe("false");
        const progress = page.getByTestId("board-progress-rail");
        expect(await progress.getAttribute("aria-valuenow")).toBe(
          String(step + (phase === 1 ? 0 : phase === 2 ? 5 : 9)),
        );
        expect(await progress.getAttribute("aria-valuemax")).toBe("14");
        expect(await page.getByTestId("board-current-step").count()).toBe(0);
        expect(
          await page.getByRole("button", { name: "ゴールと進行" }).count(),
        ).toBe(0);
        await location.click();
        expect(await page.getByTestId("board-current-step").isVisible()).toBe(
          true,
        );
        expect(
          await page
            .getByTestId(`board-phase-${phase}`)
            .getAttribute("aria-current"),
        ).toBe("step");
        expect(
          await page
            .getByTestId("board-phase-progress")
            .getByRole("tab")
            .count(),
        ).toBe(3);
        expect(
          await page.getByRole("button", { name: "全手順を見る" }).count(),
        ).toBe(0);
        expect(
          await page
            .getByRole("list", { name: "このフェーズの全手順" })
            .locator("li")
            .count(),
        ).toBe(count);
        expect(await context.innerText()).not.toContain("次の作業");
        await location.click();

        const expected = isResult ? 2 : 0;
        const actions = page
          .getByRole("button", { name: progression })
          .and(page.locator("button:enabled"));
        expect(await actions.count()).toBe(expected);
        for (const action of await actions.all()) await expectReachable(action);
        expect(
          await page
            .getByRole("button", { name: "次へ進む", exact: true })
            .count(),
        ).toBe(0);
        const loop = page.getByTestId("phase-loop-hud");
        const loopButtons = loop.getByRole("button");
        expect(await loopButtons.count()).toBe(isResult ? 2 : 0);
        if (isResult) {
          const boxes = await loopButtons.evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().toJSON()),
          );
          const left = Math.min(...boxes.map((box) => box.left));
          const right = Math.max(...boxes.map((box) => box.right));
          const hudCenter = (left + right) / 2;
          const usesIdeaMapViewport = phase === 3 && step <= 3;
          const mapBounds = usesIdeaMapViewport
            ? await page
                .getByTestId("idea-value-feasibility-map-plane")
                .boundingBox()
            : null;
          if (usesIdeaMapViewport) {
            if (!mapBounds) throw new Error("固定マップが見つかりません");
            expect(
              Math.abs(hudCenter - (mapBounds.x + mapBounds.width * 0.31)),
            ).toBeLessThan(12);
          } else {
            expect(Math.abs(hudCenter - 640)).toBeLessThan(12);
          }
          const top = Math.min(...boxes.map((box) => box.top));
          if (mapBounds) {
            expect(top).toBeGreaterThanOrEqual(mapBounds.y);
            expect(
              Math.max(...boxes.map((box) => box.bottom)),
            ).toBeLessThanOrEqual(mapBounds.y + mapBounds.height);
          } else {
            expect(top).toBeGreaterThan(600);
          }
          expect(right - left).toBeLessThan(560);
        }
        expect(
          await page.getByRole("button", { name: "投票結果を表示" }).count(),
        ).toBe(0);
        expect(
          await page
            .getByRole("dialog", { name: "投票結果", exact: true })
            .count(),
        ).toBe(0);
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

test("決定内容をキーボードで開閉し、フォーカスを保つ", async () => {
  await openStory("room-roomboardlayout--phase-3-step-2");
  const toggle = page.getByRole("button", {
    name: "決定した問い",
    exact: true,
  });
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  await expect
    .poll(() => page.getByTestId("board-reference-hmw-content").isVisible())
    .toBe(true);
  await toggle.focus();
  await page.keyboard.press("Space");
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  expect(
    await toggle.evaluate((element) => document.activeElement === element),
  ).toBe(true);
});

test("共有一巡後の書き足し操作はタイマー内で選べる", async () => {
  await openStory("room-roomboardview--floating-timer-sharing-complete");
  const timer = page.getByTestId("timer-floating");
  const trigger = timer.getByRole("button", {
    name: "付箋を書き足す",
    exact: true,
  });
  await expectReachable(trigger);
  expect(await trigger.getAttribute("title")).toContain(
    "共有済み付箋と下書きは残",
  );
  await trigger.press("Enter");
  expect(await page.getByRole("alertdialog").count()).toBe(0);
});

test.each(phases)(
  "フェーズ$phaseの再投票確認は候補件数と票の削除だけを説明する",
  async ({ phase, count }) => {
    await openStory(`room-roomboardlayout--phase-${phase}-step-${count}`);
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
      dialog.getByRole("button", {
        name: "前回の票を消して始める",
        exact: true,
      }),
    );
    await page.screenshot({ path: `${output}/revote-${phase}.png` });
    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .press("Enter");
    await dialog.waitFor({ state: "hidden" });
    expect(
      await trigger.evaluate((element) => document.activeElement === element),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: progression })
        .and(page.locator("button:enabled"))
        .count(),
    ).toBe(2);
  },
);

test("採用はキーボードで候補を選ぶと確認ダイアログなしで選択を終える", async () => {
  await openStory("room-roomboardview--ready-to-decide");
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
  expect(
    await page
      .getByRole("button", { name: progression })
      .and(page.locator("button:enabled"))
      .count(),
  ).toBe(2);
  await page.screenshot({ path: `${output}/adoption-without-confirm.png` });
});

test.each([true, false])(
  "最終採用済み isHost=%s は全員へ成果を示しループ操作を消す",
  async (isHost) => {
    await openStory("room-roomboardlayout--completed", isHost);
    await page.getByRole("heading", { name: "採用したアイデア" }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      await page
        .getByRole("button", { name: progression })
        .and(page.locator("button:enabled"))
        .count(),
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "ボードへ戻る" }).count(),
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "ルームを解散" }).count(),
    ).toBe(0);
    const complete = page.getByRole("button", { name: "テキストを保存" });
    await expectReadable(complete);
    expect(
      await page
        .getByRole("button", { name: progression })
        .and(page.locator("button:enabled"))
        .count(),
    ).toBe(0);
    await page.screenshot({
      path: `${output}/complete-${isHost ? "host" : "member"}.png`,
    });
  },
);

test("時間切れ後の進行は口頭確認を促し、承認ダイアログを追加しない", async () => {
  await openStory("room-roomboardheader--time-up-progress");
  const next = page.getByRole("button", { name: "次へ進む", exact: true });
  await expectReachable(next);
  expect(await next.getAttribute("title")).toContain("みんなに確認");
  await next.press("Enter");
  expect(await page.getByTestId("phase-next-count").innerText()).toBe("1");
  expect(await page.getByRole("alertdialog").count()).toBe(0);
});

test("課題の確定後は取消と、時間切れ後の次フェーズ進行ができる", async () => {
  await openStory("room-roomboardview--decided");
  expect(
    await page.getByTestId("phase-loop-hud").getByRole("button").count(),
  ).toBe(1);
  expect(
    await page.getByRole("button", { name: "次へ進む", exact: true }).count(),
  ).toBe(0);
});

test("390px fit失敗の案内がルーム操作/閉じる操作を遮らず、案内を閉じられる", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory("room-roomboardview--fit-unavailable");
  await page.getByRole("button", { name: "付箋全体を表示" }).click();
  const notice = page.getByText(/ヒント・マイ付箋を閉じてから/);
  await notice.waitFor();
  const control = page.getByTestId("board-control-hud");
  expect(
    await control.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  const dismiss = page.getByRole("button", {
    name: /通知を閉じる|Close toast/,
  });
  expect(await dismiss.count()).toBeGreaterThan(0);
  await dismiss.click();
  await notice.waitFor({ state: "hidden" });
});

test("390px template展開後のprivate本文がdock内で通常pointerとEnterから編集できる", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory("room-roomboardview--hmw-writing-step");
  const toolbar = page.getByTestId("private-notes-toolbar");
  const scroll = page.getByTestId("private-notes-scroll");
  const scrollBox = await scroll.boundingBox();
  if (!scrollBox) throw new Error("マイ付箋のスクロール領域がありません");
  await page.mouse.move(
    scrollBox.x + scrollBox.width / 2,
    scrollBox.y + scrollBox.height / 2,
  );
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => {
    const scroll = document.querySelector<HTMLElement>(
      '[data-testid="private-notes-scroll"]',
    );
    return (
      scroll &&
      (scroll.scrollHeight <= scroll.clientHeight ||
        Math.abs(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop) <
          1)
    );
  });
  const card = toolbar.getByTestId("note-card").last();
  const point = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    return { x, y, reachable: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(point.reachable).toBe(true);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Enter");
  expect(await card.locator("textarea").getAttribute("readonly")).toBeNull();
  await page.screenshot({ path: `${output}/private-dock-mobile.png` });
});
