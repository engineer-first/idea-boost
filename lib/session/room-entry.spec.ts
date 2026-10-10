// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasRoomEntryTime } from "./room-entry";

const user = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  exp: 20000,
};
describe("入室に必要な残り時間", () => {
  it.each([
    [1999, true],
    [2000, true],
    [2001, false],
  ])("時刻 %s の境界", (now, expected) => {
    expect(hasRoomEntryTime(user, now)).toBe(expected);
  });
  it("未認証は認証を要求する", () =>
    expect(hasRoomEntryTime(null, 0)).toBe(false));
});
