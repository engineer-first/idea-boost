import { expect, it, vi } from "vitest";

const bind = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", () => ({ bindRoomEntryContinuation: bind }));

import { entryDestination } from "./entry-destination";

it("作成参加の成功証跡を同じタブへ結び一回入室ticketで遷移する", async () => {
  bind.mockResolvedValue("bound-ticket");
  expect(
    await entryDestination("/rooms/example/start", "example", "admission"),
  ).toBe("/rooms/example/start?entry=bound-ticket");
  expect(bind).toHaveBeenCalledWith("admission", "example", expect.any(String));
});
it("入室証跡を確認できない場合にURLだけで不足判定を省略しない", async () => {
  bind.mockResolvedValue(null);
  await expect(
    entryDestination("/rooms/example/start", "example", "admission"),
  ).rejects.toThrow();
});
