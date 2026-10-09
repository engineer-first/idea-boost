import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});

test("フェーズ1-1のデモは付箋追加と入力の2ステップだけを案内する", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--phase-one-writing-demo&viewMode=story`,
  );

  const body = page.locator("body");
  await expect(
    body.getByText("このボタンで付箋を追加します。", { exact: true }),
  ).toBeVisible();
  expect(await body.getByRole("button", { name: "付箋を追加" }).count()).toBe(
    1,
  );
  await body.getByRole("button", { name: "次へ" }).click();

  await expect
    .poll(
      () =>
        body
          .getByText("最近困ったことを書き出しましょう。", { exact: true })
          .count(),
      {
        timeout: 8_000,
      },
    )
    .toBe(1);
  expect(await body.locator('[data-tour="phase-one-demo-note"]').count()).toBe(
    1,
  );
  expect(
    await body.getByRole("textbox", { name: "デモの付箋" }).inputValue(),
  ).toBe("会議で発言するタイミングがわからない");

  await body.getByRole("button", { name: "終了" }).click();
  expect(await body.getByTestId("phase-one-writing-tour").count()).toBe(0);

  expect(
    await body.getByText("保存ボタンは不要です。", { exact: true }).count(),
  ).toBe(0);
});

test("フェーズ1-4のデモは投票と取消を4ステップで案内する", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--phase-one-voting-demo&viewMode=story`,
  );

  const body = page.locator("body");
  await expect(
    body.getByText(
      "主観は1票。激しく共感する、取り組みたい付箋に貼りましょう。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "客観は3票。自分以外の人にも価値がありそうな付箋に貼りましょう。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "シールを付箋にドラッグして投票します。投票中は、自分のシールだけが見えます。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    body.locator('[data-testid="phase-one-voting-demo-note"]'),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "貼った自分のシールは、押すと取り消せます。パレットへ戻しても取り消せます。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "終了" }).click();
  expect(await body.getByTestId("phase-one-writing-tour").count()).toBe(0);
});

test("フェーズ1-5のホストデモは課題の確定と進行を案内する", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--phase-one-decision-demo&viewMode=story`,
  );

  const body = page.locator("body");
  await expect(
    body.getByText(
      "みんなの投票結果を参考に、取り組む課題を1つ話し合いましょう。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "課題が決まったら、このボタンで採用する付箋の選択を始めます。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText("取り組む課題の付箋をクリックすると、確定します。", {
      exact: true,
    }),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "確定した課題は全員に表示されます。次へ進む前なら、取り消して選び直せます。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "課題を確定したら、ここから問いを考えるフェーズへ進みます。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "終了" }).click();
  expect(await body.getByTestId("phase-one-writing-tour").count()).toBe(0);
});

test("フェーズ1-5の参加者デモはホストの確定を案内する", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--phase-one-decision-participant-demo&viewMode=story`,
  );

  const body = page.locator("body");
  await expect(
    body.getByText(
      "投票結果を参考に、取り組む課題をみんなで話し合いましょう。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText("話し合って決めた課題は、ホストが確定します。", {
      exact: true,
    }),
  ).toBeVisible();
  await body.getByRole("button", { name: "次へ" }).click();
  await expect(
    body.getByText(
      "確定した課題はここに表示されます。次は、この課題から問いを考えます。",
      { exact: true },
    ),
  ).toBeVisible();
  await body.getByRole("button", { name: "終了" }).click();
  expect(await body.getByTestId("phase-one-writing-tour").count()).toBe(0);
});
