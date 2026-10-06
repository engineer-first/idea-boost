// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("追加migrationは旧公開証拠とv4衝突を保全し、pending詳細消去を公開にしない", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("workers/migrations").filter(
      (f) => f.endsWith(".sql") && f < "0009",
    ))
      db.exec(readFileSync(`workers/migrations/${file}`, "utf8"));
    db.exec(
      "INSERT INTO users(id,email) VALUES('user','owner@example.test'); INSERT INTO rooms(id,invite_code,host_id) VALUES('pending','CODE01','user'),('ready','CODE02','user'),('legacy','CODE03','user'); INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES('pending',1,2),('ready',1,2),('legacy',1,2); INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES('user','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pending name','pending','CODE01','pending'),('user','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','ready name','ready','CODE02','ready');",
    );
    db.exec(
      readFileSync("workers/migrations/0009_room_creation_expiry.sql", "utf8"),
    );
    expect(
      db.prepare("SELECT id,creation_visibility FROM rooms ORDER BY id").all(),
    ).toEqual([
      { id: "legacy", creation_visibility: "legacy" },
      { id: "pending", creation_visibility: "hidden" },
      { id: "ready", creation_visibility: "legacy" },
    ]);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM room_creation_control WHERE lower(request_id)='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND legacy=1",
        )
        .get()?.n,
    ).toBe(2);
    db.exec("DELETE FROM room_creation_requests;");
    expect(
      db
        .prepare("SELECT creation_visibility FROM rooms WHERE id='pending'")
        .get()?.creation_visibility,
    ).toBe("hidden");
    expect(
      db
        .prepare(
          "SELECT COUNT(DISTINCT expires_at) AS n FROM room_creation_control",
        )
        .get()?.n,
    ).toBe(1);
    expect(
      db
        .prepare("SELECT cleanup_enabled FROM room_creation_policy WHERE id=1")
        .get()?.cleanup_enabled,
    ).toBe(0);
  } finally {
    db.close();
  }
});
