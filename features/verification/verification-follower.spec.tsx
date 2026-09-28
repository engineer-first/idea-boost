import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { VerificationFollower } from "./verification-follower";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("画面要素を追加せず、新しい検証ルームへ同じタブを切り替える", async () => {
  vi.useFakeTimers();
  const roomId = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        active: { roomId, inviteCode: "ABCDEF", checkpoint: "3-1" },
      }),
    ),
  );
  const { container, unmount } = render(
    <VerificationFollower roomId="old-room" />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container).toBeEmptyDOMElement();
  expect(replace).toHaveBeenCalledWith(`/rooms/${roomId}?verify=follow`);
  unmount();
});
it("失敗・未作成ではボードを閉じず、アンマウント後に移動しない", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  const { unmount } = render(<VerificationFollower roomId="current" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(replace).not.toHaveBeenCalled();
  unmount();
  const count = fetch.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetch).toHaveBeenCalledTimes(count);
});
