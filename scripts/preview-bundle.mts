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

const manifestSchema = z.object({
  format: z.literal(2),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  workerSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function assertPreviewArtifact(candidate: string, sha: string): void {
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
  ])
    regular(resolve(candidate, dir));
  const manifest = manifestSchema.parse(
    JSON.parse(
      readFileSync(resolve(candidate, ".preview-bundle/manifest.json"), "utf8"),
    ),
  );
  const worker = readFileSync(resolve(candidate, ".preview-bundle/worker.js"));
  if (manifest.sha !== sha || manifest.workerSha256 !== hash(worker))
    throw new Error("PR版App/API artifactの版または内容が一致しません。");
  for (const entry of readdirSync(resolve(candidate, "workers/migrations")))
    if (
      !/^[a-zA-Z0-9_-]+\.sql$/.test(entry) ||
      !lstatSync(resolve(candidate, "workers/migrations", entry)).isFile()
    )
      throw new Error("D1 migrationのファイル名が不正です。");
}
export async function buildPreviewBundle(
  root: string,
  sha: string,
): Promise<void> {
  manifestSchema.shape.sha.parse(sha);
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
  const worker = readFileSync(resolve(directory, "worker.js"));
  writeFileSync(
    resolve(directory, "manifest.json"),
    JSON.stringify({ format: 2, sha, workerSha256: hash(worker) }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildPreviewBundle(process.cwd(), process.env.PREVIEW_APP_SHA ?? "");
