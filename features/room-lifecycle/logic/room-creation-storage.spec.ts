import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRoomCreationIntent,
  ROOM_CREATION_STORAGE_PREFIX,
  readRoomCreationIntent,
  saveRoomCreationIntent,
} from "./room-creation-storage";

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
describe("作成意図の保存", () => {
  beforeEach(() => sessionStorage.clear());
  it("ユーザーごとに正規化済み入力とIDを保存し消去する", () => {
    saveRoomCreationIntent(USER, { requestId: REQUEST, name: " test " });
    expect(readRoomCreationIntent(USER)).toEqual({
      requestId: REQUEST,
      name: "test",
    });
    expect(readRoomCreationIntent(REQUEST)).toBeNull();
    clearRoomCreationIntent(USER);
    expect(readRoomCreationIntent(USER)).toBeNull();
  });
  it("壊れた記録は新しい要求に置換しない", () => {
    sessionStorage.setItem(ROOM_CREATION_STORAGE_PREFIX + USER, "{}");
    expect(() => readRoomCreationIntent(USER)).toThrow();
    expect(sessionStorage.getItem(ROOM_CREATION_STORAGE_PREFIX + USER)).toBe(
      "{}",
    );
  });
});
