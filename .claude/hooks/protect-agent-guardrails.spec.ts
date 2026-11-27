import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const hookPath = ".claude/hooks/protect-agent-guardrails.sh";

type ToolInput = {
  file_path?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  edits?: Array<{
    old_string?: string;
    new_string?: string;
  }>;
};

function runHook(toolInput: ToolInput) {
  return spawnSync("bash", [hookPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({ tool_input: toolInput }),
  });
}

describe("protect-agent-guardrails hook", () => {
  it("allows payloads without a file path", () => {
    const result = runHook({ content: "anything" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("denies direct CLAUDE.md edits", () => {
    const result = runHook({
      file_path: "/repo/CLAUDE.md",
      content: "new guidance",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Refusing to edit CLAUDE.md directly");
  });

  it("denies edits to .env", () => {
    const result = runHook({
      file_path: "/repo/.env",
      content: "SUPABASE_SECRET_KEY=secret",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Refusing to edit .env");
  });

  it("denies edits to .env.local", () => {
    const result = runHook({
      file_path: "/repo/.env.local",
      new_string: "SUPABASE_SECRET_KEY=changed",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Refusing to edit .env.local");
  });

  it("denies writes to other .env variants", () => {
    const result = runHook({
      file_path: "/repo/.env.production",
      content: "SECRET=value",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Refusing to edit .env.production");
  });

  it("allows edits to .env.example", () => {
    const result = runHook({
      file_path: "/repo/.env.example",
      content: "NEXT_PUBLIC_SUPABASE_URL=",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("allows .env.tpl that holds only 1Password references", () => {
    const result = runHook({
      file_path: "/repo/.env.tpl",
      content:
        "# comment\n\nGOOGLE_CLIENT_ID=op://Automation/idea-boost-GOOGLE_CLIENT_ID/credential\n",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("denies .env.tpl that holds a plain value", () => {
    const result = runHook({
      file_path: "/repo/.env.tpl",
      new_string:
        "GOOGLE_CLIENT_ID=op://Automation/idea-boost-GOOGLE_CLIENT_ID/credential\nGOOGLE_CLIENT_SECRET=raw-secret",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("op://");
  });

  it("denies a plain value in .env.tpl even when followed by many references", () => {
    const result = runHook({
      file_path: "/repo/.env.tpl",
      content: `GOOGLE_CLIENT_SECRET=raw-secret\n${"A=op://Automation/idea-boost-A/credential\n".repeat(2000)}`,
    });

    expect(result.status).toBe(2);
  });

  it("denies .env.tpl references outside the Automation idea-boost items", () => {
    const result = runHook({
      file_path: "/repo/.env.tpl",
      content: "GOOGLE_CLIENT_SECRET=op://GOCSPX-raw-value\n",
    });

    expect(result.status).toBe(2);
  });

  it("denies disabling TypeScript strict mode", () => {
    const result = runHook({
      file_path: "/repo/tsconfig.json",
      new_string: '{ "compilerOptions": { "strict": false } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to disable TypeScript strict mode",
    );
  });

  it("denies removing TypeScript strict mode", () => {
    const result = runHook({
      file_path: "/repo/tsconfig.json",
      old_string: '{ "compilerOptions": { "strict": true } }',
      new_string: '{ "compilerOptions": { "target": "ES2017" } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to remove TypeScript strict mode",
    );
  });

  it("denies writing a full tsconfig without strict mode enabled", () => {
    const result = runHook({
      file_path: "/repo/tsconfig.app.json",
      content: '{ "compilerOptions": { "target": "ES2017" } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to write a tsconfig without TypeScript strict mode",
    );
  });

  it("denies disabling Biome formatter or linter settings", () => {
    const result = runHook({
      file_path: "/repo/biome.json",
      new_string: '{ "formatter": { "enabled": false } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to disable Biome formatter or linter",
    );
  });

  it("denies empty package.json safety scripts", () => {
    const result = runHook({
      file_path: "/repo/package.json",
      new_string: '{ "scripts": { "lint": "" } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to empty the package.json lint script",
    );
  });

  it("denies removing package.json safety scripts", () => {
    const result = runHook({
      file_path: "/repo/package.json",
      old_string:
        '{ "scripts": { "lint": "biome check", "typecheck": "tsc --noEmit" } }',
      new_string: '{ "scripts": { "typecheck": "tsc --noEmit" } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to remove the package.json lint script",
    );
  });

  it("denies full package.json writes missing safety scripts", () => {
    const result = runHook({
      file_path: "/repo/package.json",
      content:
        '{ "scripts": { "lint": "biome check", "typecheck": "tsc --noEmit" } }',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Refusing to write package.json without the test script",
    );
  });

  it("allows package.json edits that preserve lint, typecheck, and test scripts", () => {
    const result = runHook({
      file_path: "/repo/package.json",
      content:
        '{ "scripts": { "lint": "biome check", "typecheck": "tsc --noEmit", "test": "vitest run" } }',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
