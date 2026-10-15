import { expect, it } from "vitest";
import {
  ParticipationCommitSchema,
  ParticipationPrepareSchema,
} from "./room-participation";

it("本人や確認内容の偽装と操作IDの欠落を境界で拒否する", () => {
  const expectedPrincipal = "11111111-1111-4111-8111-111111111111";
  expect(
    ParticipationCommitSchema.safeParse({
      expectedPrincipal,
      outcomeAccess: "retain",
    }).success,
  ).toBe(false);
  expect(
    ParticipationCommitSchema.safeParse({
      expectedPrincipal,
      operationId: crypto.randomUUID(),
      hostUserId: expectedPrincipal,
    }).success,
  ).toBe(false);
  expect(
    ParticipationPrepareSchema.safeParse({
      expectedPrincipal,
      target: { kind: "join", code: "ABC234", userId: expectedPrincipal },
    }).success,
  ).toBe(false);
  expect(
    ParticipationPrepareSchema.safeParse({
      expectedPrincipal,
      target: { kind: "join", code: "ABC234" },
    }).success,
  ).toBe(true);
});
