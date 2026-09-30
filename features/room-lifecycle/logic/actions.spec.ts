// @vitest-environment node
// createRoom / joinRoom の Server Actions 境界のテスト。
// api-worker の応答が「非 2xx」「2xx だが不正 JSON」のどちらでも、未処理例外に
// せず ok: false で返すこと。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiFetchMock,
  getCurrentUserMock,
  redirectMock,
  lookupRoomByInviteCodeMock,
} = vi.hoisted(() => ({
  apiFetchMock:
    vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  getCurrentUserMock: vi.fn(),
  redirectMock: vi.fn<(url: string) => never>(),
  lookupRoomByInviteCodeMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
  lookupRoomByInviteCode: lookupRoomByInviteCodeMock,
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { createRoom, joinRoom, lookupInviteRoom } from "./actions";

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

function joinFormData(code: string): FormData {
  const formData = new FormData();
  formData.set("code", code);
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

describe("createRoom", () => {
  it("未認証なら /login へリダイレクトする", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect(await callAndGetRedirect(() => createRoom())).toBe("/login");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("作成に成功したら roomId を返す（遷移と toast はクライアント側）", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({
        roomId: "123e4567-e89b-42d3-a456-426614174000",
        inviteCode: "ABC123",
      }),
    );

    await expect(createRoom()).resolves.toEqual({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("名前を正規化してAPIへ渡し、長すぎる名前は送信しない", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({
        roomId: "123e4567-e89b-42d3-a456-426614174000",
        inviteCode: "ABC123",
      }),
    );
    await createRoom("  相談ルーム  ");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/rooms",
      expect.objectContaining({ body: JSON.stringify({ name: "相談ルーム" }) }),
    );
    apiFetchMock.mockClear();
    expect(await createRoom("あ".repeat(81))).toMatchObject({ ok: false });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("作成の通信失敗は再試行できるエラーとして返す", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(createRoom("相談ルーム")).resolves.toEqual({
      ok: false,
      error: "ルームを作成できませんでした。",
    });
  });

  it("API が非 2xx なら ok: false を返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("error", { status: 500 }));

    await expect(createRoom()).resolves.toEqual({
      ok: false,
      error: "ルームを作成できませんでした。",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("API が 2xx でも不正 JSON なら ok: false を返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("<html>gateway error</html>"));

    await expect(createRoom()).resolves.toEqual({
      ok: false,
      error: "ルームを作成できませんでした。",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("lookupInviteRoom", () => {
  it("形式不正の招待コードは ok: false を返す", async () => {
    await expect(lookupInviteRoom("bad")).resolves.toEqual({
      ok: false,
      error: "招待コードは英数字6桁で入力してください。",
    });
    expect(lookupRoomByInviteCodeMock).not.toHaveBeenCalled();
  });

  it("ルームが無ければ ok: false を返す", async () => {
    lookupRoomByInviteCodeMock.mockResolvedValueOnce({ kind: "not_found" });
    await expect(lookupInviteRoom("ABC123")).resolves.toEqual({
      ok: false,
      error: "ルームが見つかりませんでした。",
    });
  });

  it("lookup が unavailable なら専用のエラー文言を返す", async () => {
    lookupRoomByInviteCodeMock.mockResolvedValueOnce({ kind: "unavailable" });
    await expect(lookupInviteRoom("ABC123")).resolves.toEqual({
      ok: false,
      error:
        "ルーム情報を取得できませんでした。しばらくしてから再度お試しください。",
    });
  });

  it("見つかれば hostName を返す", async () => {
    lookupRoomByInviteCodeMock.mockResolvedValueOnce({
      kind: "found",
      room: {
        roomId: "123e4567-e89b-42d3-a456-426614174000",
        inviteCode: "ABC123",
        hostName: "田中太郎",
      },
    });
    await expect(lookupInviteRoom("ABC123")).resolves.toEqual({
      ok: true,
      hostName: "田中太郎",
      inviteCode: "ABC123",
    });
  });
});

describe("joinRoom", () => {
  it("形式不正の招待コードは ok: false を返す", async () => {
    await expect(joinRoom(joinFormData("bad"))).resolves.toEqual({
      ok: false,
      error: "招待コードは英数字6桁で入力してください。",
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("参加に成功したら roomId を返す（遷移と toast はクライアント側）", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({ roomId: "123e4567-e89b-42d3-a456-426614174000" }),
    );

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("API が 404 なら見つからないエラーを返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error: "ルームが見つかりませんでした。",
    });
  });

  it("参加確認後に終了したルームを人数上限と誤案内しない", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json(
        { error: "終了したルームには参加できません。" },
        { status: 409 },
      ),
    );
    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error: "終了したルームには参加できません。",
    });
  });

  it("API が 409 ならルームの参加上限エラーを返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("full", { status: 409 }));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error: "このルームは20人までです。",
    });
  });

  it("API が 5xx なら一時障害として見つからないと誤案内しない", async () => {
    apiFetchMock.mockResolvedValue(new Response("error", { status: 503 }));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    });
  });

  it("ネットワーク障害も一時障害として返す", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("network down"));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    });
  });

  it("API が 2xx でも不正 JSON なら一時障害として返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("<html>gateway error</html>"));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
