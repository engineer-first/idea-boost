import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const tables = [
  "users",
  "user_permissions",
  "rooms",
  "room_creation_requests",
  "room_creation_control",
];

async function prepare0012() {
  // 適用済みDBから参照側のDDLを保存し、usersだけ0012時点の定義で再現する。
  const schema = await env.DB.prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND tbl_name IN ('users','user_permissions','rooms','room_creation_requests','room_creation_control') ORDER BY type,name",
  ).all<{ type: string; name: string; tbl_name: string; sql: string }>();
  await env.DB.batch([
    ...[
      "room_creation_requests",
      "room_creation_control",
      "rooms",
      "user_permissions",
      "users",
    ].map((table) => env.DB.prepare(`DROP TABLE ${table}`)),
    env.DB.prepare(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      google_sub TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      display_name TEXT,
      display_name_revision INTEGER NOT NULL DEFAULT 0
    )`),
    ...schema.results
      .filter((row) => row.type === "table" && row.name !== "users")
      .map((row) => env.DB.prepare(row.sql)),
    ...schema.results
      .filter((row) => row.type !== "table")
      .map((row) => env.DB.prepare(row.sql)),
  ]);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const room = crypto.randomUUID();
  await env.DB.batch([
    ...ids.map((id, index) =>
      env.DB.prepare(
        "INSERT INTO users(id,email,name,google_sub,created_at,display_name,display_name_revision) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        id,
        `${id}@example.test`,
        `本人${index}`,
        `google:${id}`,
        "2026-01-02 03:04:05",
        `表示名${index}`,
        index + 4,
      ),
    ),
    env.DB.prepare(
      "INSERT INTO user_permissions(user_id,permission,created_at) VALUES(?,'shared_outcomes:read','2026-02-03 04:05:06')",
    ).bind(ids[0]),
    env.DB.prepare(
      "INSERT INTO rooms(id,invite_code,host_id,creation_visibility) VALUES(?,'ABC234',?,'published')",
    ).bind(room, ids[0]),
    env.DB.prepare(
      "INSERT INTO room_creation_control(user_id,request_id,room_id,expires_at,status,retry_at,attempts) VALUES(?,'request-0012',?,123456,'ready',123,2)",
    ).bind(ids[0], room),
    env.DB.prepare(
      "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES(?,'request-0012','保存済みルーム',?,'ABC234','ready')",
    ).bind(ids[0], room),
  ]);
  return { ids, room };
}

async function snapshot() {
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    rows[table] = (
      await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()
    ).results;
  }
  return rows;
}

describe("0012から0013へのゲストユーザー移行", () => {
  it("0012の再現手順はD1上で動き全7列・参照・NOT NULL制約を備える", async () => {
    const { ids } = await prepare0012();
    const columns = await env.DB.prepare("PRAGMA table_info(users)").all<{
      name: string;
      notnull: number;
    }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id",
      "email",
      "name",
      "google_sub",
      "created_at",
      "display_name",
      "display_name_revision",
    ]);
    expect(
      columns.results.find((column) => column.name === "email")?.notnull,
    ).toBe(1);
    expect(
      (await env.DB.prepare("SELECT * FROM users").all()).results,
    ).toHaveLength(2);
    expect(
      await env.DB.prepare(
        "SELECT user_id FROM user_permissions WHERE user_id=?",
      )
        .bind(ids[0])
        .first(),
    ).toEqual({ user_id: ids[0] });
    expect(
      (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    await expect(
      env.DB.prepare("INSERT INTO users(id,email) VALUES(?,NULL)")
        .bind(crypto.randomUUID())
        .run(),
    ).rejects.toThrow();
  });

  it("0013は全行・権限・参照・索引・制御トリガーを保持しNULLメールを複数受理する", async () => {
    const { ids } = await prepare0012();
    const before = await snapshot();
    const structure = await env.DB.prepare(
      "SELECT type,name,tbl_name FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name IN ('users','user_permissions','rooms','room_creation_requests','room_creation_control') ORDER BY name",
    ).all();
    const references = [];
    for (const table of tables.slice(1))
      references.push(
        (await env.DB.prepare(`PRAGMA foreign_key_list(${table})`).all())
          .results,
      );
    const upgrade = env.TEST_MIGRATIONS?.find(
      (migration) => migration.name === "0013_guest_users.sql",
    );
    expect(
      upgrade,
      "0013_guest_users.sqlがテスト用migrationに存在する",
    ).toBeDefined();
    if (!upgrade) return;
    await env.DB.batch(upgrade.queries.map((query) => env.DB.prepare(query)));
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await env.DB.prepare("PRAGMA table_info(users)").all<{
          name: string;
          notnull: number;
        }>()
      ).results.map(({ name }) => name),
    ).toEqual([
      "id",
      "email",
      "name",
      "google_sub",
      "created_at",
      "display_name",
      "display_name_revision",
    ]);
    expect(
      (
        await env.DB.prepare(
          "SELECT type,name,tbl_name FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name IN ('users','user_permissions','rooms','room_creation_requests','room_creation_control') ORDER BY name",
        ).all()
      ).results,
    ).toEqual(structure.results);
    for (const [index, table] of tables.slice(1).entries())
      expect(
        (await env.DB.prepare(`PRAGMA foreign_key_list(${table})`).all())
          .results,
      ).toEqual(references[index]);
    expect(
      (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    await expect(
      env.DB.prepare(
        "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES(?,'untracked','未追跡',?,'DEF567','pending')",
      )
        .bind(ids[0], crypto.randomUUID())
        .run(),
    ).rejects.toThrow(/creation protocol upgrade required/);
    const guests = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of guests)
      await env.DB.prepare("INSERT INTO users(id,email) VALUES(?,NULL)")
        .bind(id)
        .run();
    expect(
      (await env.DB.prepare("SELECT id FROM users WHERE email IS NULL").all())
        .results,
    ).toHaveLength(2);
    await expect(
      env.DB.prepare("INSERT INTO users(id,email) VALUES(?,?)")
        .bind(crypto.randomUUID(), `${ids[0]}@example.test`)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    expect(
      (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
