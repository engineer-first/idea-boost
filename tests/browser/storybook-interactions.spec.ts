import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

// DOMの描画だけではplayの失敗を検出できない。Chromaticと同じ操作を最後まで実行する。
test.each([
  "notes-notecard--excluded-for-host",
  "notes-notecard--excluded-for-participant",
  "notes-notecard--result-with-candidate-action",
  "notes-notecard--result-excluded-for-host",
  "roommembers-memberselection--selectable",
  "roommembers-memberselection--disabled",
  "roommembers-memberselection--display-only",
  "room-boardcontext--hmw-expanded",
  "room-leaveconfirmdialog--discard",
  "room-leaveconfirmdialog--completed-discard",
  "room-roomboardcanvas--excluded-candidate",
  "room-roomtimer--ended-host-reconfigure",
  "room-roomboardlayout--reference-and-notes",
  "room-roomboardlayout--laptop-width",
  "room-roomboardlayout--narrow-width",
  "room-roomboardlayout--decisions-and-notes",
  "room-roomboardlayout--context-collapsed",
  "room-roomboardlayout--single-participant",
])("%s: 描画とplayが例外なく完了する", async (id) => {
  const width = id.endsWith("--laptop-width")
    ? 1024
    : id.endsWith("--narrow-width")
      ? 768
      : 1280;
  const page = await browser.newPage({
    viewport: { width, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      type StoryProbe = Window & {
        storyFinished?: boolean;
        storyErrors: string[];
      };
      const probe = window as unknown as StoryProbe;
      probe.storyErrors = [];
      Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
        configurable: true,
        set(channel: {
          on: (event: string, listener: (data: unknown) => void) => void;
        }) {
          Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
            configurable: true,
            value: channel,
          });
          for (const event of [
            "storyErrored",
            "storyThrewException",
            "playFunctionThrewException",
            "unhandledErrorsWhilePlaying",
          ]) {
            channel.on(event, (data) =>
              probe.storyErrors.push(JSON.stringify(data).slice(0, 600)),
            );
          }
          channel.on("storyFinished", () => {
            probe.storyFinished = true;
          });
        },
      });
    });
    await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
    await page.waitForFunction(
      () => {
        const probe = window as unknown as {
          storyFinished?: boolean;
          storyErrors?: string[];
        };
        return probe.storyFinished || probe.storyErrors?.length;
      },
      undefined,
      { timeout: 10_000 },
    );
    const storyErrors = await page.evaluate(
      () => (window as unknown as { storyErrors: string[] }).storyErrors,
    );
    expect([...errors, ...storyErrors]).toEqual([]);
    expect(
      await page.locator("#storybook-root > *, [role=alertdialog]").count(),
    ).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
});
