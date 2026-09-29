import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS } from "../contracts/access";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { DEV_USERS } from "../lib/session/dev-users";
import { signToken } from "../lib/session/token";
import worker from "./api-worker";
import { sessionCookieFor } from "./test-helpers";

const manager = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "manager@test.invalid",
  name: "Manager",
};
const reader = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "reader@test.invalid",
  name: "Reader",
};

async function call(
  path: string,
  user?: typeof manager,
  method = "GET",
  body?: unknown,
) {
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: {
        ...(user ? { Cookie: await sessionCookieFor(user) } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

beforeEach(async () => {
  for (const user of [manager, reader]) {
    await env.DB.prepare(
      "INSERT INTO users(id,email,name) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name",
    )
      .bind(user.sub, user.email, user.name)
      .run();
    await env.DB.prepare("DELETE FROM user_permissions WHERE user_id=?")
      .bind(user.sub)
      .run();
  }
});

describe("共有成果の閲覧権限", () => {
  it("未ログインと古いBearer秘密値を401、権限なしのセッションを403にする", async () => {
    expect((await call("/api/shared-outcomes")).status).toBe(401);
    expect(
      (
        await worker.fetch(
          new Request("https://api.test/api/shared-outcomes", {
            headers: { Authorization: "Bearer old-secret" },
          }),
          env,
        )
      ).status,
    ).toBe(401);
    expect((await call("/api/shared-outcomes", reader)).status).toBe(403);
  });

  it("付与後は一覧を読め、剥奪直後は同じセッションでも403になる", async () => {
    const cookie = await sessionCookieFor(reader);
    const request = () =>
      worker.fetch(
        new Request("https://api.test/api/shared-outcomes", {
          headers: { Cookie: cookie },
        }),
        env,
      );
    await env.DB.prepare(
      "INSERT INTO user_permissions(user_id,permission) VALUES(?,?)",
    )
      .bind(reader.sub, "shared_outcomes:read")
      .run();
    expect((await request()).status).toBe(200);
    await env.DB.prepare(
      "DELETE FROM user_permissions WHERE user_id=? AND permission=?",
    )
      .bind(reader.sub, "shared_outcomes:read")
      .run();
    expect((await request()).status).toBe(403);
  });

  it("read権限で詳細を取得し、剥奪直後は同じCookieで詳細も拒否する", async () => {
    const { createRoomAs } = await import("./test-helpers");
    const room = await createRoomAs(reader);
    const path = `/api/shared-outcomes/${room.roomId}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
    )
      .bind(reader.sub, PERMISSIONS.readSharedOutcomes)
      .run();
    expect((await call(path, reader)).status).toBe(200);
    await env.DB.prepare(
      "DELETE FROM user_permissions WHERE user_id=? AND permission=?",
    )
      .bind(reader.sub, PERMISSIONS.readSharedOutcomes)
      .run();
    expect((await call(path, reader)).status).toBe(403);
  });
});

it("開発用ログイン時はOwnerだけにreadとmanage_accessを自動付与する", async () => {
  const member = DEV_USERS[1];
  const assertion = await signToken(
    { kind: "dev", userId: member.id, email: member.email, name: member.name },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.loginAssertion,
      expiresInSeconds: 60,
    },
  );
  const response = await worker.fetch(
    new Request("https://api.test/api/auth/sync", {
      method: "POST",
      body: JSON.stringify({ assertion }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const ownerPermissions = await env.DB.prepare(
    "SELECT permission FROM user_permissions WHERE user_id=? ORDER BY permission",
  )
    .bind(DEV_USERS[0].id)
    .all<{ permission: string }>();
  expect(ownerPermissions.results.map((row) => row.permission)).toEqual([
    PERMISSIONS.manageSharedOutcomesAccess,
    PERMISSIONS.readSharedOutcomes,
  ]);
  const memberPermissions = await env.DB.prepare(
    "SELECT permission FROM user_permissions WHERE user_id=?",
  )
    .bind(member.id)
    .all();
  expect(memberPermissions.results).toEqual([]);
});

describe("成果閲覧者の管理", () => {
  it("readだけでは管理APIを使えない", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
    )
      .bind(reader.sub, "shared_outcomes:read")
      .run();
    expect((await call("/api/admin/access", reader)).status).toBe(403);
    expect(
      (
        await call("/api/admin/access", reader, "POST", {
          email: manager.email,
        })
      ).status,
    ).toBe(403);
  });

  it("管理者が閲覧者を二重付与・一覧・剥奪でき、管理権限は変更できない", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
    )
      .bind(manager.sub, "shared_outcomes:manage_access")
      .run();
    expect(
      (
        await call("/api/admin/access", manager, "POST", {
          email: reader.email,
          permission: "shared_outcomes:manage_access",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/api/admin/access", manager, "POST", {
          email: reader.email,
          userId: manager.sub,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/api/admin/access", manager, "POST", {
          email: reader.email,
        })
      ).status,
    ).toBe(200);
    expect(
      await (await call("/api/admin/access", manager)).json(),
    ).toMatchObject({
      users: [
        expect.objectContaining({ email: reader.email, name: reader.name }),
      ],
    });
    expect(
      (
        await call("/api/admin/access", manager, "POST", {
          email: "missing@test.invalid",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("/api/admin/access", manager, "DELETE", {
          email: reader.email,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/api/admin/access", manager, "DELETE", {
          email: reader.email,
        })
      ).status,
    ).toBe(200);
    expect((await call("/api/admin/access", manager)).status).toBe(200);
  });
});
