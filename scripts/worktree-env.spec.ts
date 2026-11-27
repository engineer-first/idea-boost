import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// 実プロセスを起動するため、並列負荷が高いときの遅延に余裕を持たせる。
vi.setConfig({ testTimeout: 15000 });

const repoRoot = process.cwd();
const createdDirs: string[] = [];

const ID_REF = "op://Automation/idea-boost-GOOGLE_CLIENT_ID/credential";
const SECRET_REF = "op://Automation/idea-boost-GOOGLE_CLIENT_SECRET/credential";

type Stubs = {
  /** 1Password の参照（op://...）ごとの値。無い参照は op が「項目が無い」で失敗する。 */
  op?: Record<string, string>;
  /** 指定すると op は項目の有無にかかわらずこのエラーで失敗する。 */
  opError?: string;
  /** キーチェーンの service 名ごとの値。 */
  keychain?: Record<string, string>;
  /** false なら PATH に op を置かない。 */
  withOp?: boolean;
  env?: Record<string, string>;
};

function key(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function setup(stubs: Stubs = {}) {
  const dir = mkdtempSync(join(tmpdir(), "worktree-env-spec-"));
  createdDirs.push(dir);
  const project = join(dir, "project");
  mkdirSync(join(project, "scripts"), { recursive: true });
  mkdirSync(join(project, "workers"));
  for (const path of [
    "scripts/worktree-env.sh",
    ".env.example",
    ".env.tpl",
    "workers/.dev.vars.example",
  ])
    copyFileSync(join(repoRoot, path), join(project, path));

  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "op"));
  mkdirSync(join(dir, "keychain"));
  for (const [ref, value] of Object.entries(stubs.op ?? {}))
    writeFileSync(join(dir, "op", key(ref)), value);
  for (const [service, value] of Object.entries(stubs.keychain ?? {}))
    writeFileSync(join(dir, "keychain", key(service)), value);

  const stub = (name: string, body: string) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/bash\n${body}\n`);
    chmodSync(path, 0o755);
  };
  if (stubs.withOp !== false)
    // op inject を真似る: 標準入力の各行の op://... を値に置き換える
    stub(
      "op",
      `printf '%s|%s\\n' "\${OP_SERVICE_ACCOUNT_TOKEN:-}" "$*" >> "${dir}/op.log"
[ "$1" = inject ] || exit 9
${stubs.opError ? `echo "${stubs.opError}" >&2; exit 1` : ""}
while IFS= read -r line; do
  ref="\${line#*=}"
  case "$ref" in op://*) ;; *) printf '%s\\n' "$line"; continue;; esac
  f="${dir}/op/$(printf '%s' "$ref" | tr -c 'A-Za-z0-9_-' '_')"
  [ -f "$f" ] || { echo "[ERROR] could not resolve item UUID for item x: could not find item x in vault y" >&2; exit 1; }
  printf '%s=%s\\n' "\${line%%=*}" "$(cat "$f")"
done`,
    );
  stub(
    "security",
    `service=""; want=0
