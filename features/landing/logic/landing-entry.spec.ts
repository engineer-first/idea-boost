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
  expect.soft(getLandingEntry(false, next)).toEqual({
    href: "/login?next=%2Fhome",
    label: "無料で始める",
    showStartHelp: true,
    loginHref: "/login?next=%2Fhome",
  });
  expect(getLandingEntry(true, next)).toEqual({
    href: "/home",
    label: "ホームへ進む",
    showStartHelp: false,
    loginHref: "/login?next=%2Fhome",
  });
});
it.each([
  [
    "/shared-outcomes?status=confirmed#results",
    "ログインして元の画面へ戻る",
    "元の画面へ戻る",
  ],
  ["/rooms/abc/start", "ログインして元の画面へ戻る", "元の画面へ戻る"],
  ["/about-us", "ログインして元の画面へ戻る", "元の画面へ戻る"],
])("戻り先と文脈を保持する: %s", (next, guestLabel, memberLabel) => {
  expect.soft(getLandingEntry(false, next)).toEqual({
    href: `/login?next=${encodeURIComponent(next)}`,
    label: guestLabel,
    showStartHelp: false,
    loginHref: `/login?next=${encodeURIComponent(next)}`,
  });
  expect(getLandingEntry(true, next)).toEqual({
    href: next,
    label: memberLabel,
    showStartHelp: false,
    loginHref: `/login?next=${encodeURIComponent(next)}`,
  });
});
it("明示されたホームは通常の開始導線として扱う", () => {
  expect(getLandingEntry(false, "/home").label).toBe("無料で始める");
});

it("未ログインでも招待の参加確認へ直接進み、ログイン導線には招待先を保持する", () => {
  expect(getLandingEntry(false, "/invite/ABC123")).toEqual({
    href: "/invite/ABC123",
    label: "招待の参加確認へ進む",
    showStartHelp: false,
    loginHref: "/login?next=%2Finvite%2FABC123",
  });
  expect(getLandingEntry(true, "/invite/ABC123")).toEqual({
    href: "/invite/ABC123",
    label: "招待の参加確認へ進む",
    showStartHelp: false,
    loginHref: "/login?next=%2Finvite%2FABC123",
  });
});
