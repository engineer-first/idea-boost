// upsertUserFromAssertion の同時実行競合のテスト。
// Google 初回ログインが並行すると、両方の SELECT が「未登録」を見てから
// INSERT に至り、片方が UNIQUE 違反（email / google_sub）で落ちる。
// 実 D1 ではこの瞬間を再現できないため、スクリプト化したフェイク D1 で
// 「INSERT が UNIQUE 違反 → 再解決して既存行の id を返す」ことを検証する。
import { describe, expect, it } from "vitest";
import type { LoginAssertion } from "../../contracts/session";
import { upsertUserFromAssertion } from "./db";

const GOOGLE_ASSERTION: LoginAssertion = {
  kind: "google",
  googleSub: "google-sub-1",
  email: "user@example.com",
  name: "User",
};

type FirstResult = { id: string } | null;

// SELECT google_sub → SELECT email → INSERT → (再解決) の呼び出し列を台本にする。
function fakeD1(script: {
  firstResults: FirstResult[];
  insertError?: Error;
}): D1Database {
  const firstQueue = [...script.firstResults];
  let insertAttempted = false;
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (firstQueue.length === 0) {
                throw new Error(`予定外の SELECT: ${sql}`);
              }
              return firstQueue.shift() ?? null;
            },
            async run() {
              if (sql.startsWith("INSERT") && !insertAttempted) {
                insertAttempted = true;
                if (script.insertError) {
                  throw script.insertError;
                }
              }
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("upsertUserFromAssertion（Google 分岐の UNIQUE 競合）", () => {
  it("INSERT が UNIQUE 違反なら再解決して既存行の id を返す", async () => {
    const db = fakeD1({
      firstResults: [
        null, // 1回目: google_sub 未登録
        null, // 1回目: email 未登録 → INSERT へ（並行リクエストが先に INSERT 済み）
        { id: "existing-user-id" }, // 再解決: google_sub で既存行が見つかる
      ],
      insertError: new Error("D1_ERROR: UNIQUE constraint failed: users.email"),
    });

    await expect(upsertUserFromAssertion(db, GOOGLE_ASSERTION)).resolves.toBe(
      "existing-user-id",
    );
  });

  it("UNIQUE 以外の INSERT 失敗はそのまま伝播する", async () => {
    const db = fakeD1({
      firstResults: [null, null],
      insertError: new Error("D1_ERROR: database is locked"),
    });

    await expect(upsertUserFromAssertion(db, GOOGLE_ASSERTION)).rejects.toThrow(
      "database is locked",
    );
  });
});

describe("ゲスト行へのGoogle連携", () => {
  it("同じusers行へGoogleを追加してもname・表示名・revisionを上書きしない", async () => {
    const { env } = await import("cloudflare:workers");
    const { linkGoogleToGuest } = await import("./db");
    const userId = crypto.randomUUID();
    await upsertUserFromAssertion(env.DB, {
      kind: "guest",
      userId,
      displayName: "自分で選んだ名前",
    });
    const read = () =>
      env.DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
    const before = await read();
    const googleSub = `google-${crypto.randomUUID()}`;
    const email = `${crypto.randomUUID()}@example.test`;
    await linkGoogleToGuest(env.DB, { userId, googleSub, email });
    expect(await read()).toEqual({ ...before, google_sub: googleSub, email });
  });
});
