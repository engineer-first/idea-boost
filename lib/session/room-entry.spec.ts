// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRoomEntryTime } from "./room-entry";

const user = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  exp: 20000,
};
describe("入室に必要な残り時間", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    [1999, true],
    [2000, true],
    [2001, false],
  ])("時刻 %s の境界", (now, expected) => {
    expect(hasRoomEntryTime(user, now)).toBe(expected);
  });
  it("未認証は認証を要求する", () =>
    expect(hasRoomEntryTime(null, 0)).toBe(false));
  it("PreviewではAccessで検証済みの1時間セッションで入室できる", () => {
    vi.stubEnv("PREVIEW_ENABLED", "true");
    expect(hasRoomEntryTime({ ...user, exp: 3600 }, 0)).toBe(true);
  });
  it.each([3599, 3600, 3601])("Previewの期限境界 %s", (now) => {
    vi.stubEnv("PREVIEW_ENABLED", "true");
    expect(hasRoomEntryTime({ ...user, exp: 3600 }, now)).toBe(now < 3600);
    expect(hasRoomEntryTime(null, now)).toBe(false);
  });
  it.each([
    undefined,
    "false",
  ])("Previewを有効にしなければ短いセッションで入室できない (%s)", (enabled) => {
    vi.stubEnv("PREVIEW_ENABLED", enabled);
    expect(hasRoomEntryTime({ ...user, exp: 3600 }, 0)).toBe(false);
  });
});
