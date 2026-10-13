import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: vi.fn(),
  enough: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/session/room-entry", () => ({
  hasRoomEntryTime: mocks.enough,
  issueRoomEntry: vi.fn().mockResolvedValue("admission"),
}));

import { switchConfirmation } from "./participation.fixture";
import {
  commitParticipation,
  queryParticipation,
} from "./participation-actions";

const principal = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  mocks.api.mockReset();
  mocks.user.mockResolvedValue({ sub: principal });
  mocks.enough.mockReturnValue(true);
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
  mocks.enough.mockReturnValue(false);
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
