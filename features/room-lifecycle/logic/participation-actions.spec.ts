// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: vi.fn(),
  prepare: vi.fn(),
  issue: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/session/room-entry", () => ({
  issueRoomEntry: mocks.issue,
}));

vi.mock("@/lib/session/room-entry-session", () => ({
  prepareRoomEntrySession: mocks.prepare,
}));

import {
  ROOM_ENTRY_AUDIENCE,
  RoomAdmissionSchema,
} from "@/contracts/room-entry";
import { SESSION_TTL_SECONDS } from "@/lib/session/cookie";
import { verifyToken } from "@/lib/session/token";

import { switchConfirmation } from "./participation.fixture";
import {
  commitParticipation,
  queryParticipation,
} from "./participation-actions";

const principal = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockReset();
  mocks.issue.mockResolvedValue("admission");
  mocks.prepare.mockImplementation(async (user) => ({ ok: true, user }));
  mocks.user.mockResolvedValue({ sub: principal });
});
it("本人が変わったときはcommitをサーバーへ送らない", async () => {
  mocks.user.mockResolvedValue({ sub: "changed" });
  expect(
    await commitParticipation(
      switchConfirmation().operationId,
      principal,
      "discard",
      0,
    ),
  ).toMatchObject({ kind: "rejected", reason: "actor_mismatch" });
  expect(mocks.api).not.toHaveBeenCalled();
});
it("再認証が必要なら移動を開始しない", async () => {
  mocks.prepare.mockResolvedValue({ ok: false, reason: "reauth_required" });
  expect(
    await commitParticipation(
      switchConfirmation().operationId,
      principal,
      "discard",
      0,
    ),
  ).toMatchObject({ kind: "rejected", reason: "reauth_required" });
  expect(mocks.api).not.toHaveBeenCalled();
});
it("成功した移動だけに入室ticketを発行する", async () => {
  mocks.api.mockResolvedValue(
    Response.json({
      kind: "ready",
      roomId: "33333333-3333-4333-8333-333333333333",
    }),
  );
  expect(
    await commitParticipation(
      switchConfirmation().operationId,
      principal,
      "retain",
      0,
    ),
  ).toMatchObject({ kind: "ready", entryToken: "admission" });
  expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toEqual({
    operationId: switchConfirmation().operationId,
    expectedPrincipal: principal,
    outcomeAccess: "retain",
    confirmationVersion: 0,
  });
});
it("照会は同じoperationの読み取りを行う", async () => {
  mocks.api.mockResolvedValue(
    Response.json({
      kind: "pending",
      operationId: switchConfirmation().operationId,
      progress: "joining",
      error: "再試行",
    }),
  );
  expect(
    await queryParticipation(switchConfirmation().operationId, principal),
  ).toMatchObject({ kind: "pending" });
  expect(mocks.api.mock.calls[0][1]).toEqual({ cache: "no-store" });
});

it("本人が見た確認versionをcommitのHTTPbodyへ渡す", async () => {
  mocks.api.mockResolvedValue(
    Response.json({
      kind: "confirmation",
      confirmation: { ...switchConfirmation(), version: 2 },
    }),
  );
  await commitParticipation(
    switchConfirmation().operationId,
    principal,
    "retain",
    2,
  );
  expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toMatchObject({
    confirmationVersion: 2,
    outcomeAccess: "retain",
  });
});

it("公開actionは確認version欠落を0で補わずAPI送信前に拒否する", async () => {
  mocks.api.mockResolvedValue(
    Response.json({
      kind: "ready",
      roomId: "33333333-3333-4333-8333-333333333333",
    }),
  );
  await expect(
    Reflect.apply(commitParticipation, undefined, [
      switchConfirmation().operationId,
      principal,
      "discard",
    ]),
  ).rejects.toThrow();
  expect(mocks.api).not.toHaveBeenCalled();
});

describe("ゲスト更新後の参加切替", () => {
  const now = 1_800_000_000;
  const roomId = "33333333-3333-4333-8333-333333333333";
  const secret = "participation-refresh-secret-at-least-32-bytes";
  const guest = {
    kind: "guest" as const,
    sub: principal,
    email: null,
    exp: now + 17999,
  };
  const run = () =>
    commitParticipation(
      switchConfirmation().operationId,
      principal,
      "discard",
      0,
    );
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    vi.stubEnv("SESSION_SECRET", secret);
    mocks.user.mockResolvedValue(guest);
    mocks.prepare.mockResolvedValue({
      ok: true,
      user: { ...guest, exp: now + SESSION_TTL_SECONDS },
    });
    const actual = await vi.importActual<
      typeof import("@/lib/session/room-entry")
    >("@/lib/session/room-entry");
    mocks.issue.mockImplementation(actual.issueRoomEntry);
    mocks.api.mockResolvedValue(Response.json({ kind: "ready", roomId }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("残り5時間未満のguestは参加切替に成功し更新後のexpで入室証明を発行する", async () => {
    const result = await run();
    expect(result).toMatchObject({
      kind: "ready",
      entryToken: expect.any(String),
    });
    expect(mocks.prepare).toHaveBeenCalledWith(guest);
    expect(
      await verifyToken(result.entryToken ?? "", RoomAdmissionSchema, {
        secret,
        audience: ROOM_ENTRY_AUDIENCE.admission,
      }),
    ).toMatchObject({
      principal,
      roomId,
      sessionExp: now + SESSION_TTL_SECONDS,
    });
  });
  it("更新で本人確認不可ならidentity_unavailableを返し切替も入室証明発行もしない", async () => {
    mocks.prepare.mockResolvedValue({
      ok: false,
      reason: "identity_unavailable",
    });
    expect(await run()).toMatchObject({
      kind: "rejected",
      reason: "identity_unavailable",
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("accountの残り5時間未満なら再認証を要求し切替も入室証明発行もしない", async () => {
    mocks.user.mockResolvedValue({
      ...guest,
      kind: "account",
      email: "account@example.test",
    });
    mocks.prepare.mockResolvedValue({ ok: false, reason: "reauth_required" });
    expect(await run()).toMatchObject({
      kind: "rejected",
      reason: "reauth_required",
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
