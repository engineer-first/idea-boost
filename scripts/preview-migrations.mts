import { createHash } from "node:crypto";
import { z } from "zod";

export const previewSchemaMessagePrefix = "idea-boost-preview-schema:v1:";
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
