// @vitest-environment node
import { expect, it, vi } from "vitest";
import { smokePreviewBundle } from "./preview-smoke.mts";

// 本物のローカルbundle/UIを使い、再参加時だけ配信された本文を欠落させる。
it.skipIf(process.env.PREVIEW_BROWSER_SMOKE !== "true")(
  "再参加の新しいsnapshotで本人の共有本文が失われたら成功扱いにしない",
  async () => {
    const { chromium } = await import("playwright");
    const originalLaunch = chromium.launch.bind(chromium);
    let alteredSnapshots = 0;
    let missingNoteCount = -1;
    let removedNoteId: string | undefined;
    const launch = vi
      .spyOn(chromium, "launch")
      .mockImplementation(async (...args) => {
        const browser = await originalLaunch(...args);
        const originalNewContext = browser.newContext.bind(browser);
        let contextCount = 0;
        vi.spyOn(browser, "newContext").mockImplementation(
          async (...contextArgs) => {
            const contextIndex = ++contextCount;
            const context = await originalNewContext(...contextArgs);
            if (contextIndex !== 2) return context;
            let memberSocketCount = 0;
            await context.routeWebSocket(/\/api\/rooms\//, (client) => {
              const connectionIndex = ++memberSocketCount;
              const server = client.connectToServer();
              server.onMessage((raw) => {
                const frame = JSON.parse(String(raw)) as {
                  type: string;
                  notes?: Array<{ id: string; content: string }>;
                };
                if (
                  connectionIndex >= 3 &&
                  frame.type === "snapshot" &&
                  frame.notes
                ) {
                  removedNoteId = frame.notes.find(
                    (note) =>
                      note.content === "ローカル本人Bだけの追加済み下書き",
                  )?.id;
                  frame.notes = frame.notes.filter(
                    (note) =>
                      note.content !== "ローカル本人Bだけの追加済み下書き",
                  );
                  alteredSnapshots++;
                  client.send(JSON.stringify(frame));
                } else client.send(raw);
              });
            });
            const originalNewPage = context.newPage.bind(context);
            vi.spyOn(context, "newPage").mockImplementation(async () => {
              const page = await originalNewPage();
              const originalWaitForURL = page.waitForURL.bind(page);
              let roomWaitCount = 0;
              vi.spyOn(page, "waitForURL").mockImplementation(
                async (...waitArgs) => {
                  await originalWaitForURL(...waitArgs);
                  if (++roomWaitCount !== 2) return;
                  const deadline = Date.now() + 10_000;
                  while (alteredSnapshots === 0 && Date.now() < deadline)
                    await new Promise((resolve) => setTimeout(resolve, 25));
                  if (alteredSnapshots === 0 || !removedNoteId)
                    throw new Error("再参加時の失敗注入を確認できません。");
                  await page
                    .locator(`[data-note-id="${removedNoteId}"]`)
                    .waitFor({ state: "detached" });
                },
              );
              return page;
            });
            const originalClose = browser.close.bind(browser);
            vi.spyOn(browser, "close").mockImplementation(
              async (...closeArgs) => {
                const [page] = context.pages();
                missingNoteCount =
                  page && removedNoteId
                    ? await page
                        .locator(`[data-note-id="${removedNoteId}"]`)
                        .count()
                    : -1;
                return originalClose(...closeArgs);
              },
            );
            return context;
          },
        );
        return browser;
      });
    try {
      let failure: unknown;
      try {
        await smokePreviewBundle(process.cwd(), { browser: true });
      } catch (error) {
        failure = error;
      }
      expect(alteredSnapshots).toBeGreaterThan(0);
      expect(missingNoteCount).toBe(0);
      expect(
        failure,
        "再参加で本文欠落を検知して失敗する必要があります",
      ).toBeDefined();
      expect(failure).toBeInstanceOf(Error);
      if (failure instanceof Error) expect(failure.message).toContain("再参加");
    } finally {
      launch.mockRestore();
    }
  },
  120_000,
);
