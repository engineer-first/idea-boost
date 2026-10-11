import { z } from "zod";
import { previewDatabaseName } from "./preview-config.mts";
import { previewSchemaMessagePrefix } from "./preview-migrations.mts";

const databaseSchema = z.object({ uuid: z.string().uuid(), name: z.string() });
export type PreviewDatabase = z.infer<typeof databaseSchema>;
export type PreviewSchemaPolicy = {
  hash: string;
  legacyHash: (commit: string) => Promise<string>;
  stillCurrent: () => Promise<boolean>;
};
export type PreviewResourceManager = {
  prepare: (
    number: number,
    schema: PreviewSchemaPolicy,
  ) => Promise<PreviewDatabase>;
  remove: (number: number, stillValid: () => Promise<boolean>) => Promise<void>;
};
export type PreviewResourceAudit = {
  time: string;
  operation: string;
  target: string;
  state: "started" | "succeeded" | "missing" | "failed";
};
export function createPreviewResources(options: {
  accountId: string;
  token: string;
  protectedDatabaseIds: readonly string[];
  fetcher?: typeof fetch;
  audit?: (entry: PreviewResourceAudit) => void;
}): PreviewResourceManager {
  if (!options.accountId || !options.token)
    throw new Error("Cloudflare設定が必要です。");
  const fetcher = options.fetcher ?? fetch;
  const audit =
    options.audit ?? ((entry) => console.log(JSON.stringify(entry)));
  function checked(database: unknown, number: number): PreviewDatabase {
    const value = databaseSchema.parse(database);
    if (
      value.name !== previewDatabaseName(number) ||
      options.protectedDatabaseIds.includes(value.uuid)
    )
      throw new Error("対象PR以外のD1には操作できません。");
    return value;
  }
  async function operation(
    path: string,
    method: string,
    target: string,
    body?: unknown,
    missingOk = false,
  ): Promise<unknown | null> {
    const log = (state: PreviewResourceAudit["state"]) =>
      audit({
        time: new Date().toISOString(),
        operation: method,
        target,
        state,
      });
    log("started");
    try {
      const response = await fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (missingOk && response.status === 404) {
        log("missing");
        return null;
      }
      const result = z.object({
        success: z.literal(true),
        result: z.unknown(),
      });
      if (!response.ok) throw new Error("Cloudflare操作失敗");
      const parsed = result.parse(await response.json());
      log("succeeded");
      return parsed.result;
    } catch {
      log("failed");
      throw new Error(
        "CloudflareのPreviewリソース操作に失敗しました。秘密を含む応答本文は記録しません。",
      );
    }
  }
  async function find(number: number): Promise<PreviewDatabase | undefined> {
    const name = previewDatabaseName(number);
    const result = await operation(
      `/d1/database?name=${encodeURIComponent(name)}&per_page=100`,
      "GET",
      name,
    );
    const matches = z
      .array(databaseSchema)
      .parse(result)
      .filter((db) => db.name === name);
    if (matches.length > 1) throw new Error("PR専用D1を一意に確認できません。");
    return matches[0] ? checked(matches[0], number) : undefined;
  }
  const manager: PreviewResourceManager = {
    async prepare(number, schema) {
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(schema.hash);
      let existing = await find(number);
      const latest = await operation(
        `/workers/workers/idea-boost-preview-app/previews/pr-${number}/deployments/latest`,
        "GET",
        `idea-boost-preview-app/pr-${number}/schema`,
        undefined,
        true,
      );
      let previousHash: string | undefined;
      if (latest !== null) {
        const annotations = z
          .object({ annotations: z.record(z.string(), z.unknown()) })
          .parse(latest).annotations;
        const message = annotations["workers/message"];
        if (
          typeof message === "string" &&
          message.startsWith(previewSchemaMessagePrefix)
        ) {
          previousHash = z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(message.slice(previewSchemaMessagePrefix.length));
        } else {
          const commit = z
            .string()
            .regex(/^[a-f0-9]{40}$/)
            .parse(annotations["workers/tag"]);
          previousHash = z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(await schema.legacyHash(commit));
        }
      }
      const reset =
        (latest !== null || existing !== undefined) &&
        (!existing || !previousHash || previousHash !== schema.hash);
      if (!(await schema.stillCurrent()))
        throw new Error("PRの状態または版が変わったため公開を中止しました。");
      if (reset) {
        audit({
          time: new Date().toISOString(),
          operation: "schema reset",
          target: `pr-${number}`,
          state: "started",
        });
        await manager.remove(number, schema.stillCurrent);
        existing = undefined;
      }
      if (existing) {
        audit({
          time: new Date().toISOString(),
          operation: "schema reuse",
          target: `pr-${number}`,
          state: "succeeded",
        });
        return existing;
      }
      if (!(await schema.stillCurrent()))
        throw new Error("PRの状態または版が変わったためD1作成を中止しました。");
      const name = previewDatabaseName(number);
      const created = checked(
        await operation("/d1/database", "POST", name, { name }),
        number,
      );
      if (reset)
        audit({
          time: new Date().toISOString(),
          operation: "schema reset",
          target: `pr-${number}`,
          state: "succeeded",
        });
      return created;
    },
    async remove(
      number: number,
      stillValid: () => Promise<boolean>,
    ): Promise<void> {
      const name = `pr-${number}`;
      previewDatabaseName(number);
      const path = `/workers/workers/idea-boost-preview-app/previews/${name}`;
      const existing = await operation(
        path,
        "GET",
        `idea-boost-preview-app/${name}`,
        undefined,
        true,
      );
      if (!(await stillValid()))
        throw new Error("PRの状態または版が変わったため削除を中止しました。");
      if (existing !== null)
        await operation(
          path,
          "DELETE",
          `idea-boost-preview-app/${name}`,
          undefined,
          true,
        );
      if (!(await stillValid()))
        throw new Error("PRの状態または版が変わったためD1削除を中止しました。");
      const database = await find(number);
      if (database) {
        if (!(await stillValid()))
          throw new Error(
            "PRの状態または版が変わったためD1削除を中止しました。",
          );
        await operation(
          `/d1/database/${database.uuid}`,
          "DELETE",
          database.name,
          undefined,
          true,
        );
      }
    },
  };
  return manager;
}
