import { expect, it } from "vitest";
import { getLandingEntry } from "./landing-entry";

it.each([
  undefined,
  "",
  "/",
  "/?from=login#top",
  "/login?next=/about",
  "/about#start",
  "/about/",
  "/login/",
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
])("通常開始に正規化する: %s", (next) => {
  expect(getLandingEntry(false, next)).toEqual({
    href: "/login?next=%2Fhome",
    label: "Googleでログインして始める",
    showStartHelp: true,
  });
  expect(getLandingEntry(true, next)).toEqual({
    href: "/home",
    label: "ホームへ進む",
    showStartHelp: false,
  });
});
it.each([
  ["/invite/ABC123", "ログインして招待の参加確認へ", "招待の参加確認へ進む"],
  [
    "/shared-outcomes?status=confirmed#results",
    "ログインして元の画面へ戻る",
    "元の画面へ戻る",
  ],
  ["/rooms/abc/start", "ログインして元の画面へ戻る", "元の画面へ戻る"],
  ["/about-us", "ログインして元の画面へ戻る", "元の画面へ戻る"],
])("戻り先と文脈を保持する: %s", (next, guestLabel, memberLabel) => {
  expect(getLandingEntry(false, next)).toEqual({
    href: `/login?next=${encodeURIComponent(next)}`,
    label: guestLabel,
    showStartHelp: false,
  });
  expect(getLandingEntry(true, next)).toEqual({
    href: next,
    label: memberLabel,
    showStartHelp: false,
  });
});
it("明示されたホームは通常の開始導線として扱う", () => {
  expect(getLandingEntry(false, "/home").label).toBe(
    "Googleでログインして始める",
  );
});
