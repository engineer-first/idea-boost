// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

type LockPackage = { version?: string; dependencies?: Record<string, string> };

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const manifest = read<{ devDependencies: Record<string, string> }>(
  "package.json",
);
const lock = read<{ packages: Record<string, LockPackage> }>(
  "package-lock.json",
);

// 直接のMiniflare（preview-smoke用）がWrangler・Vitest pluginの固定する版とずれると、
// lockfileにMiniflareとworkerdが2つずつ残り、古い側の脆弱な推移依存を直せなくなる (#739)。
it("直接のMiniflareはWranglerとVitest pluginが固定する版と同じで、lockfileに1つだけある", () => {
  const direct = manifest.devDependencies.miniflare;
  for (const parent of ["wrangler", "@cloudflare/vitest-plugin"])
    expect(
      lock.packages[`node_modules/${parent}`]?.dependencies?.miniflare,
      parent,
    ).toBe(direct);
  const copies = Object.keys(lock.packages).filter((path) =>
    path.endsWith("node_modules/miniflare"),
  );
  expect(copies).toEqual(["node_modules/miniflare"]);
  expect(lock.packages["node_modules/miniflare"]?.version).toBe(direct);
});
