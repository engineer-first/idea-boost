import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLastRoom,
  readLastRoom,
  rememberLastRoom,
} from "./last-room-storage";

const userId = "11111111-1111-4111-8111-111111111111";
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("直前ルーム候補", () => {
  beforeEach(() => localStorage.clear());
  it("本文や名前を保存せず、同じアカウントの直前1件だけを読む", () => {
    rememberLastRoom(userId, roomId);
    expect(readLastRoom(userId)).toBe(roomId);
    expect(readLastRoom("22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("idea-boost:last-room") ?? "null"),
    ).toEqual({ userId, roomId });
    rememberLastRoom(userId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(readLastRoom(userId)).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
  it("退出時は対象候補だけを消し、ログアウト時は消す", () => {
    rememberLastRoom(userId, roomId);
    clearLastRoom("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(readLastRoom(userId)).toBe(roomId);
    clearLastRoom(roomId);
    expect(readLastRoom(userId)).toBeNull();
    rememberLastRoom(userId, roomId);
    clearLastRoom();
    expect(readLastRoom(userId)).toBeNull();
  });
  it("壊れた保存と保存禁止環境でも操作を止めない", () => {
    localStorage.setItem("idea-boost:last-room", "bad");
    expect(readLastRoom(userId)).toBeNull();
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => rememberLastRoom(userId, roomId)).not.toThrow();
    spy.mockRestore();
  });
});