while [ $# -gt 0 ]; do case "$1" in -s) service="$2"; shift;; -w) want=1;; esac; shift; done
f="${dir}/keychain/$(printf '%s' "$service" | tr -c 'A-Za-z0-9_-' '_')"
[ -f "$f" ] || { echo "security: The specified item could not be found in the keychain." >&2; exit 44; }
[ "$want" = 1 ] && { cat "$f"; echo; }
exit 0`,
  );

  const run = () =>
    spawnSync("bash", [join(project, "scripts/worktree-env.sh")], {
      cwd: project,
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, ...stubs.env },
    });
  const read = (path: string) => {
    const full = join(project, path);
    return existsSync(full) ? readFileSync(full, "utf8") : "";
  };
  const value = (path: string, name: string) =>
    read(path)
      .split("\n")
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const opLog = () =>
    existsSync(join(dir, "op.log"))
      ? readFileSync(join(dir, "op.log"), "utf8")
      : "";
  return { run, read, value, opLog, project };
}

afterEach(() => {
  for (const dir of createdDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("scripts/worktree-env.sh", () => {
  it(".env.tpl は op:// の参照だけを持ち、値を含まない", () => {
    const lines = readFileSync(join(repoRoot, ".env.tpl"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines)
      expect(line).toMatch(
        /^[A-Z][A-Z0-9_]*=op:\/\/Automation\/idea-boost-[A-Z][A-Z0-9_]*\/credential$/,
      );
  });

  it("1Password が使えなければ op を呼ばず、今までどおり example から作る", () => {
    const { run, read, value, opLog } = setup();

    const result = run();

    expect(result.status).toBe(0);
    expect(opLog()).toBe("");
    expect(result.stdout).toContain("1Password を使わずに作ります");
    const secret = value(".env.local", "SESSION_SECRET");
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(value("workers/.dev.vars", "SESSION_SECRET")).toBe(secret);
    expect(value(".env.local", "GOOGLE_CLIENT_SECRET")).toBe("");
    expect(read(".env.local")).toContain("NEXT_PUBLIC_ENABLE_DEV_AUTH=true");
  });

  it("op が無ければトークンがあっても今までどおり作る", () => {
    const { run, value } = setup({
      withOp: false,
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run();

    expect(result.status).toBe(0);
    expect(value(".env.local", "GOOGLE_CLIENT_ID")).toBe("");
  });

  it("サービスアカウントで .env.tpl の参照を op inject で埋め、値を表示しない", () => {
    const { run, value, opLog } = setup({
      op: { [ID_REF]: "client-id-value", [SECRET_REF]: "client-secret-value" },
      keychain: { "op-service-account-token": "sa-from-keychain" },
    });

    const result = run();

    expect(result.status).toBe(0);
    expect(opLog()).toContain("sa-from-keychain|inject");
    expect(value(".env.local", "GOOGLE_CLIENT_ID")).toBe("client-id-value");
    expect(value(".env.local", "GOOGLE_CLIENT_SECRET")).toBe(
      "client-secret-value",
    );
    expect(value(".env.local", "SESSION_SECRET")).toBe(
      value("workers/.dev.vars", "SESSION_SECRET"),
    );
    expect(result.stdout + result.stderr).not.toContain("client-secret-value");
    expect(result.stdout + result.stderr).not.toContain("client-id-value");
  });

  it("1Password に無い項目は空のままにし、置いてほしい項目名を案内する", () => {
    const { run, value } = setup({
      op: { [ID_REF]: "client-id-value" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run();

    expect(result.status).toBe(0);
    expect(value(".env.local", "GOOGLE_CLIENT_ID")).toBe("client-id-value");
    expect(value(".env.local", "GOOGLE_CLIENT_SECRET")).toBe("");
    expect(result.stderr).toContain("idea-boost-GOOGLE_CLIENT_SECRET");
  });

  it("環境変数のトークンをキーチェーンより先に使う", () => {
    const { run, opLog } = setup({
      op: { [ID_REF]: "i", [SECRET_REF]: "s" },
      keychain: { "op-service-account-token": "sa-from-keychain" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa-from-env" },
    });

    run();

    expect(opLog()).toContain("sa-from-env|inject");
    expect(opLog()).not.toContain("sa-from-keychain");
  });

  it("1Password の値が空なら空のままにし、空であることを案内する", () => {
    const { run, value } = setup({
      op: { [ID_REF]: "", [SECRET_REF]: "s" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run();

    expect(result.status).toBe(0);
    expect(value(".env.local", "GOOGLE_CLIENT_ID")).toBe("");
    expect(result.stderr).toContain("credential が空");
  });

  it("1Password を読めなくても setup を止めず、空のまま作る", () => {
    const { run, value } = setup({
      opError: "[ERROR] error initializing client: failed to parseToken",
      env: { OP_SERVICE_ACCOUNT_TOKEN: "expired" },
    });

    const result = run();

    expect(result.status).toBe(0);
    expect(value(".env.local", "GOOGLE_CLIENT_SECRET")).toBe("");
    expect(result.stderr).toContain("failed to parseToken");
  });

  it("作った環境ファイルは本人だけが読める", () => {
    const { run, project } = setup();

    run();

    const mode = (path: string) => statSync(join(project, path)).mode & 0o777;
    expect(mode(".env.local")).toBe(0o600);
    expect(mode("workers/.dev.vars")).toBe(0o600);
  });

  it("両方あれば作り直さない", () => {
    const { run, read, project } = setup({
      op: { [ID_REF]: "client-id-value", [SECRET_REF]: "s" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });
    const kept = `SESSION_SECRET=${"a".repeat(64)}\nGOOGLE_CLIENT_ID=hand-written\n`;
    writeFileSync(join(project, ".env.local"), kept);
    writeFileSync(
      join(project, "workers/.dev.vars"),
      `SESSION_SECRET=${"a".repeat(64)}\n`,
    );

    const result = run();

    expect(result.status).toBe(0);
    expect(read(".env.local")).toBe(kept);
  });

  it("片方だけあれば止まる", () => {
    const { run, project } = setup();
    writeFileSync(
      join(project, ".env.local"),
      `SESSION_SECRET=${"a".repeat(64)}\n`,
    );

    const result = run();

    expect(result.status).toBe(1);
  });
});
