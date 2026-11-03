import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const cli = fileURLToPath(
  new URL("../node_modules/@google/design.md/dist/index.js", import.meta.url),
);
const source = process.argv[2] ?? "DESIGN.md";
const target = process.argv[3] ?? "app/design-tokens.css";

try {
  const generated = execFileSync(
    process.execPath,
    [cli, "export", source, "--format", "css-vars", "--prefix", "ib"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (readFileSync(target, "utf8") !== generated) {
    throw new Error(
      "生成CSSがDESIGN.mdと一致しません。npm run gen:design-tokens を実行してください。",
    );
  }
  console.log("DESIGN.md と生成CSSが一致しています。");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
