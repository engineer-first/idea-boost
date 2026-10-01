import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/decision-reselection";
const cases = [
  { phase: "1-5", story: "decision-reselection", label: "付箋" },
  { phase: "2-4", story: "hmw-decision-reselection", label: "問い" },
  { phase: "3-5", story: "idea-decision-reselection", label: "アイデア" },
];
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ reducedMotion: "reduce" });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

for (const width of [1280, 375]) {
  for (const { phase, story, label } of cases) {
    test(`${width}px ${phase}: 確定を取り消して別候補を選び直せる`, async () => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story`,
      );
      await page.getByTestId("phase-loop-hud").waitFor();
      if (phase !== "3-5") {
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      await page.evaluate(() => document.fonts.ready);
      const cancel = page.getByRole("button", {
        name: "確定を取り消す",
        exact: true,
      });
      expect(
        await cancel.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight &&
            e.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        }),
      ).toBe(true);
      await page.screenshot({
        path: `${output}/${phase}-${width}-decided.png`,
      });
      await cancel.click();
      await page
        .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
        .waitFor();
      expect(await cancel.count()).toBe(0);
      expect(
        await page
          .getByRole("button", { name: "完了して成果を表示", exact: true })
          .count(),
      ).toBe(0);
      await page.screenshot({
        path: `${output}/${phase}-${width}-cleared.png`,
      });
      await page
        .getByRole("button", { name: "採用する付箋を選ぶ", exact: true })
        .click();
      const candidate = page
        .getByRole("button", { name: new RegExp(`採用する${label}:`) })
        .nth(1);
      const content = (await candidate.getAttribute("aria-label"))?.split(
        ": ",
      )[1];
      if (!content) throw new Error("再採用する候補がありません");
      await candidate.press("Enter");
      await cancel.waitFor();
      const decision = page.getByRole("region", {
        name: `採用する${label}の確定状態`,
      });
      expect(await decision.innerText()).toContain(content);
      expect(await page.locator("[data-adopt-target]").count()).toBe(0);
      await page.screenshot({
        path: `${output}/${phase}-${width}-reselected.png`,
      });
    });
  }
}
