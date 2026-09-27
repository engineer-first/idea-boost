// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { manageLocalOutcomesToken } from "./shared-outcomes-token.mts";

it("発行は既存リンクを保持し、置換・削除は他の秘密を保持する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-token-"));
  const path = join(directory, ".dev.vars");
  try {
    await writeFile(path, "SESSION_SECRET=keep-me\n");
    const first = await manageLocalOutcomesToken(path, "issue");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await manageLocalOutcomesToken(path, "issue")).toBe(first);
    expect(await manageLocalOutcomesToken(path, "rotate")).not.toBe(first);
    await manageLocalOutcomesToken(path, "revoke");
    expect(await readFile(path, "utf8")).toBe("SESSION_SECRET=keep-me\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
