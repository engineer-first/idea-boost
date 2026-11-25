import { describe, expect, it } from "vitest";
import type { SharingState } from "@/contracts/room-protocol";
import { getSharingTimeUpRole } from "./sharing-time-up-role";

const order: SharingState["order"] = [
  { userId: "u1", name: "A", color: "yellow" },
  { userId: "u2", name: "B", color: "blue" },
];

const sharing = (
  status: SharingState["status"],
  currentIndex: number | null,
): SharingState => ({
  revision: "00000000-0000-4000-8000-000000000000",
  status,
  order,
  currentIndex,
  results: [],
  durationMs: 180_000,
  startsAt: null,
});

describe("共有ステップの時間切れで自分が誰として案内を受けるか", () => {
  it("今の発表者なら presenter", () => {
    expect(getSharingTimeUpRole(sharing("active", 0), "u1")).toBe("presenter");
  });
  it("発表者以外なら listener", () => {
    expect(getSharingTimeUpRole(sharing("active", 0), "u2")).toBe("listener");
  });
  it("共有が終わっていれば finished", () => {
    expect(getSharingTimeUpRole(sharing("complete", null), "u1")).toBe(
      "finished",
    );
  });
  it("発表者が分からないときは presenter", () => {
    expect(getSharingTimeUpRole(null, "u1")).toBe("presenter");
    expect(getSharingTimeUpRole(sharing("ready", null), "u1")).toBe(
      "presenter",
    );
  });
});
