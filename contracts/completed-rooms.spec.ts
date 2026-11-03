import { expect, it } from "vitest";
import { LeaveRoomRequestSchema } from "./completed-rooms";

it.each([undefined, "retain", "discard"])(
  "本人退出の%sで閲覧権を消す指定を受け付けない",
  (outcomeAccess) => {
    expect(LeaveRoomRequestSchema.parse({ outcomeAccess }).outcomeAccess).toBe(
      "retain",
    );
  },
);
it("不正な閲覧権は拒否する", () => {
  expect(
    LeaveRoomRequestSchema.safeParse({ outcomeAccess: "unknown" }).success,
  ).toBe(false);
});
