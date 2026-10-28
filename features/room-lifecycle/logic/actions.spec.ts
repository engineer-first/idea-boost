// @vitest-environment node
// createRoom / joinRoom の Server Actions 境界のテスト。
// api-worker の応答が「非 2xx」「2xx だが不正 JSON」のどちらでも、未処理例外に
// せず ok: false で返すこと。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prepareSessionMock,
  apiFetchMock,
  getCurrentUserMock,
  redirectMock,
} = vi.hoisted(() => ({
  prepareSessionMock: vi.fn(),
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
vi.mock("@/lib/session/room-entry", async (original) => ({
  ...(await original<typeof import("@/lib/session/room-entry")>()),
  issueRoomEntry: vi.fn().mockResolvedValue("entry-admission"),
}));

vi.mock("@/lib/session/room-entry-session", () => ({
  prepareRoomEntrySession: prepareSessionMock,
}));

import {
  ROOM_ENTRY_AUDIENCE,
  RoomAdmissionSchema,
} from "@/contracts/room-entry";
import type { VerifiedSession } from "@/contracts/session";
import { SESSION_TTL_SECONDS } from "@/lib/session/cookie";
import { hasRoomEntryTime, issueRoomEntry } from "@/lib/session/room-entry";
import { verifyToken } from "@/lib/session/token";

import {
  createRoom,
  joinRoom,
  returnToRoom,
} from "./actions";


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
  prepareSessionMock.mockImplementation(async (user: VerifiedSession) =>
    hasRoomEntryTime(user)
      ? { ok: true, user }
      : { ok: false, reason: "reauth_required" },
  );
  vi.mocked(issueRoomEntry).mockResolvedValue("entry-admission");
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectSignal(url);
  });
  getCurrentUserMock.mockResolvedValue({
    sub: "123e4567-e89b-12d3-a456-426614174000",
    email: "dev@example.com",
    exp: Math.floor(Date.now() / 1000) + 604800,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createRoom", () => {
  it("未認証なら作成を拒否して同じ要求の再試行を案内する", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect(
      await createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).toMatchObject({ ok: false, outcome: "rejected" });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("作成に成功したら roomId を返す（遷移と toast はクライアント側）", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({
        roomId: "123e4567-e89b-42d3-a456-426614174000",
        inviteCode: "ABC123",
      }),
    );

    await expect(
      createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).resolves.toEqual({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
      entryToken: "entry-admission",
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
    await createRoom({
      requestId: "11111111-1111-4111-8111-111111111111",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      name: "  相談ルーム  ",
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/rooms",
      expect.objectContaining({
        body: JSON.stringify({
          requestId: "11111111-1111-4111-8111-111111111111",
          expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
          name: "相談ルーム",
        }),
      }),
    );
    apiFetchMock.mockClear();
    expect(
      await createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
        name: "あ".repeat(16),
      }),
    ).toMatchObject({ ok: false });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("API が非 2xx なら ok: false を返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("error", { status: 500 }));

    await expect(
      createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "unknown",
      error: "作成結果を確認できません。同じ作成を確認・再試行してください。",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("API が 2xx でも不正 JSON なら ok: false を返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("<html>gateway error</html>"));

    await expect(
      createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "unknown",
      error: "作成結果を確認できません。同じ作成を確認・再試行してください。",
    });
    expect(redirectMock).not.toHaveBeenCalled();
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

    await expect(
      joinRoom(joinFormData("ABC123"), "123e4567-e89b-12d3-a456-426614174000"),
    ).resolves.toEqual({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
      entryToken: "entry-admission",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("API が 404 なら見つからないエラーを返す", async () => {
    apiFetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error:
        "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
    });
  });

  it("API が 409 ならルームの参加上限エラーを返す", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({ error: "このルームは20人までです。" }, { status: 409 }),
    );

    await expect(joinRoom(joinFormData("ABC123"))).resolves.toEqual({
      ok: false,
      error:
        "ルームが満員（上限20人）のため参加できません。ホストに確認してください。",
    });
  });

  it("参加確認後に終了したルームを満員と誤案内しない", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json(
        { error: "終了したルームには参加できません。" },
        { status: 409 },
      ),
    );
    await expect(joinRoom(joinFormData("ABC123"))).resolves.toMatchObject({
      ok: false,
      error:
        "このルームは終了しているため参加できません。新しい招待コードをホストに確認してください。",
    });
  });

  it("原因不明の409を満員と断定しない", async () => {
    apiFetchMock.mockResolvedValue(
      new Response("gateway error", { status: 409 }),
    );
    await expect(joinRoom(joinFormData("ABC123"))).resolves.toMatchObject({
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
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

describe("元のルームの確認", () => {
  const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  it("未認証と不正IDではAPIへ送らない", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect(await callAndGetRedirect(() => returnToRoom(roomId))).toBe("/login");
    expect(apiFetchMock).not.toHaveBeenCalled();
    getCurrentUserMock.mockResolvedValue({
      sub: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(await returnToRoom("../invalid")).toEqual({
      kind: "unavailable_room",
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [{ kind: "lobby" }, `/rooms/${roomId}/start`],
    [{ kind: "step", phase: 1, step: 3 }, `/rooms/${roomId}`],
  ])("現在の工程から作業画面を選ぶ %j", async (phase, href) => {
    apiFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          roomId,
          inviteCode: "ABC123",
          isHost: true,
          hostUserId: "123e4567-e89b-12d3-a456-426614174000",
          phase,
        }),
      );
    expect(
      await returnToRoom(roomId, "123e4567-e89b-12d3-a456-426614174000"),
    ).toMatchObject({ kind: "ready", href });
  });
  it("閲覧認可済み成果を優先する", async () => {
    const { completedRoomFixture } = await import(
      "@/contracts/completed-rooms.fixture"
    );
    apiFetchMock.mockResolvedValueOnce(
      Response.json(completedRoomFixture({ roomId })),
    );
    expect(await returnToRoom(roomId)).toEqual({
      kind: "ready",
      href: `/completed-rooms/${roomId}`,
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
  it("不存在・非メンバーと一時障害を分ける", async () => {
    apiFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await returnToRoom(roomId)).toEqual({ kind: "unavailable_room" });
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await returnToRoom(roomId)).toEqual({ kind: "retry" });
    apiFetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await returnToRoom(roomId)).toEqual({ kind: "retry" });
    apiFetchMock.mockResolvedValueOnce(Response.json({ roomId }));
    expect(await returnToRoom(roomId)).toEqual({ kind: "retry" });
  });
});

describe("入室前の認証準備", () => {
  it("再開確認後に本人が変わった参加をWorkerへ送らない", async () => {
    expect(
      await joinRoom(
        joinFormData("ABC234"),
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toMatchObject({ ok: false, reason: "actor_mismatch" });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
  it("再開確認後に本人が変わった復帰をWorkerへ送らない", async () => {
    expect(
      await returnToRoom(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toEqual({ kind: "unavailable_room" });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
  it("残り5時間未満の作成をWorkerへ送らない", async () => {
    getCurrentUserMock.mockResolvedValue({
      sub: "123e4567-e89b-12d3-a456-426614174000",
      email: "dev@example.com",
      exp: Math.floor(Date.now() / 1000) + 17999,
    });
    expect(
      await createRoom({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).toMatchObject({ ok: false, reason: "reauth_required" });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
  it("残り5時間未満の参加をWorkerへ送らない", async () => {
    getCurrentUserMock.mockResolvedValue({
      sub: "123e4567-e89b-12d3-a456-426614174000",
      email: "dev@example.com",
      exp: Math.floor(Date.now() / 1000) + 17999,
    });
    expect(await joinRoom(joinFormData("ABC234"))).toMatchObject({
      ok: false,
      reason: "reauth_required",
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

it("参加APIの確認要求を満員エラーへ変換せずUIへ渡す", async () => {
  const { switchConfirmation } = await import("./participation.fixture");
  apiFetchMock.mockResolvedValueOnce(
    Response.json(
      { reason: "confirmation_required", confirmation: switchConfirmation() },
      { status: 409 },
    ),
  );
  expect(await joinRoom(joinFormData("AB12CD"))).toMatchObject({
    ok: false,
    reason: "confirmation_required",
    confirmation: switchConfirmation(),
  });
});
it("作成APIの確認要求を既存の作成IDを保持してUIへ渡す", async () => {
  const { switchConfirmation } = await import("./participation.fixture");
  apiFetchMock.mockResolvedValueOnce(
    Response.json(
      { reason: "confirmation_required", confirmation: switchConfirmation() },
      { status: 409 },
    ),
  );
  expect(
    await createRoom({
      requestId: "55555555-5555-4555-8555-555555555555",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
      name: "相談",
    }),
  ).toMatchObject({
    ok: false,
    reason: "confirmation_required",
    confirmation: switchConfirmation(),
  });
});

it("再試行で発見した処理中の移動を満員エラーにせず保持する", async () => {
  const pending = {
    kind: "pending" as const,
    operationId: "22222222-2222-4222-8222-222222222222",
    progress: "joining" as const,
    error: "移動の処理中です",
  };
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 409 }));
  expect(await joinRoom(joinFormData("AB12CD"))).toMatchObject({
    ok: false,
    pendingOperation: pending,
  });
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 409 }));
  expect(
    await createRoom({
      requestId: "55555555-5555-4555-8555-555555555555",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
    }),
  ).toMatchObject({ ok: false, outcome: "unknown", pendingOperation: pending });
});

it("実APIの503 pendingを参加・作成・再訪の回復経路へ渡す", async () => {
  const pending = {
    kind: "pending" as const,
    operationId: "22222222-2222-4222-8222-222222222222",
    progress: "joining" as const,
    error: "処理を再開してください",
    targetName: "前のルーム",
  };
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 503 }));
  expect(await joinRoom(joinFormData("AB12CD"))).toMatchObject({
    ok: false,
    pendingOperation: pending,
  });
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 503 }));
  expect(
    await createRoom({
      requestId: "55555555-5555-4555-8555-555555555555",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
    }),
  ).toMatchObject({ ok: false, pendingOperation: pending });
  apiFetchMock.mockResolvedValueOnce(Response.json({}, { status: 404 }));
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 503 }));
  expect(await returnToRoom("33333333-3333-4333-8333-333333333333")).toEqual({
    kind: "ready",
    href: "/rooms/33333333-3333-4333-8333-333333333333",
  });
});

it("実APIの確定失敗は終了情報と残る参加状態を参加・作成へ渡す", async () => {
  const { failedParticipation } = await import("./participation.fixture");
  apiFetchMock.mockResolvedValueOnce(
    Response.json(failedParticipation(), { status: 409 }),
  );
  expect(await joinRoom(joinFormData("AB12CD"))).toMatchObject({
    ok: false,
    failedOperation: failedParticipation(),
  });
  apiFetchMock.mockResolvedValueOnce(
    Response.json(failedParticipation(), { status: 409 }),
  );
  expect(
    await createRoom({
      requestId: "55555555-5555-4555-8555-555555555555",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
    }),
  ).toMatchObject({
    ok: false,
    failedOperation: failedParticipation(),
    outcome: "rejected",
  });
});
it("404のbodyがpendingでも非在籍を回復可能な参加として扱わない", async () => {
  const pending = {
    kind: "pending",
    operationId: "22222222-2222-4222-8222-222222222222",
    progress: "joining",
    error: "処理中",
  };
  apiFetchMock.mockResolvedValueOnce(Response.json({}, { status: 404 }));
  apiFetchMock.mockResolvedValueOnce(Response.json(pending, { status: 404 }));
  expect(await returnToRoom("33333333-3333-4333-8333-333333333333")).toEqual({
    kind: "unavailable_room",
  });
});

it("確認versionのない公開bodyを有効な退出確認へ補填しない", async () => {
  const { switchConfirmation } = await import("./participation.fixture");
  const { readParticipationRecovery } = await import(
    "./participation-recovery"
  );
  const confirmation = { ...switchConfirmation(), version: undefined };
  expect(
    await readParticipationRecovery(
      Response.json(
        { reason: "confirmation_required", confirmation },
        { status: 409 },
      ),
    ),
  ).toBeNull();
});

it("作成失効の410終端も退出済み・残る在籍を回復画面へ渡す", async () => {
  const { failedParticipation } = await import("./participation.fixture");
  const failure = { ...failedParticipation(), reason: "expired" };
  apiFetchMock.mockResolvedValueOnce(Response.json(failure, { status: 410 }));
  expect(
    await createRoom({
      requestId: "55555555-5555-4555-8555-555555555555",
      expectedPrincipal: "123e4567-e89b-12d3-a456-426614174000",
    }),
  ).toMatchObject({ ok: false, outcome: "rejected", failedOperation: failure });
});

it("通常の受付失効と認証拒否・不存在を参加操作の回復へ変換しない", async () => {
  const { readParticipationRecovery } = await import(
    "./participation-recovery"
  );
  const { failedParticipation } = await import("./participation.fixture");
  expect(
    await readParticipationRecovery(
      Response.json(
        {
          reason: "expired",
          error: "作成受付の期限が過ぎました。",
        },
        { status: 410 },
      ),
    ),
  ).toBeNull();
  for (const status of [401, 403, 404]) {
    expect(
      await readParticipationRecovery(
        Response.json(failedParticipation(), { status }),
      ),
    ).toBeNull();
  }
});

describe("ゲスト更新後の作成・参加・再入室", () => {
  const now = 1_800_000_000;
  const secret = "action-refresh-test-secret-at-least-32-bytes";
  const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const guest: VerifiedSession = {
    kind: "guest",
    sub: "123e4567-e89b-12d3-a456-426614174000",
    email: null,
    exp: now + 17999,
  };
  const updated = { ...guest, exp: now + SESSION_TTL_SECONDS };
  const cases = [
    {
      name: "createRoom",
      run: () =>
        createRoom({
          requestId: "11111111-1111-4111-8111-111111111111",
          expectedPrincipal: guest.sub,
        }),
    },
    {
      name: "joinRoom",
      run: () => joinRoom(joinFormData("ABC234"), guest.sub),
    },
    { name: "returnToRoom", run: () => returnToRoom(roomId, guest.sub) },
  ];
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    vi.stubEnv("SESSION_SECRET", secret);
    vi.stubEnv("PREVIEW_ENABLED", "false");
    getCurrentUserMock.mockResolvedValue(guest);
    prepareSessionMock.mockResolvedValue({ ok: true, user: updated });
    const actual = await vi.importActual<
      typeof import("@/lib/session/room-entry")
    >("@/lib/session/room-entry");
    vi.mocked(issueRoomEntry).mockImplementation(actual.issueRoomEntry);
    apiFetchMock.mockImplementation(async (path) =>
      path.startsWith("/api/completed-rooms/")
        ? new Response(null, { status: 404 })
        : Response.json({
            roomId,
            inviteCode: "ABC234",
            isHost: true,
            hostUserId: guest.sub,
            phase: { kind: "lobby" },
          }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each(cases)(
    "$name は残り5時間未満のguestを更新して成功し入室証明に更新後のexpを使う",
    async ({ name, run }) => {
      const result = await run();
      expect(result).toMatchObject(
        name === "returnToRoom" ? { kind: "ready" } : { ok: true },
      );
      expect(prepareSessionMock).toHaveBeenCalledWith(guest);
      expect(result).toHaveProperty("entryToken", expect.any(String));
      const token = "entryToken" in result ? result.entryToken : undefined;
      expect(
        await verifyToken(token ?? "", RoomAdmissionSchema, {
          secret,
          audience: ROOM_ENTRY_AUDIENCE.admission,
        }),
      ).toMatchObject({
        principal: guest.sub,
        roomId,
        sessionExp: updated.exp,
      });
    },
  );

  it.each(cases)(
    "$name は更新で本人確認不可ならidentity_unavailableを返し入室証明を発行しない",
    async ({ name, run }) => {
      prepareSessionMock.mockResolvedValue({
        ok: false,
        reason: "identity_unavailable",
      });
      const result = await run();
      expect(result).toMatchObject(
        name === "returnToRoom"
          ? { kind: "identity_unavailable" }
          : { ok: false, reason: "identity_unavailable" },
      );
      expect(result).not.toHaveProperty("entryToken");
      expect(issueRoomEntry).not.toHaveBeenCalled();
      expect(
        apiFetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toEqual([]);
    },
  );

  it.each(cases)(
    "$name はaccountの残り5時間未満ならreauth_requiredを返す",
    async ({ name, run }) => {
      getCurrentUserMock.mockResolvedValue({
        ...guest,
        kind: "account",
        email: "account@example.test",
      });
      prepareSessionMock.mockResolvedValue({
        ok: false,
        reason: "reauth_required",
      });
      expect(await run()).toMatchObject(
        name === "returnToRoom"
          ? { kind: "reauth_required" }
          : { ok: false, reason: "reauth_required" },
      );
      expect(issueRoomEntry).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "$name は更新の通信失敗なら再試行を案内し入室証明を発行しない",
    async ({ name, run }) => {
      prepareSessionMock.mockResolvedValue({ ok: false, reason: "retry" });
      const result = await run();
      if (name === "returnToRoom") expect(result).toEqual({ kind: "retry" });
      else {
        expect(result).toMatchObject({
          ok: false,
          ...(name === "createRoom" ? { outcome: "rejected" } : {}),
        });
        expect(result).not.toMatchObject({ reason: "reauth_required" });
        expect(result).toHaveProperty("error", expect.stringMatching(/再|試/));
      }
      expect(issueRoomEntry).not.toHaveBeenCalled();
      expect(
        apiFetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toEqual([]);
    },
  );
});
