import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const start = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", () => ({ startRoomReauthentication: start }));

import { RoomReauthentication } from "./room-reauthentication";

describe("RoomReauthentication", () => {
  it("Googleへ自動移動せず本人の操作で元の参加操作を渡す", async () => {
    const operation = { kind: "join" as const, inviteCode: "AB12CD" };
    render(<RoomReauthentication operation={operation} onBack={vi.fn()} />);
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Googleでログインして続ける" }),
    );
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(operation, expect.any(String)),
    );
  });
  it("戻る操作では元操作を実行しない", () => {
    start.mockClear();
    const back = vi.fn();
    render(
      <RoomReauthentication
        operation={{
          kind: "return",
          roomId: "11111111-1111-4111-8111-111111111111",
        }}
        onBack={back}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(back).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
