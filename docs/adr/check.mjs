import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @param {string} name @param {string} text @returns {string[]} */
export function validateAdr(name, text) {
  const errors = [];
  const id = name.match(/^(\d{4})-[a-z0-9-]+\.md$/)?.[1];
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  const value = (key) =>
    front?.[1].match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];
  if (!id || value("id") !== `"${id}"`)
    errors.push(`${name}: idとファイル名が不一致`);
  if (
    !/^(Proposed|Accepted|Deprecated|Superseded by ADR \d{4})$/.test(
      value("status") ?? "",
    )
  )
    errors.push(`${name}: statusが不正`);
  const date = value("date")?.match(/^"(\d{4}-\d{2}-\d{2})"$/)?.[1];
  if (
    !date ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    errors.push(`${name}: dateが不正`);
  if (!new RegExp(`^# ADR ${id}: .+`, "m").test(text))
    errors.push(`${name}: タイトルが不正`);
  for (const heading of ["Context", "Decision", "Consequences", "References"]) {
    if (text.match(new RegExp(`^## ${heading}$`, "gm"))?.length !== 1)
      errors.push(`${name}: ${heading}が必須（一つだけ）`);
  }
  const decision =
    text.match(/^## Decision\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "";
  if (!/^### 本ADRで決定しないこと$/m.test(decision))
    errors.push(`${name}: Decision末尾の本ADRで決定しないことが必須`);
  const body = text.split(/^## References$/m)[0];
  if (/(?:Issue|PR)?\s*#\d+/.test(body))
    errors.push(`${name}: Issue/PR番号はReferencesに置く`);
  return errors;
}

/** @param {string} directory @returns {string[]} */
export function checkDirectory(directory) {
  const errors = [];
  const names = readdirSync(directory).filter((name) =>
    /^\d{4}-.+\.md$/.test(name),
  );
  const index = readFileSync(resolve(directory, "README.md"), "utf8");
  for (const name of names) {
    const text = readFileSync(resolve(directory, name), "utf8");
    errors.push(...validateAdr(name, text));
    const status = text.match(/^status: (.+)$/m)?.[1];
    const row = index.split("\n").find((line) => line.includes(`](${name})`));
    if (!row || row.split("|").at(-2)?.trim() !== status)
      errors.push(`${name}: 索引の状態が不一致`);
    const successor = status?.match(/^Superseded by ADR (\d{4})$/)?.[1];
    if (successor) {
      const target = names.find((candidate) =>
        candidate.startsWith(`${successor}-`),
      );
      const section = text.match(
        /^## Supersession\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
      )?.[1];
      if (!target || !section?.includes(`](${target})`))
        errors.push(`${name}: Supersessionの後継リンクが不正`);
    }
  }
  for (const name of [...names, "README.md", "template.md"]) {
    const text = readFileSync(resolve(directory, name), "utf8");
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const file = decodeURIComponent(target.split("#")[0]);
      if (!existsSync(resolve(directory, file)))
        errors.push(`${name}: リンク切れ ${target}`);
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const directory = dirname(fileURLToPath(import.meta.url));
  const errors = checkDirectory(directory);
  if (errors.length) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${basename(directory)}: ADRの構造・索引・相対リンクが正常です\n`,
    );
  }
}
