// SESSION_SECRET の妥当性検証（環境非依存の純粋関数）。
// Next 側（lib/session/env.ts）と workers 側（workers/lib/session-secret.ts）は
// どちらもこの判定ロジックを共有する。呼び出し側のエラーメッセージ（Next 向け /
// wrangler 向け）は異なるため、判定結果だけをここで返す。
import { describe, expect, it } from "vitest";
import { sessionSecretIssue } from "@/lib/session/secret";

const VALID = "a-sufficiently-long-random-secret-value";
const KNOWN_LEAKED = "dev-session-secret-change-in-production!!";
const EXAMPLE_PLACEHOLDER = "local-dev-secret-please-change-me-1234";

describe("sessionSecretIssue", () => {
  it("未設定は missing-or-short", () => {
    expect(sessionSecretIssue(undefined)).toBe("missing-or-short");
  });

  it("短すぎる秘密は missing-or-short", () => {
    expect(sessionSecretIssue("short")).toBe("missing-or-short");
  });

  // HS256 の鍵は RFC 7518 §3.2 でハッシュ出力と同じ 256bit（32バイト）以上が
  // MUST。判定は文字数ではなく UTF-8 バイト長で行う。
  it("31バイトの秘密は missing-or-short（HS256 の下限未満）", () => {
    expect(sessionSecretIssue("a".repeat(31))).toBe("missing-or-short");
  });

  it("32バイトちょうどの秘密は null（問題なし）", () => {
    expect(sessionSecretIssue("a".repeat(32))).toBeNull();
  });

  it("マルチバイト文字はバイト長で数える（11文字でも33バイトなら有効）", () => {
    expect(sessionSecretIssue("あ".repeat(11))).toBeNull();
  });

  it("git 履歴に漏れた既知の値は known-insecure", () => {
    expect(sessionSecretIssue(KNOWN_LEAKED)).toBe("known-insecure");
  });

  it("example の placeholder 値は known-insecure（本番コピー事故防止）", () => {
    expect(sessionSecretIssue(EXAMPLE_PLACEHOLDER)).toBe("known-insecure");
  });

  it("十分な長さで既知漏洩値でなければ null（問題なし）", () => {
    expect(sessionSecretIssue(VALID)).toBeNull();
  });
});
