import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", async () => {
  const { createContext } = await import("react");
  return {
    consumeRoomEntry: consume,
    startRoomReauthentication: vi.fn(),
    RoomAdmissionContext: createContext<string | undefined>(undefined),
  };
});

import { rememberPendingRoomEntry } from "@/lib/room-client/entry-tab-storage";
import { RoomAdmissionGate } from "./room-admission-gate";

const roomId = "11111111-1111-4111-8111-111111111111";
const tabId = "22222222-2222-4222-8222-222222222222";
describe("RoomAdmissionGate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    consume.mockReset();
  });
  it("不足した新しい入室ではルームを表示せず本人に操作を選ばせる", () => {
    render(
      <RoomAdmissionGate roomId={roomId}>
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Googleでログインして続ける" }),
    ).toBeEnabled();
    expect(consume).not.toHaveBeenCalled();
  });
  it("別タブのentry tokenで入室を引き継がない", async () => {
    sessionStorage.setItem("idea-boost:room-entry-tab", tabId);
    render(
      <RoomAdmissionGate
        roomId={roomId}
        entryToken="signed-token"
        entryTabId="33333333-3333-4333-8333-333333333333"
      >
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    await screen.findByRole("button", { name: "Googleでログインして続ける" });
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
    expect(consume).not.toHaveBeenCalled();
  });
  it("複製したタブの保存値とURLだけでは元の入室を引き継がない", async () => {
    sessionStorage.setItem("idea-boost:room-entry-tab", tabId);
    render(
      <RoomAdmissionGate
        roomId={roomId}
        entryToken="copied-token"
        entryTabId={tabId}
      >
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    await screen.findByRole("button", { name: "Googleでログインして続ける" });
    expect(consume).not.toHaveBeenCalled();
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
  });
  it("サーバーによる一回消費成功まで共有画面をマウントしない", async () => {
    sessionStorage.setItem("idea-boost:room-entry-tab", tabId);
    rememberPendingRoomEntry("signed-token");
    let resolve: (value: { ok: true; admission: string }) => void = () => {};
    consume.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(
      <RoomAdmissionGate
        roomId={roomId}
        entryToken="signed-token"
        entryTabId={tabId}
      >
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    await waitFor(() =>
      expect(consume).toHaveBeenCalledWith(
        "signed-token",
        roomId,
        tabId,
        "board",
      ),
    );
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
    resolve({ ok: true, admission: "next-admission" });
    expect(await screen.findByText("ルーム本文")).toBeInTheDocument();
    expect(consume).toHaveBeenCalledOnce();
  });
  it("使用済みまたは通信失敗では入室画面を表示しない", async () => {
    sessionStorage.setItem("idea-boost:room-entry-tab", tabId);
    rememberPendingRoomEntry("signed-token");
    consume.mockRejectedValue(new Error("offline"));
    render(
      <RoomAdmissionGate
        roomId={roomId}
        entryToken="signed-token"
        entryTabId={tabId}
      >
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    await screen.findByRole("button", { name: "Googleでログインして続ける" });
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
  });
});
