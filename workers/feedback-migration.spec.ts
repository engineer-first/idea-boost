import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("種類の移行で既存投稿・索引・失効トリガーを維持する", async () => {
  const original = env.TEST_MIGRATIONS?.find(
    (migration) => migration.name === "0005_feedback.sql",
  );
  const upgrade = env.TEST_MIGRATIONS?.find(
    (migration) => migration.name === "0007_feedback_unclear.sql",
  );
  expect(original).toBeDefined();
  expect(upgrade).toBeDefined();
  if (!original || !upgrade) return;
  await env.DB.batch([
    env.DB.prepare("DROP TRIGGER feedback_revoke_delete"),
    env.DB.prepare("DROP TRIGGER feedback_reject_revoked"),
    env.DB.prepare("DROP TABLE feedback"),
    env.DB.prepare("DROP TABLE feedback_revocations"),
  ]);
  const permissionsIndex = original.queries.findIndex((query) =>
    query.includes("CREATE TABLE user_permissions_next"),
  );
  await env.DB.batch(
    original.queries
      .slice(0, permissionsIndex)
      .map((query) => env.DB.prepare(query)),
  );
  const record = {
    id: crypto.randomUUID(),
    hash: "existing-receipt",
    room: crypto.randomUUID(),
    target: "app",
    kind: "good",
    body: "既存の意見",
    rating: 4,
    created: 100,
    expires: 200,
  };
  const insert =
    "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)";
  await env.DB.prepare(insert)
    .bind(
      record.id,
      record.hash,
      record.room,
      record.target,
      record.kind,
      record.body,
      record.rating,
      record.created,
      record.expires,
    )
    .run();
  await env.DB.prepare(
    "INSERT INTO feedback_revocations(id_hash,expires_at) VALUES('already-revoked',300)",
  ).run();
  const before = await env.DB.prepare("SELECT * FROM feedback WHERE id=?")
    .bind(record.id)
    .first();
  await env.DB.batch(upgrade.queries.map((query) => env.DB.prepare(query)));
  expect(
    await env.DB.prepare("SELECT * FROM feedback WHERE id=?")
      .bind(record.id)
      .first(),
  ).toEqual(before);
  expect(
    await env.DB.prepare(
      "SELECT expires_at FROM feedback_revocations WHERE id_hash='already-revoked'",
    ).first(),
  ).toEqual({ expires_at: 300 });
  const indexes = await env.DB.prepare("PRAGMA index_list(feedback)").all<{
    name: string;
  }>();
  expect(indexes.results.map((index) => index.name)).toEqual(
    expect.arrayContaining([
      "feedback_recent",
      "feedback_expiry",
      "feedback_filter",
      "feedback_id_hash",
    ]),
  );
  await env.DB.prepare(
    "INSERT INTO feedback_revocations(id_hash,expires_at) VALUES(?,?)",
  )
    .bind(record.hash, 300)
    .run();
  expect(
    await env.DB.prepare("SELECT * FROM feedback WHERE id=?")
      .bind(record.id)
      .first(),
  ).toBeNull();
  await env.DB.prepare(insert)
    .bind(
      record.id,
      record.hash,
      record.room,
      record.target,
      "unclear",
      record.body,
      null,
      record.created,
      record.expires,
    )
    .run();
  expect(
    await env.DB.prepare("SELECT * FROM feedback WHERE id=?")
      .bind(record.id)
      .first(),
  ).toBeNull();
  await env.DB.prepare(insert)
    .bind(
      crypto.randomUUID(),
      "fresh-receipt",
      record.room,
      record.target,
      "unclear",
      "",
      null,
      record.created,
      record.expires,
    )
    .run();
  expect(
    await env.DB.prepare(
      "SELECT kind FROM feedback WHERE id_hash='fresh-receipt'",
    ).first(),
  ).toEqual({ kind: "unclear" });
});
