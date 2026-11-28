import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const hookPath = join(process.cwd(), ".claude/hooks/verify-on-stop.sh");

const tempDirs: string[] = [];

function write(dir: string, file: string) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), "export const value = 1;\n");
}

function createRepo({
  files = [],
  committed = [],
}: {
  files?: string[];
  committed?: string[];
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-on-stop-"));
  tempDirs.push(dir);
  execSync("git init --quiet", { cwd: dir });
  if (committed.length > 0) {
    for (const file of committed) write(dir, file);
    execSync(
      "git add -A && git -c user.name=t -c user.email=t@example.com commit --quiet -m init",
      { cwd: dir },
    );
  }
  for (const file of files) write(dir, file);
  return dir;
}

type HookCommands = {
  typecheck?: string;
  test?: string;
  testFull?: string;
  workers?: string;
};

function runHook({
  projectDir,
  commands = {},
  stopHookActive = false,
}: {
  projectDir: string;
  commands?: HookCommands;
  stopHookActive?: boolean;
}) {
  return spawnSync("bash", [hookPath], {
    cwd: projectDir,
    encoding: "utf8",
    input: JSON.stringify({ stop_hook_active: stopHookActive }),
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      STOP_TYPECHECK_CMD: commands.typecheck ?? "true",
      STOP_TEST_CMD: commands.test ?? "true",
      STOP_TEST_FULL_CMD: commands.testFull ?? "true",
      STOP_WORKERS_TEST_CMD: commands.workers ?? "true",
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("verify-on-stop hook", () => {
  it("skips verification when continuing from a previous stop hook", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({
      projectDir: dir,
      commands: { typecheck: "exit 1" },
      stopHookActive: true,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("skips verification when no TypeScript files changed", () => {
    const dir = createRepo({ files: ["README.md"] });

    const result = runHook({
      projectDir: dir,
      commands: { typecheck: "exit 1", test: "exit 1" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("allows the stop when verification passes", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({ projectDir: dir });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("shows only the type errors when the typecheck fails", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({
      projectDir: dir,
      commands: {
        typecheck:
          "echo '> idea-boost@0.1.0 typecheck'; echo 'wrangler banner'; echo \"example.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.\"; exit 2",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("example.ts(1,14): error TS2322");
    expect(result.stderr).not.toContain("wrangler banner");
    expect(result.stderr).toContain("Typecheck failed");
  });

  it("does not run the tests when the typecheck fails", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({
      projectDir: dir,
      commands: {
        typecheck: "echo 'a.ts(1,1): error TS1: x'; exit 2",
        test: "echo test-ran; exit 1",
      },
    });

    expect(result.stderr).not.toContain("test-ran");
  });

  it("runs only the tests related to the changed TypeScript files", () => {
    const dir = createRepo({
      committed: ["lib/kept.ts"],
      files: ["example.ts", "features/note card.tsx", "README.md"],
    });
    writeFileSync(join(dir, "lib/kept.ts"), "export const value = 2;\n");

    const result = runHook({
      projectDir: dir,
      commands: {
        test: 'for f in "$@"; do echo "file=[$f]"; done; exit 1',
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("file=[example.ts]");
    expect(result.stderr).toContain("file=[features/note card.tsx]");
    expect(result.stderr).toContain("file=[lib/kept.ts]");
    expect(result.stderr).not.toContain("README.md");
    expect(result.stderr).toContain("Tests failed");
  });

  it("runs every test when a test or build setting changed", () => {
    const dir = createRepo({ files: ["example.ts", "vitest.config.mts"] });

    const result = runHook({
      projectDir: dir,
      commands: {
        test: "echo related-ran; exit 1",
        testFull: "echo full-ran; exit 1",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("full-ran");
    expect(result.stderr).not.toContain("related-ran");
  });

  it("checks everything when a TypeScript file was only deleted", () => {
    // 消したファイルを import している所は、関係するテストを辿れない。
    const dir = createRepo({ committed: ["lib/removed.ts"] });
    rmSync(join(dir, "lib/removed.ts"));

    const result = runHook({
      projectDir: dir,
      commands: {
        typecheck: "echo typecheck-ran; exit 1",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("typecheck-ran");
  });

  it("runs every test when a TypeScript file was deleted", () => {
    const dir = createRepo({ committed: ["lib/removed.ts", "lib/kept.ts"] });
    rmSync(join(dir, "lib/removed.ts"));
    writeFileSync(join(dir, "lib/kept.ts"), "export const value = 2;\n");

    const result = runHook({
      projectDir: dir,
      commands: {
        test: "echo related-ran; exit 1",
        testFull: "echo full-ran; exit 1",
      },
    });

    expect(result.stderr).toContain("full-ran");
    expect(result.stderr).not.toContain("related-ran");
  });

  it("keeps the failure output short", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({
      projectDir: dir,
      commands: { test: "seq 1 500; exit 1" },
    });

    const lines = result.stderr.trimEnd().split("\n");
    expect(result.status).toBe(2);
    expect(lines.length).toBeLessThanOrEqual(85);
    expect(lines[0]).toBe("1");
    expect(result.stderr).not.toContain("\n500\n");
    expect(result.stderr).toMatch(/省略/);
  });

  it.each(["workers/room-do.ts", "contracts/api.ts"])(
    "runs the related workers tests when %s changed",
    (file) => {
      const dir = createRepo({ files: [file] });

      const result = runHook({
        projectDir: dir,
        commands: {
          workers: 'echo "workers-boom $*"; exit 1',
        },
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`workers-boom ${file}`);
    },
  );

  it("skips the workers tests when only app-side files changed", () => {
    const dir = createRepo({ files: ["example.ts"] });

    const result = runHook({
      projectDir: dir,
      commands: { workers: "echo workers-boom; exit 1" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
