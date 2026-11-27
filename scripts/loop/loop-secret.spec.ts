import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// 実プロセスを起動するため、並列負荷が高いときの遅延に余裕を持たせる。
vi.setConfig({ testTimeout: 15000 });

const scriptPath = join(process.cwd(), "scripts/loop/loop-secret.sh");
const createdDirs: string[] = [];

type Stubs = {
  /** 1Password の参照（op://...）ごとの値。無い参照は op が失敗する。 */
  op?: Record<string, string>;
  /** キーチェーンの service 名ごとの値。 */
  keychain?: Record<string, string>;
  env?: Record<string, string>;
};

function key(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function setup(stubs: Stubs) {
  const dir = mkdtempSync(join(tmpdir(), "loop-secret-spec-"));
  createdDirs.push(dir);
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
  stub(
    "op",
    `printf '%s|%s\\n' "\${OP_SERVICE_ACCOUNT_TOKEN:-}" "$*" >> "${dir}/op.log"
ref=""
for a in "$@"; do case "$a" in op://*) ref="$a";; esac; done
f="${dir}/op/$(printf '%s' "$ref" | tr -c 'A-Za-z0-9_-' '_')"
[ -f "$f" ] || { echo "[ERROR] item not found" >&2; exit 1; }
cat "$f"`,
  );
  stub(
    "security",
    `service=""; want=0
while [ $# -gt 0 ]; do case "$1" in -s) service="$2"; shift;; -w) want=1;; esac; shift; done
f="${dir}/keychain/$(printf '%s' "$service" | tr -c 'A-Za-z0-9_-' '_')"
[ -f "$f" ] || { echo "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain." >&2; exit 44; }
[ "$want" = 1 ] && { cat "$f"; echo; }
exit 0`,
  );
  stub(
    "gh",
    `printf '%s\\n' "$*" >> "${dir}/gh.log"
cat > "${dir}/gh.stdin"`,
  );

  const run = (...args: string[]) =>
    spawnSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: dir,
        ...stubs.env,
      },
    });
  const read = (name: string) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  return { run, read };
}

afterEach(() => {
  for (const dir of createdDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const REF = "op://Automation/idea-boost-CLOUDFLARE_API_TOKEN_LOOP/credential";

describe("scripts/loop/loop-secret.sh", () => {
  it("read は 1Password の Automation 保管庫の値を返す", () => {
    const { run } = setup({
      op: { [REF]: "from-1password" },
      keychain: { "idea-boost/CLOUDFLARE_API_TOKEN_LOOP": "from-keychain" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run("read", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("from-1password");
  });

  it("サービスアカウントのトークンが環境に無ければキーチェーンから渡す", () => {
    const { run, read } = setup({
      op: { [REF]: "from-1password" },
      keychain: { "op-service-account-token": "sa-from-keychain" },
    });

    const result = run("read", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(0);
    expect(read("op.log")).toContain(
      `sa-from-keychain|read --no-newline ${REF}`,
    );
  });

  it("1Password に無ければ移行期間の予備としてキーチェーンを読む", () => {
    const { run } = setup({
      keychain: { "idea-boost/CLOUDFLARE_API_TOKEN_LOOP": "from-keychain" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run("read", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("from-keychain");
  });

  it("どこにも無ければ値を出さずに失敗し、置き場所を案内する", () => {
    const { run } = setup({ env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" } });

    const result = run("read", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("idea-boost-CLOUDFLARE_API_TOKEN_LOOP");
    expect(result.stderr).toContain("needs-human");
  });

  it("check は置き場所だけを示し、値を出さない", () => {
    const { run } = setup({
      op: { [REF]: "from-1password" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run("check", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1password\n");
    expect(result.stdout + result.stderr).not.toContain("from-1password");
  });

  it("gh-secret は値を標準入力で gh secret set に渡し、表示しない", () => {
    const { run, read } = setup({
      op: { [REF]: "from-1password" },
      env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" },
    });

    const result = run("gh-secret", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(0);
    expect(read("gh.log")).toBe("secret set CLOUDFLARE_API_TOKEN_LOOP\n");
    expect(read("gh.stdin")).toBe("from-1password");
    expect(result.stdout + result.stderr).not.toContain("from-1password");
  });

  it("gh-secret は値が無ければ gh を呼ばない", () => {
    const { run, read } = setup({ env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" } });

    const result = run("gh-secret", "CLOUDFLARE_API_TOKEN_LOOP");

    expect(result.status).toBe(3);
    expect(read("gh.log")).toBe("");
  });

  it("secret 名の形でない名前を拒む", () => {
    const { run, read } = setup({ env: { OP_SERVICE_ACCOUNT_TOKEN: "sa" } });

    const result = run("read", "../Private/item");

    expect(result.status).toBe(2);
    expect(read("op.log")).toBe("");
  });
});
