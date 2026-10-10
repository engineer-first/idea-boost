import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { unstable_readConfig } from "wrangler";
import { z } from "zod";

const root = new URL("../", import.meta.url);
const appSchema = z.object({
  name: z.literal("idea-boost-preview-app"),
  main: z.literal("workers/preview-app-worker.ts"),
  workers_dev: z.literal(false),
  preview_urls: z.literal(true),
  assets: z.object({
    directory: z.literal(".open-next/assets"),
    binding: z.literal("ASSETS"),
    run_worker_first: z.literal(true),
  }),
  previews: z.object({
    vars: z.object({ PREVIEW_ENABLED: z.literal("true") }),
    services: z
      .array(
        z.object({
          binding: z.literal("API_WORKER"),
          service: z.literal("idea-boost-preview-api"),
        }),
      )
      .length(1),
  }),
});
const apiSchema = z.object({
  name: z.literal("idea-boost-preview-api"),
  main: z.literal("preview-worker.ts"),
  workers_dev: z.literal(false),
  preview_urls: z.literal(false),
  vars: z.object({
    PREVIEW_ENABLED: z.literal("true"),
    PREVIEW_API_COMMIT: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  durable_objects: z.object({
    bindings: z
      .array(
        z.object({
          name: z.literal("ROOM_DO"),
          class_name: z.literal("PreviewRoomDO"),
        }),
      )
      .length(1),
  }),
  d1_databases: z
    .array(
      z.object({
        binding: z.literal("DB"),
        database_name: z.literal("idea-boost-preview-lobby"),
        database_id: z.string().uuid(),
        migrations_dir: z.literal("migrations"),
      }),
    )
    .length(1),
});
export function assertPreviewConfig(value: unknown, kind: "app" | "api"): void {
  if (kind === "app") appSchema.parse(value);
  else {
    const config = apiSchema.parse(value);
    const production = unstable_readConfig({
      config: fileURLToPath(new URL("workers/wrangler.jsonc", root)),
    });
    if (
      production.d1_databases.some(
        (db: { database_id?: string }) =>
          db.database_id === config.d1_databases[0].database_id,
      )
    )
      throw new Error("本番D1には接続できません。");
  }
  if (
    typeof value !== "object" ||
    !value ||
    "routes" in value ||
    "route" in value ||
    "build" in value
  )
    throw new Error("Preview構成に公開経路やbuild.commandを追加できません。");
}
export function previewAppConfig() {
  return JSON.parse(
    readFileSync(new URL("wrangler.preview.jsonc", root), "utf8"),
  ) as z.infer<typeof appSchema> & Record<string, unknown>;
}
export function previewApiConfig(databaseId: string, sha: string) {
  const value = JSON.parse(
    readFileSync(new URL("workers/wrangler.preview.jsonc", root), "utf8"),
  );
  value.d1_databases[0].database_id = databaseId;
  value.vars.PREVIEW_API_COMMIT = sha;
  assertPreviewConfig(value, "api");
  return value as z.infer<typeof apiSchema> & Record<string, unknown>;
}
