import { beforeEach, describe, expect, it, vi } from "vitest";

const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("msw/browser", () => ({ setupWorker: () => ({ start }) }));
vi.mock("./handlers", () => ({ handlers: [] }));

beforeEach(() => {
  vi.resetModules();
  start.mockReset();
});

describe("ブラウザのモック起動", () => {
  it("並行する初期化と後続のstory遷移でworkerを一度だけ起動し、最初の未処理通信方針を保つ", async () => {
    let resolveStart!: () => void;
    start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const { startMockWorker } = await import("./browser");
    const first = startMockWorker({ quiet: true, onUnhandledFrame: "warn" });
    const second = startMockWorker({ quiet: true, onUnhandledFrame: "bypass" });
    expect(start).toHaveBeenCalledExactlyOnceWith({
      quiet: true,
      onUnhandledFrame: "warn",
    });
    resolveStart();
    await Promise.all([first, second]);
    await startMockWorker({ quiet: true, onUnhandledFrame: "bypass" });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("起動失敗を呼び出し元へ返し、次の初期化では再試行できる", async () => {
    const error = new Error("service worker registration failed");
    start.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const { startMockWorker } = await import("./browser");
    await expect(startMockWorker({ onUnhandledFrame: "bypass" })).rejects.toBe(
      error,
    );
    await expect(
      startMockWorker({ onUnhandledFrame: "warn" }),
    ).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith({ onUnhandledFrame: "warn" });
  });
});
