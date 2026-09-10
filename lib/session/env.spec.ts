// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBaseUrl,
  getSessionSecret,
  isAuthConfigured,
} from "@/lib/session/env";

const VALID = "a-sufficiently-long-random-secret-value";
const KNOWN_LEAKED = "dev-session-secret-change-in-production!!";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSessionSecret", () => {
  it("十分な長さの秘密はそのまま返す", () => {
    vi.stubEnv("SESSION_SECRET", VALID);
    expect(getSessionSecret()).toBe(VALID);
  });

  it("未設定は例外", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => getSessionSecret()).toThrow();
  });

  it("短すぎる秘密は例外", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => getSessionSecret()).toThrow();
  });

  it("git 履歴に漏れた既知の値は例外", () => {
    vi.stubEnv("SESSION_SECRET", KNOWN_LEAKED);
    expect(() => getSessionSecret()).toThrow();
  });
});

// 招待URLや OAuth redirect_uri の origin はこの設定値から作る。
// リクエストヘッダー（x-forwarded-host 等）は client が偽装できるため使わない。
describe("getBaseUrl", () => {
  it("NEXT_PUBLIC_SITE_URL が設定されていればそれを返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ideaboost.example.com");
    expect(getBaseUrl()).toBe("https://ideaboost.example.com");
  });

  it("本番で未設定なら例外（fail-closed）", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getBaseUrl()).toThrow();
  });

  it("開発で未設定なら localhost にフォールバックする", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("isAuthConfigured", () => {
  it("有効な秘密が設定されていれば true", () => {
    vi.stubEnv("SESSION_SECRET", VALID);
    expect(isAuthConfigured()).toBe(true);
  });

  it("既知漏洩値では false（未設定と同じ扱い）", () => {
    vi.stubEnv("SESSION_SECRET", KNOWN_LEAKED);
    expect(isAuthConfigured()).toBe(false);
  });

  it("未設定では false", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
  });
});
