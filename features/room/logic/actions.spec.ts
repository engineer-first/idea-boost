// @vitest-environment node
// leaveRoom の Server Actions 境界のテスト。
// 認証・入力検証と、api-worker の応答ごとの redirect / 例外の振り分けを検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, getCurrentUserMock, redirectMock } = vi.hoisted(() => ({
  apiFetchMock:
    vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  getCurrentUserMock: vi.fn(),
  redirectMock: vi.fn<(url: string) => never>(),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { leaveRoom } from "./actions";

const VALID_ROOM_ID = "123e4567-e89b-42d3-a456-426614174000";

// 実物の redirect() は例外を投げて以降の処理を打ち切る。同じ制御フローを再現する。
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect: ${url}`);
  }
}

async function callAndGetRedirect(
  action: () => Promise<unknown>,
): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RedirectSignal) {
      return error.url;
    }
    throw error;
  }
  throw new Error("redirect が呼ばれませんでした");
}

function leaveFormData(roomId: string): FormData {
  const formData = new FormData();
  formData.set("roomId", roomId);
  return formData;
}

beforeEach(() => {
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectSignal(url);
  });
  getCurrentUserMock.mockResolvedValue({
    sub: "123e4567-e89b-12d3-a456-426614174000",
    email: "dev@example.com",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("leaveRoom", () => {
  it("未認証なら /login へリダイレクトする", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect(
      await callAndGetRedirect(() => leaveRoom(leaveFormData(VALID_ROOM_ID))),
    ).toBe("/login");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("roomId が UUID 形式でなければ /home へリダイレクトする", async () => {
    expect(
      await callAndGetRedirect(() => leaveRoom(leaveFormData("not-uuid"))),
    ).toBe("/home");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("退出に成功したら /home へリダイレクトする", async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(
      await callAndGetRedirect(() => leaveRoom(leaveFormData(VALID_ROOM_ID))),
    ).toBe("/home");
    expect(apiFetchMock).toHaveBeenCalledWith(
      `/api/rooms/${VALID_ROOM_ID}/leave`,
      { method: "POST" },
    );
  });

  it("404（既に退出済み・非メンバー）は /home へリダイレクトする", async () => {
    apiFetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    expect(
      await callAndGetRedirect(() => leaveRoom(leaveFormData(VALID_ROOM_ID))),
    ).toBe("/home");
  });

  it("5xx は例外を投げて error boundary 行き", async () => {
    apiFetchMock.mockResolvedValue(new Response("oops", { status: 503 }));

    await expect(
      callAndGetRedirect(() => leaveRoom(leaveFormData(VALID_ROOM_ID))),
    ).rejects.toThrow();
  });
});

it("本人退出のintentをAPIへ渡し、古い画面の解散要求と区別する", async () => {
  apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  const form = leaveFormData(VALID_ROOM_ID);
  form.set("intent", "self");
  await callAndGetRedirect(() => leaveRoom(form));
  expect(apiFetchMock).toHaveBeenCalledWith(
    `/api/rooms/${VALID_ROOM_ID}/leave`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "self" }),
    },
  );
});

it("解散の意図とホスト改訂をAPIへ渡す", async () => {
  apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  const form = leaveFormData(VALID_ROOM_ID);
  form.set("intent", "disband");
  form.set("expectedHostRevision", "2");
  expect(await callAndGetRedirect(() => leaveRoom(form))).toBe("/home");
  expect(apiFetchMock).toHaveBeenCalledWith(
    `/api/rooms/${VALID_ROOM_ID}/leave`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "disband", expectedHostRevision: 2 }),
    },
  );
});
