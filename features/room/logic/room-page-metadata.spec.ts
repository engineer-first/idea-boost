import { expect, it } from "vitest";
import { getRoomPageMetadata } from "./room-page-metadata";

it.each([
  ["ja", "ルーム | Idea Boost"],
  ["en", "Room | Idea Boost"],
] as const)("ルームのタブ名を表示言語 %s で返す", (locale, title) => {
  expect(getRoomPageMetadata(locale)).toEqual({ title });
});
