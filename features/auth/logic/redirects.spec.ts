import { describe, expect, it } from "vitest";
import { getLoginPath, sanitizeNextPath } from "./redirects";

describe("sanitizeNextPath", () => {
  it("アプリ内の相対パスはそのまま通す", () => {
    expect(sanitizeNextPath("/invite/ABC234")).toBe("/invite/ABC234");
    expect(sanitizeNextPath("/rooms/xyz?tab=1")).toBe("/rooms/xyz?tab=1");
  });

  it.each(["/.//evil.com", "/a/..//evil.com", "/%2e%2e//evil.com"])(
    "正規化後にプロトコル相対となる%sを拒否する",
    (value) => {
      expect(sanitizeNextPath(value)).toBe("/");
    },
  );
  it.each([
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
    "/rooms/../invite/ABC234?from=guest#result",
    "/rooms?tab=1#result",
    "/\\evil.com",
    "//evil.com",
  ])("%sは繰り返し安全化しても結果が変わらない", (value) => {
    const safe = sanitizeNextPath(value);
    expect(sanitizeNextPath(safe)).toBe(safe);
    expect(new URL(safe, "https://example.test").origin).toBe(
      "https://example.test",
    );
  });
  it("文字列でなければ / に落とす", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
  });

  it("スキーム付きの絶対URLは / に落とす（オープンリダイレクト防止）", () => {
    expect(sanitizeNextPath("https://evil.example/phish")).toBe("/");
    expect(sanitizeNextPath("http://evil.example")).toBe("/");
  });

  it("プロトコル相対 // は / に落とす", () => {
    expect(sanitizeNextPath("//evil.example")).toBe("/");
  });

  it("バックスラッシュを含むパスは / に落とす", () => {
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
  });

  it("/ で始まらないパスは / に落とす", () => {
    expect(sanitizeNextPath("invite/ABC234")).toBe("/");
  });
});

describe("getLoginPath", () => {
  it("next 未指定なら素の /login", () => {
    expect(getLoginPath()).toBe("/login");
  });

  it("next を安全化して query に載せる", () => {
    expect(getLoginPath("/invite/ABC234")).toBe(
      "/login?next=%2Finvite%2FABC234",
    );
  });

  it("危険な next は / になり、query には付けない", () => {
    expect(getLoginPath("https://evil.example")).toBe("/login");
  });
});
