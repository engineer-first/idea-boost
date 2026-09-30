// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createFeedbackId } from "../contracts/feedback";
import { hashFeedbackReceipt } from "../workers/lib/feedback-receipt";
import { feedbackDeleteArgs } from "./feedback.mts";

const migration = (file: string) =>
  readFileSync(
    new URL(`../workers/migrations/${file}`, import.meta.url),
    "utf8",
  );
it("権限migrationは既存の権限と付与日時を保ち、意見閲覧を自動付与しない", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migration("0001_lobby.sql"));
    db.exec(migration("0003_user_permissions.sql"));
    db.exec(
      "INSERT INTO users(id,email) VALUES('reader','reader@test.invalid')",
    );
    db.exec(
      "INSERT INTO user_permissions VALUES('reader','shared_outcomes:read','2026-09-01'),('reader','shared_outcomes:manage_access','2026-09-02')",
    );
    const before = db
      .prepare("SELECT * FROM user_permissions ORDER BY permission")
      .all();
    db.exec(migration("0005_feedback.sql"));
    expect(
      db.prepare("SELECT * FROM user_permissions ORDER BY permission").all(),
    ).toEqual(before);
    db.exec(
      "INSERT INTO user_permissions(user_id,permission) VALUES('reader','feedback:read')",
    );
    expect(
      db.prepare("SELECT count(*) AS count FROM user_permissions").get()?.count,
    ).toBe(3);
    expect(() =>
      db.exec(
        "INSERT INTO user_permissions(user_id,permission) VALUES('reader','invalid')",
      ),
    ).toThrow();
    db.exec("DELETE FROM users WHERE id='reader'");
    expect(
      db.prepare("SELECT count(*) AS count FROM user_permissions").get()?.count,
    ).toBe(0);
  } finally {
    db.close();
  }
});
it("緊急削除CLIは実行対象とUUIDを要求し、指定IDの本文だけを削除する", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const args of [
    ["delete", id],
    ["delete", id, "--invalid"],
    ["delete", "';DROP TABLE feedback;--", "--remote"],
  ])
    await expect(feedbackDeleteArgs(args)).rejects.toThrow();
  const args = await feedbackDeleteArgs(["delete", id, "--local"]);
  expect(args).toContain("--local");
  expect(args).not.toContain("--remote");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration("0001_lobby.sql"));
    db.exec(migration("0003_user_permissions.sql"));
    db.exec(migration("0005_feedback.sql"));
    db.prepare(
      "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,'room','app','good',?,NULL,0,9999999999999)",
    ).run(id, await hashFeedbackReceipt(id), "private");
    db.prepare(
      "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,'room','app','good',?,NULL,0,9999999999999)",
    ).run("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "other-hash", "keep");
    db.exec(args.at(-1) ?? "");
    expect(db.prepare("SELECT body FROM feedback").all()).toEqual([
      { body: "keep" },
    ]);
  } finally {
    db.close();
  }
});

it("緊急削除CLIは本文を消し、再受付を防ぐhashだけの失効記録を残す", async () => {
  const id = createFeedbackId();
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration("0001_lobby.sql"));
    db.exec(migration("0003_user_permissions.sql"));
    db.exec(migration("0005_feedback.sql"));
    db.prepare(
      "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,'room','app','good','private',NULL,0,9999999999999)",
    ).run(id, await hashFeedbackReceipt(id));
    db.exec((await feedbackDeleteArgs(["delete", id, "--local"])).at(-1) ?? "");
    expect(
      db.prepare("SELECT count(*) AS count FROM feedback").get()?.count,
    ).toBe(0);
    expect(
      db.prepare("SELECT count(*) AS count FROM feedback_revocations").get()
        ?.count,
    ).toBe(1);
    const revocation = db.prepare("SELECT * FROM feedback_revocations").get();
    expect(Object.keys(revocation ?? {})).toEqual(["id_hash", "expires_at"]);
    expect(revocation?.id_hash).toBe(await hashFeedbackReceipt(id));
    expect(JSON.stringify(revocation)).not.toContain(id);
    db.exec(
      (await feedbackDeleteArgs(["delete", id.toUpperCase(), "--local"])).at(
        -1,
      ) ?? "",
    );
    expect(db.prepare("SELECT * FROM feedback_revocations").all()).toEqual([
      revocation,
    ]);
  } finally {
    db.close();
  }
});
