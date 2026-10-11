import { createHash } from "node:crypto";
import { z } from "zod";

export const previewSchemaMessagePrefix = "idea-boost-preview-schema:v1:";
export function previewSchemaMessage(hash: string, generation: number): string {
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(hash);
  z.number().int().nonnegative().safe().parse(generation);
  return `${previewSchemaMessagePrefix}${hash}:reopen:${generation}`;
}
export function readPreviewSchemaMessage(message: string): {
  hash: string;
  generation: number;
} {
  const match = new RegExp(
    `^${previewSchemaMessagePrefix}([a-f0-9]{64})(?::reopen:(\\d+))?$`,
  ).exec(message);
  if (!match) throw new Error("Previewのschema記録を確認できません。");
  return {
    hash: match[1],
    generation: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .parse(Number(match[2] ?? 0)),
  };
}
export function previewMigrationHash(value: unknown): string {
  const tree = z
    .object({
      truncated: z.literal(false),
      tree: z.array(
        z.object({
          path: z.string(),
          type: z.string(),
          mode: z.string(),
          sha: z.string().regex(/^[a-f0-9]{40}$/),
        }),
      ),
    })
    .parse(value);
  const entries = tree.tree.filter((entry) =>
    /^workers\/(migrations|room-do-migrations)\/.*\.sql$/.test(entry.path),
  );
  if (
    entries.some(
      (entry) => entry.type !== "blob" || !/^100(644|755)$/.test(entry.mode),
    ) ||
    !entries.some((entry) => entry.path.startsWith("workers/migrations/")) ||
    !entries.some((entry) =>
      entry.path.startsWith("workers/room-do-migrations/"),
    )
  )
    throw new Error("Previewのmigration一覧を確認できません。");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify(entries.map(({ path, sha }) => [path, sha])))
    .digest("hex");
}
