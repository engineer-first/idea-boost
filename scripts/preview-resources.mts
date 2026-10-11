import { z } from "zod";
import { previewDatabaseName } from "./preview-config.mts";

const databaseSchema = z.object({ uuid: z.string().uuid(), name: z.string() });
export type PreviewDatabase = z.infer<typeof databaseSchema>;
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
}) {
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
  return {
    async prepare(number: number): Promise<PreviewDatabase> {
      const existing = await find(number);
      if (existing) return existing;
      const name = previewDatabaseName(number);
      return checked(
        await operation("/d1/database", "POST", name, { name }),
        number,
      );
    },
    async remove(
      number: number,
      stillClosed: () => Promise<boolean>,
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
      if (!(await stillClosed()))
        throw new Error("PRが開き直されたため削除を中止しました。");
      if (existing !== null)
        await operation(
          path,
          "DELETE",
          `idea-boost-preview-app/${name}`,
          undefined,
          true,
        );
      if (!(await stillClosed()))
        throw new Error("PRが開き直されたためD1削除を中止しました。");
      const database = await find(number);
      if (database) {
        if (!(await stillClosed()))
          throw new Error("PRが開き直されたためD1削除を中止しました。");
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
}
