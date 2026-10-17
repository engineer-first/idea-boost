// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkAgentHarness } from "./check-agent-harness.mts";

const roots: string[] = [];

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-harness-"));
  roots.push(root);
  write(root, "AGENTS.md", "# Instructions\n");
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  write(
    root,
    ".agents/skills/example/SKILL.md",
    "---\nname: example\ndescription: Example workflow\ndisable-model-invocation: true\n---\n\n[Guide](references/guide.md#usage)\n",
  );
  write(root, ".agents/skills/example/references/guide.md", "# Guide\n");
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  symlinkSync(
    "../../.agents/skills/example",
    join(root, ".claude/skills/example"),
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("共有スキルの配布検査", () => {
  it("正本・相対symlink・参照が揃い、Claude用frontmatterもある構成を受理する", () => {
    expect(checkAgentHarness(fixture())).toEqual([]);
  });

  it("CLAUDE.mdをコピーへ置き換えると失敗する", () => {
    const root = fixture();
    rmSync(join(root, "CLAUDE.md"));
    write(root, "CLAUDE.md", "# Instructions\n");
    expect(checkAgentHarness(root)).toContainEqual(
      expect.stringContaining("CLAUDE.md"),
    );
  });

  it("Claudeのリンク欠落と古いスキルのリンクを検知する", () => {
    const root = fixture();
    rmSync(join(root, ".claude/skills/example"));
    symlinkSync(
      "../../.agents/skills/deleted",
      join(root, ".claude/skills/deleted"),
    );
    const errors = checkAgentHarness(root);
    expect(errors).toContainEqual(
      expect.stringContaining(".claude/skills/example"),
    );
    expect(errors).toContainEqual(
      expect.stringContaining(".claude/skills/deleted"),
    );
  });

  it("別の実体や個人PCを指す絶対リンクを拒否する", () => {
    const root = fixture();
    rmSync(join(root, ".claude/skills/example"));
    symlinkSync(
      join(root, ".agents/skills/example"),
      join(root, ".claude/skills/example"),
    );
    expect(checkAgentHarness(root)).toContainEqual(
      expect.stringContaining(".claude/skills/example"),
    );
  });

  it.each([
    ".codex/skills",
    ".opencode/skills",
  ])("%sへの重複登録を検知する", (path) => {
    const root = fixture();
    write(root, `${path}/example/SKILL.md`, "duplicate");
    expect(checkAgentHarness(root)).toContainEqual(
      expect.stringContaining(path),
    );
  });

  it.each([
    "---\nname: wrong\ndescription: Example\n---\n",
    "---\nname: example\ndescription: ''\n---\n",
    "---\nname: [\n---\n",
    "# Missing frontmatter\n",
  ])("探索に使えないfrontmatterを検知する: %s", (content) => {
    const root = fixture();
    write(root, ".agents/skills/example/SKILL.md", content);
    expect(checkAgentHarness(root)).toContainEqual(
      expect.stringContaining("example/SKILL.md"),
    );
  });

  it("SKILL.mdと付属文書からのリンク切れを検知する", () => {
    const root = fixture();
    rmSync(join(root, ".agents/skills/example/references/guide.md"));
    write(
      root,
      ".agents/skills/example/references/next.md",
      "[Missing](missing.md)\n",
    );
    const errors = checkAgentHarness(root);
    expect(errors).toContainEqual(
      expect.stringContaining("references/guide.md"),
    );
    expect(errors).toContainEqual(expect.stringContaining("missing.md"));
  });

  it("コード例内のリンク・外部URL・ページ内アンカーをファイルとして検査しない", () => {
    const root = fixture();
    write(
      root,
      ".agents/skills/example/references/guide.md",
      "[Web](https://example.test/a)\n[Section](#usage)\n`[Example](missing.md)`\n\n```md\n[Example](missing.md)\n```\n",
    );
    expect(checkAgentHarness(root)).toEqual([]);
  });

  it("空の正本ディレクトリを正常な配布として扱わない", () => {
    const root = fixture();
    rmSync(join(root, ".agents/skills"), { recursive: true });
    expect(checkAgentHarness(root)).toContainEqual(
      expect.stringContaining(".agents/skills"),
    );
  });
});
