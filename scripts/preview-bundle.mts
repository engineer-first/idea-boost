import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  collectMigrations,
  renderIndexFile,
} from "./generate-room-do-migrations.mjs";
import { previewMigrationHash } from "./preview-migrations.mts";

const manifestSchema = z.object({
  format: z.literal(3),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  workerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const migrationDirectories = [
  "workers/migrations",
  "workers/room-do-migrations",
] as const;

function migrationHash(root: string, artifact: boolean): string {
  const tree = migrationDirectories.flatMap((directory) => {
    const path = resolve(root, directory);
    const parent = lstatSync(path);
    if (parent.isSymbolicLink())
      throw new Error("Previewのmigrationにsymlinkは使えません。");
    if (!parent.isDirectory())
      throw new Error("Previewのmigrationディレクトリが不正です。");
    return readdirSync(path).flatMap((entry) => {
      if (
        !artifact &&
        directory === "workers/room-do-migrations" &&
        entry === "index.ts"
      )
        return [];
      const file = resolve(path, entry);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink())
        throw new Error("Previewのmigrationにsymlinkは使えません。");
      const validName =
        directory === "workers/migrations"
          ? /^[a-zA-Z0-9_-]+\.sql$/.test(entry)
          : /^\d{14}-[a-z0-9-]+\.sql$/.test(entry);
      if (!validName || !stat.isFile())
        throw new Error("Previewのmigrationファイルが不正です。");
      const sql = readFileSync(file);
      // GitHub treeのblob SHAと、公開runnerが読む実ファイルの内容を照合する。
      const blobSha = createHash("sha1")
        .update(`blob ${sql.byteLength}\0`)
        .update(sql)
        .digest("hex");
      return [
        {
          path: `${directory}/${entry}`,
          type: "blob",
          mode: "100644",
          sha: blobSha,
        },
      ];
    });
  });
  return previewMigrationHash({ truncated: false, tree });
}

export function previewArtifactMigrationHash(candidate: string): string {
  return migrationHash(candidate, true);
}

function checkedBuildSchema(root: string, sha: string): string {
  manifestSchema.shape.sha.parse(sha);
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  if (git(["rev-parse", "HEAD"]) !== sha)
    throw new Error(
      "Previewのbuildは指定したPR headコミットから実行してください。",
    );
  const sourcePaths = [
    "app",
    "components",
    "contracts",
    "features",
    "lib",
    "workers",
    "scripts",
    "public",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "open-next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "wrangler.preview.jsonc",
    ":(exclude)**/*.spec.ts",
    ":(exclude)**/*.spec.tsx",
    ":(exclude)**/*.test.ts",
    ":(exclude)**/*.test.tsx",
    ":(exclude)**/*.stories.tsx",
  ];
  if (
    git([
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...sourcePaths,
    ])
  )
    throw new Error("Previewのソースがheadコミットから変更されています。");
  const tree = git(["ls-tree", "-r", "-z", sha, "--", ...migrationDirectories])
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(entry);
      if (!match) throw new Error("PR headのmigration一覧を確認できません。");
      return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
    });
  const schemaHash = migrationHash(root, false);
  if (schemaHash !== previewMigrationHash({ truncated: false, tree }))
    throw new Error("PreviewのSQLがheadコミットと一致しません。");
  const roomDoDirectory = resolve(root, "workers/room-do-migrations");
  const generated = renderIndexFile(
    collectMigrations({ readdirSync, readFileSync }, roomDoDirectory),
  );
  if (readFileSync(resolve(roomDoDirectory, "index.ts"), "utf8") !== generated)
    throw new Error(
      "RoomDOの同梱SQLがheadのSQLと一致しません。再生成してください。",
    );
  return schemaHash;
}

export function assertPreviewBuildSource(root: string, sha: string): void {
  checkedBuildSchema(root, sha);
}

export function assertPreviewArtifact(
  candidate: string,
  sha: string,
  expectedSchemaHash: string,
): void {
  manifestSchema.shape.schemaHash.parse(expectedSchemaHash);
  let size = 0;
  let count = 0;
  function regular(path: string): void {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      throw new Error("Preview artifactにsymlinkは使えません。");
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) regular(resolve(path, entry));
    } else if (stat.isFile()) {
      size += stat.size;
      count++;
    } else throw new Error("Preview artifactは通常ファイルだけを使います。");
    if (size > 150_000_000 || count > 20_000)
      throw new Error("Preview artifactが上限を超えています。");
  }
  for (const parent of ["", ".open-next", "workers"]) {
    const stat = lstatSync(resolve(candidate, parent));
    if (stat.isSymbolicLink())
      throw new Error("Preview artifactにsymlinkは使えません。");
    if (!stat.isDirectory())
      throw new Error("Preview artifactのディレクトリが不正です。");
  }
  for (const dir of [
    ".preview-bundle",
    ".open-next/assets",
    "workers/migrations",
    "workers/room-do-migrations",
  ])
    regular(resolve(candidate, dir));
  const manifest = manifestSchema.parse(
    JSON.parse(
      readFileSync(resolve(candidate, ".preview-bundle/manifest.json"), "utf8"),
    ),
  );
  const worker = readFileSync(resolve(candidate, ".preview-bundle/worker.js"));
  if (
    manifest.sha !== sha ||
    manifest.workerSha256 !== hash(worker) ||
    manifest.schemaHash !== expectedSchemaHash ||
    previewArtifactMigrationHash(candidate) !== expectedSchemaHash
  )
    throw new Error("PR版App/API artifactの版または内容が一致しません。");
}
export async function buildPreviewBundle(
  root: string,
  sha: string,
): Promise<void> {
  const schemaHash = checkedBuildSchema(root, sha);
  const directory = resolve(root, ".preview-bundle");
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  // Wranglerの公式Node互換処理で、SecretなしCI内でAppとAPIをbundleする。
  // 公開runnerはこの生成物を実行・再bundleしない。
  const config = JSON.parse(
    readFileSync(resolve(root, "wrangler.preview.jsonc"), "utf8"),
  );
  config.no_bundle = false;
  delete config.previews;
  delete config.build;
  const file = resolve(root, "wrangler.preview-build.generated.jsonc");
  writeFileSync(file, JSON.stringify(config));
  try {
    execFileSync(
      process.execPath,
      [
        resolve(root, "node_modules/wrangler/bin/wrangler.js"),
        "deploy",
        "--dry-run",
        "--config",
        file,
        "--outdir",
        directory,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: "",
          CLOUDFLARE_ACCOUNT_ID: "",
          WRANGLER_SEND_METRICS: "false",
        },
        stdio: "inherit",
      },
    );
    renameSync(
      resolve(directory, "preview-app-worker.js"),
      resolve(directory, "worker.js"),
    );
  } finally {
    rmSync(file, { force: true });
  }
  if (checkedBuildSchema(root, sha) !== schemaHash)
    throw new Error("Previewのbundle生成中にSQLが変更されました。");
  const worker = readFileSync(resolve(directory, "worker.js"));
  writeFileSync(
    resolve(directory, "manifest.json"),
    JSON.stringify({ format: 3, sha, workerSha256: hash(worker), schemaHash }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "check-source")
    assertPreviewBuildSource(process.cwd(), process.env.PREVIEW_APP_SHA ?? "");
  else
    await buildPreviewBundle(process.cwd(), process.env.PREVIEW_APP_SHA ?? "");
}
