import { afterEach, expect, it, vi } from "vitest";
import { createRoomClient } from "@/lib/room-client/room-client";
import { createRoomConnectionPreview } from "./room-connection-preview.fixture";

afterEach(() => vi.useRealTimers());

it("ルーム接続プレビューは切断後に新ソケットのsnapshotで復帰する", async () => {
  vi.useFakeTimers();
  const preview = createRoomConnectionPreview("success");
  const onMessage = vi.fn();
  const client = createRoomClient({
    url: "ws://preview.test/room",
    webSocketFactory: preview.factory,
    onMessage,
    random: () => 1,
  });
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "snapshot" }),
    );
    onMessage.mockClear();
    preview.serverEvent("disconnect");
    await vi.advanceTimersByTimeAsync(1000);
    preview.serverEvent("reconnect");
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "snapshot" }),
    );
  } finally {
    client.close();
  }
});
