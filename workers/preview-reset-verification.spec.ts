import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { runInRoomDO } from "./test-helpers";

it("Previewリセット確認用のD1とRoomDOのスキーマを作れる", async () => {
  const d1 = await env.DB.prepare(
    "PRAGMA table_info(preview_reset_verification)",
  ).all<{ name: string }>();
  expect(d1.results.map((column) => column.name)).toEqual(["marker"]);
  await runInRoomDO("preview-reset-test", (_instance, state) => {
    expect(
      state.storage.sql
        .exec("PRAGMA table_info(preview_reset_verification)")
        .toArray()
        .map((column) => column.name),
    ).toEqual(["marker"]);
  });
});
