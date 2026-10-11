// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertPreviewArtifact } from "./preview-bundle.mts";
import { previewMigrationHash } from "./preview-migrations.mts";

const sha = "a".repeat(40);
const d1Sql = "CREATE TABLE example(id TEXT);";
const roomDoSql = "CREATE TABLE room_example(id TEXT);";
const sqlFiles = [
  ["workers/migrations/0001_example.sql", d1Sql],
  ["workers/room-do-migrations/20261011000000-example.sql", roomDoSql],
] as const;
const schemaHash = previewMigrationHash({
  truncated: false,
  tree: sqlFiles.map(([path, sql]) => ({
    path,
    type: "blob",
    mode: "100644",
    sha: execFileSync("git", ["hash-object", "--stdin"], {
      input: sql,
      encoding: "utf8",
    }).trim(),
  })),
});
const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "preview-artifact-test-"));
  paths.push(directory);
  for (const child of [
    ".preview-bundle",
    ".open-next/assets",
    "workers/migrations",
    "workers/room-do-migrations",
  ])
    mkdirSync(resolve(directory, child), { recursive: true });
  const worker =
    "export default { fetch() { return new Response('preview') } };";
  writeFileSync(resolve(directory, ".preview-bundle/worker.js"), worker);
  writeFileSync(
    resolve(directory, ".preview-bundle/manifest.json"),
    JSON.stringify({
      format: 3,
      sha,
      workerSha256: createHash("sha256").update(worker).digest("hex"),
      schemaHash,
    }),
  );
  for (const [path, sql] of sqlFiles)
    writeFileSync(resolve(directory, path), sql);
  return directory;
}
it("PR版を示すmanifestと内容が一致するbundleだけを受け取る", () => {
  const candidate = fixture();
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).not.toThrow();
  expect(() =>
    assertPreviewArtifact(candidate, "b".repeat(40), schemaHash),
  ).toThrow();
  writeFileSync(resolve(candidate, ".preview-bundle/worker.js"), "changed");
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it("旧App-only形式を拒否し、API欠落を共通APIへのfallbackで埋めない", () => {
  const candidate = fixture();
  writeFileSync(
    resolve(candidate, ".preview-bundle/manifest.json"),
    JSON.stringify({ format: 1, sha }),
  );
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it("artifact内の親ディレクトリをsymlinkで差し替えたら拒否する", () => {
  const candidate = fixture();
  const outside = mkdtempSync(resolve(tmpdir(), "preview-artifact-outside-"));
  paths.push(outside);
  mkdirSync(resolve(outside, "assets"));
  rmSync(resolve(candidate, ".open-next"), { recursive: true });
  symlinkSync(outside, resolve(candidate, ".open-next"));
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow(
    "symlink",
  );
});

it.each(
  sqlFiles,
)("artifactのSQLが参照コミットと違う場合は拒否する: %s", (path) => {
  const candidate = fixture();
  writeFileSync(resolve(candidate, path), "SELECT 1;");
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it.each(
  sqlFiles,
)("参照コミットのSQLがartifactから欠けていたら拒否する: %s", (path) => {
  const candidate = fixture();
  rmSync(resolve(candidate, path));
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it("artifactに参照コミット外のSQLを追加したら拒否する", () => {
  const candidate = fixture();
  writeFileSync(
    resolve(candidate, "workers/migrations/0002_extra.sql"),
    "SELECT 1;",
  );
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it("manifestのSQL hashを書き換えても、参照コミットとの不一致を拒否する", () => {
  const candidate = fixture();
  const manifestFile = resolve(candidate, ".preview-bundle/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  manifest.schemaHash = "b".repeat(64);
  writeFileSync(manifestFile, JSON.stringify(manifest));
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow();
});
it("RoomDO SQLの親をsymlinkに差し替えたら拒否する", () => {
  const candidate = fixture();
  const outside = mkdtempSync(resolve(tmpdir(), "preview-sql-outside-"));
  paths.push(outside);
  writeFileSync(resolve(outside, "20261011000000-example.sql"), roomDoSql);
  rmSync(resolve(candidate, "workers/room-do-migrations"), { recursive: true });
  symlinkSync(outside, resolve(candidate, "workers/room-do-migrations"));
  expect(() => assertPreviewArtifact(candidate, sha, schemaHash)).toThrow(
    "symlink",
  );
});
