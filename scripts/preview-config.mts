import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { unstable_readConfig } from "wrangler";
import { z } from "zod";

const root = new URL("../", import.meta.url);
const previewBindingsSchema = z.tuple([
  z.object({
    name: z.literal("ROOM_DO"),
    class_name: z.literal("PreviewRoomDO"),
  }),
  z.object({
    name: z.literal("ACCOUNT_DO"),
    class_name: z.literal("PreviewAccountDO"),
  }),
]);
const previewMigrationsSchema = z.tuple([
  z.object({
    tag: z.literal("v1"),
    new_sqlite_classes: z.tuple([z.literal("PreviewRoomDO")]),
  }),
  z.object({
    tag: z.literal("v2"),
    new_sqlite_classes: z.tuple([z.literal("PreviewAccountDO")]),
  }),
]);
const appSchema = z.object({
  name: z.literal("idea-boost-preview-app"),
  main: z.literal(".preview-bundle/worker.js"),
  no_bundle: z.literal(true),
  workers_dev: z.literal(false),
  preview_urls: z.literal(true),
  assets: z.object({
    directory: z.literal(".open-next/assets"),
    binding: z.literal("ASSETS"),
    run_worker_first: z.literal(true),
  }),
  previews: z.object({
    vars: z.object({
      PREVIEW_ENABLED: z.literal("true"),
      PREVIEW_PR_NUMBER: z.string().regex(/^[1-9]\d*$/),
      PREVIEW_API_COMMIT: z.string().regex(/^[a-f0-9]{40}$/),
    }),
    durable_objects: z.object({
      bindings: previewBindingsSchema,
    }),
    d1_databases: z
      .array(
        z.object({
          binding: z.literal("DB"),
          database_name: z
            .string()
            .regex(/^idea-boost-preview-pr-[1-9]\d*-lobby$/),
          database_id: z.string().uuid(),
          migrations_dir: z.literal("workers/migrations"),
        }),
      )
      .length(1),
  }),
  migrations: previewMigrationsSchema,
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
    bindings: previewBindingsSchema,
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
function assertKnownKeys(value: unknown, template: unknown): void {
  if (Array.isArray(value) && Array.isArray(template)) {
    for (const item of value) assertKnownKeys(item, template[0]);
  } else if (
    typeof value === "object" &&
    value !== null &&
    typeof template === "object" &&
    template !== null
  ) {
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(template, key))
        throw new Error(`Preview構成に未許可の項目 ${key} を追加できません。`);
      assertKnownKeys(item, (template as Record<string, unknown>)[key]);
    }
  }
}
export function assertPreviewConfig(value: unknown, kind: "app" | "api"): void {
  // 許可した構成以外のbindingやoverrideをCLIへ渡さない。
  const template = JSON.parse(
    readFileSync(
      new URL(
        kind === "app"
          ? "wrangler.preview.jsonc"
          : "workers/wrangler.preview.jsonc",
        root,
      ),
      "utf8",
    ),
  );
  if (kind === "api") template.vars.PREVIEW_API_COMMIT = "";
  assertKnownKeys(value, template);
  if (kind === "app") {
    const config = appSchema.parse(value);
    if (
      config.previews.d1_databases[0].database_name !==
      previewDatabaseName(Number(config.previews.vars.PREVIEW_PR_NUMBER))
    )
      throw new Error("別PRのD1には接続できません。");
    assertPreviewDatabaseId(config.previews.d1_databases[0].database_id);
  } else {
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
export function previewDatabaseName(number: number): string {
  z.number().int().positive().max(1_000_000_000).parse(number);
  return `idea-boost-preview-pr-${number}-lobby`;
}
export function assertPreviewDatabaseId(databaseId: string): void {
  z.string().uuid().parse(databaseId);
  const production = unstable_readConfig({
    config: fileURLToPath(new URL("workers/wrangler.jsonc", root)),
  });
  if (
    production.d1_databases.some(
      (db: { database_id?: string }) => db.database_id === databaseId,
    )
  )
    throw new Error("本番D1には接続できません。");
}
export type PreviewPrConfigInput = {
  number: number;
  databaseId: string;
  sha: string;
};
export function previewAppConfig(input: PreviewPrConfigInput) {
  const value = JSON.parse(
    readFileSync(new URL("wrangler.preview.jsonc", root), "utf8"),
  );
  value.main = ".preview-bundle/worker.js";
  value.previews.vars.PREVIEW_PR_NUMBER = String(input.number);
  value.previews.vars.PREVIEW_API_COMMIT = input.sha;
  value.previews.d1_databases[0].database_name = previewDatabaseName(
    input.number,
  );
  value.previews.d1_databases[0].database_id = input.databaseId;
  assertPreviewConfig(value, "app");
  return value as z.infer<typeof appSchema> & Record<string, unknown>;
}
export function previewMigrationConfig(input: PreviewPrConfigInput) {
  const config = previewAppConfig(input);
  return {
    name: config.name,
    compatibility_date: "2026-06-01",
    d1_databases: config.previews.d1_databases,
  };
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
