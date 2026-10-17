// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("作成要求の名前を15文字に短縮し、再送の識別情報を保持する", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("workers/migrations").filter(
      (f) => f.endsWith(".sql") && f < "0012",
    ))
      db.exec(readFileSync(`workers/migrations/${file}`, "utf8"));
    db.exec("INSERT INTO users(id,email) VALUES('user','owner@example.test')");
    const names = [
      "あ".repeat(80),
      `${"あ".repeat(14)}😀続き`,
      "短い名前",
      "あ".repeat(15),
    ];
    for (const [index, name] of names.entries()) {
      db.prepare(
        "INSERT INTO room_creation_control(user_id,request_id,room_id,expires_at,status) VALUES('user',?,?,1,'ready')",
      ).run(String(index), `room-${index}`);
      db.prepare(
        "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES('user',?,?,?,?,'ready')",
      ).run(String(index), name, `room-${index}`, `code-${index}`);
    }
    db.exec(
      readFileSync("workers/migrations/0012_truncate_room_names.sql", "utf8"),
    );
    expect(
      db
        .prepare("SELECT * FROM room_creation_requests ORDER BY request_id")
        .all(),
    ).toEqual(
      names.map((name, index) => ({
        user_id: "user",
        request_id: String(index),
        name: name.slice(0, 15).replace(/[\uD800-\uDBFF]$/, ""),
        room_id: `room-${index}`,
        invite_code: `code-${index}`,
        status: "ready",
      })),
    );
  } finally {
    db.close();
  }
});
