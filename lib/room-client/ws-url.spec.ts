import { describe, expect, it } from "vitest";
import { roomWebSocketUrl } from "@/lib/room-client/ws-url";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("roomWebSocketUrl", () => {
  it("http のベースURLは ws に変換される", () => {
    expect(roomWebSocketUrl(ROOM_ID, { base: "http://localhost:8787" })).toBe(
      `ws://localhost:8787/api/rooms/${ROOM_ID}/ws`,
    );
  });

  it("https のベースURLは wss に変換される", () => {
    expect(roomWebSocketUrl(ROOM_ID, { base: "https://api.example.com" })).toBe(
      `wss://api.example.com/api/rooms/${ROOM_ID}/ws`,
    );
  });

  it("ws:// のベースURLはそのまま使われる", () => {
    expect(roomWebSocketUrl(ROOM_ID, { base: "ws://localhost:8787" })).toBe(
      `ws://localhost:8787/api/rooms/${ROOM_ID}/ws`,
    );
  });

  it("ベースURL未設定なら現在のオリジン（同一オリジン配備）を使う", () => {
    expect(
      roomWebSocketUrl(ROOM_ID, {
        base: "",
        origin: "https://idea-boost.example",
      }),
    ).toBe(`wss://idea-boost.example/api/rooms/${ROOM_ID}/ws`);
  });
});
