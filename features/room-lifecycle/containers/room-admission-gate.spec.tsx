import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.hoisted(() => vi.fn());
const refreshGuest = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", async () => {
  const { createContext } = await import("react");
  return {
    consumeRoomEntry: consume,
    refreshGuestRoomEntry: refreshGuest,
    startRoomReauthentication: vi.fn(),
    RoomAdmissionContext: createContext<string | undefined>(undefined),
  };
});

import { rememberPendingRoomEntry } from "@/lib/room-client/entry-tab-storage";
import { GUEST_IDENTITY_UNAVAILABLE_MESSAGE } from "../logic/guest-identity-message";
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
    fireEvent.click(screen.getByRole("button", { name: "ホームへ戻る" }));
  });
});

it("認証待ちはルームの背景を残し、接続する子はマウントしない", () => {
  const connected = vi.fn();
  function ConnectedRoom() {
    connected();
    return <p>接続済みの盤面</p>;
  }
  render(
    <RoomAdmissionGate roomId={roomId} fallback={<p>ルームの枠</p>}>
      <ConnectedRoom />
    </RoomAdmissionGate>,
  );
  expect(screen.getByText("ルームの枠")).toBeInTheDocument();
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(connected).not.toHaveBeenCalled();
});

describe("ゲストの入室前確認", () => {
  beforeEach(() => {
    sessionStorage.clear();
    refreshGuest.mockReset();
  });
  it("StrictModeでも更新は一度だけで待機中はGoogle再認証を出さず、成功後に再読み込みする", async () => {
    let finish!: (value: { ok: true }) => void;
    refreshGuest.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onRefreshed = vi.fn();
    render(
      <StrictMode>
        <RoomAdmissionGate
          roomId={roomId}
          sessionKind="guest"
          onRefreshed={onRefreshed}
        >
          <p>ルーム本文</p>
        </RoomAdmissionGate>
      </StrictMode>,
    );
    await waitFor(() => expect(refreshGuest).toHaveBeenCalledOnce());
    expect(refreshGuest).toHaveBeenCalledWith(roomId);
    expect(screen.getByRole("status")).toHaveTextContent(
      "ルームを確認しています…",
    );
    expect(
      screen.queryByRole("button", { name: "Googleでログインして続ける" }),
    ).not.toBeInTheDocument();
    finish({ ok: true });
    await waitFor(() => expect(onRefreshed).toHaveBeenCalledOnce());
    expect(refreshGuest).toHaveBeenCalledOnce();
    expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
  });
  it("通信失敗では手動で再試行し成功後に再読み込みする", async () => {
    refreshGuest
      .mockResolvedValueOnce({ ok: false, reason: "retry" })
      .mockResolvedValueOnce({ ok: true });
    const onRefreshed = vi.fn();
    render(
      <RoomAdmissionGate
        roomId={roomId}
        sessionKind="guest"
        onRefreshed={onRefreshed}
      >
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "もう一度試す" }),
    );
    await waitFor(() => expect(onRefreshed).toHaveBeenCalledOnce());
    expect(refreshGuest).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Googleでログインして続ける" }),
    ).not.toBeInTheDocument();
  });
  it("本人確認不可では別人として始める説明とホームへのリンクを表示する", async () => {
    refreshGuest.mockResolvedValue({
      ok: false,
      reason: "identity_unavailable",
    });
    render(
      <RoomAdmissionGate roomId={roomId} sessionKind="guest">
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "このブラウザでは、以前の参加者として確認できません",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新しく始める" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText(GUEST_IDENTITY_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Googleでログインして続ける" }),
    ).not.toBeInTheDocument();
  });
  it("更新結果が再認証要求ならGoogle再認証を表示する", async () => {
    refreshGuest.mockResolvedValue({ ok: false, reason: "reauth_required" });
    render(
      <RoomAdmissionGate roomId={roomId} sessionKind="guest">
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    await waitFor(() => expect(refreshGuest).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("button", { name: "Googleでログインして続ける" }),
    ).toBeInTheDocument();
  });
  it("accountの残り時間不足ではゲスト更新を呼ばずGoogle再認証を表示する", async () => {
    render(
      <RoomAdmissionGate roomId={roomId} sessionKind="account">
        <p>ルーム本文</p>
      </RoomAdmissionGate>,
    );
    expect(
      await screen.findByRole("button", { name: "Googleでログインして続ける" }),
    ).toBeInTheDocument();
    expect(refreshGuest).not.toHaveBeenCalled();
  });
});

it("注入したゲスト更新ActionにroomIdを渡し、待機・再試行中も背景を残す", async () => {
  refreshGuest.mockResolvedValue({ ok: false, reason: "retry" });
  const refreshAction = vi
    .fn()
    .mockResolvedValue({ ok: false, reason: "retry" });
  render(
    <RoomAdmissionGate
      roomId={roomId}
      sessionKind="guest"
      refreshAction={refreshAction}
      fallback={<p>ルームの枠</p>}
    >
      <p>ルーム本文</p>
    </RoomAdmissionGate>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "ルームを確認しています…",
  );
  expect(screen.getByText("ルームの枠")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "もう一度試す" }));
  await waitFor(() => expect(refreshAction).toHaveBeenCalledTimes(2));
  expect(refreshAction).toHaveBeenCalledWith(roomId);
  expect(screen.getByText("ルームの枠")).toBeInTheDocument();
  expect(screen.queryByText("ルーム本文")).not.toBeInTheDocument();
});
