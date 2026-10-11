// @vitest-environment node
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertPreviewArtifact } from "./preview-bundle.mts";

const sha = "a".repeat(40);
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
  ])
    mkdirSync(resolve(directory, child), { recursive: true });
  const worker =
    "export default { fetch() { return new Response('preview') } };";
  writeFileSync(resolve(directory, ".preview-bundle/worker.js"), worker);
  writeFileSync(
    resolve(directory, ".preview-bundle/manifest.json"),
    JSON.stringify({
      format: 2,
      sha,
      workerSha256: createHash("sha256").update(worker).digest("hex"),
    }),
  );
  writeFileSync(
    resolve(directory, "workers/migrations/0001_example.sql"),
    "CREATE TABLE example(id TEXT);",
  );
  return directory;
}
it("PR版を示すmanifestと内容が一致するbundleだけを受け取る", () => {
  const candidate = fixture();
  expect(() => assertPreviewArtifact(candidate, sha)).not.toThrow();
  expect(() => assertPreviewArtifact(candidate, "b".repeat(40))).toThrow();
  writeFileSync(resolve(candidate, ".preview-bundle/worker.js"), "changed");
  expect(() => assertPreviewArtifact(candidate, sha)).toThrow();
});
it("旧App-only形式を拒否し、API欠落を共通APIへのfallbackで埋めない", () => {
  const candidate = fixture();
  writeFileSync(
    resolve(candidate, ".preview-bundle/manifest.json"),
    JSON.stringify({ format: 1, sha }),
  );
  expect(() => assertPreviewArtifact(candidate, sha)).toThrow();
});
it("artifact内の親ディレクトリをsymlinkで差し替えたら拒否する", () => {
  const candidate = fixture();
  const outside = mkdtempSync(resolve(tmpdir(), "preview-artifact-outside-"));
  paths.push(outside);
  mkdirSync(resolve(outside, "assets"));
  rmSync(resolve(candidate, ".open-next"), { recursive: true });
  symlinkSync(outside, resolve(candidate, ".open-next"));
  expect(() => assertPreviewArtifact(candidate, sha)).toThrow("symlink");
});
