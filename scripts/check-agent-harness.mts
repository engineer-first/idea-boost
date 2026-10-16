import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

function entries(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : [];
}

function markdownFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return markdownFiles(child);
    return entry.isFile() && entry.name.endsWith(".md") ? [child] : [];
  });
}

/** 共有スキルの配布構造を検査する。実行環境での探索・hook発火は別途確認する。 */
export function checkAgentHarness(root: string): string[] {
  const errors: string[] = [];
  function checkLink(path: string, target: string): void {
    const fullPath = join(root, path);
    try {
      if (
        lstatSync(fullPath).isSymbolicLink() &&
        readlinkSync(fullPath) === target &&
        existsSync(fullPath)
      )
        return;
    } catch {
      // 欠落とリンク切れを同じ修復案内にする。
    }
    errors.push(`${path}: ${target} への相対symlinkが必要です`);
  }

  checkLink("CLAUDE.md", "AGENTS.md");
  const skillsRoot = join(root, ".agents/skills");
  const names = entries(skillsRoot);
  if (names.length === 0) errors.push(".agents/skills: 共有スキルがありません");
  for (const name of names) {
    const skillRoot = join(skillsRoot, name);
    const skillPath = join(skillRoot, "SKILL.md");
    if (!lstatSync(skillRoot).isDirectory()) {
      errors.push(
        `.agents/skills/${name}: 正本は実体のディレクトリにしてください`,
      );
      continue;
    }
    try {
      const text = readFileSync(skillPath, "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      const metadata = frontmatter ? parse(frontmatter[1]) : null;
      if (
        !metadata ||
        metadata.name !== name ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
        typeof metadata.description !== "string" ||
        !metadata.description.trim()
      )
        throw new Error("name と description が必要です");
    } catch {
      errors.push(
        `.agents/skills/${name}/SKILL.md: frontmatterのnameをディレクトリ名と揃え、descriptionを記入してください`,
      );
    }
    checkLink(`.claude/skills/${name}`, `../../.agents/skills/${name}`);

    for (const file of markdownFiles(skillRoot)) {
      // コード例を除き、本文のinline Markdownリンクのファイル存在を検査する。
      // 外部URL・アンカー・reference形式のリンクの解決までは保証しない。
      const prose = readFileSync(file, "utf8")
        .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
        .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "")
        .replace(/`[^`\n]*`/g, "");
      for (const match of prose.matchAll(
        /\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,
      )) {
        const target = match[1].replace(/^<|>$/g, "");
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
        const path = target.split("#")[0];
        if (path && !existsSync(resolve(dirname(file), path))) {
          errors.push(
            `${relative(root, file)}: リンク先 ${target} がありません`,
          );
        }
      }
    }
  }

  for (const name of entries(join(root, ".claude/skills"))) {
    if (!names.includes(name))
      errors.push(`.claude/skills/${name}: 共有の正本がありません`);
  }
  for (const path of [".codex/skills", ".opencode/skills"]) {
    if (entries(join(root, path)).length > 0) {
      errors.push(
        `${path}: 重複登録せず .agents/skills を直接探索させてください`,
      );
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const errors = checkAgentHarness(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const error of errors) console.error(error);
  if (errors.length > 0) process.exitCode = 1;
  else console.log("共有スキルの正本・symlink・frontmatter・文書リンク: OK");
}
