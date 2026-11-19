// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ciScope } from "./ci-scope.mts";

describe("ciScope: PRの変更ファイルから回す検査を決める", () => {
  it("UI の部品を変えたPRは browser を回し、worker テストは回さない", () => {
    expect(ciScope(["features/room/ui/board.tsx"])).toEqual({
      browser: true,
      workers: false,
    });
  });

  it("文書・スキル・worker だけを変えたPRは browser を回さない", () => {
    expect(
      ciScope([
        "docs/development/testing.md",
        ".agents/skills/write-pr/SKILL.md",
        "workers/api-worker/index.ts",
        "README.md",
      ]),
    ).toEqual({ browser: false, workers: true });
  });

  it("contracts と lib はUIとworkerの両方が読むので両方を回す", () => {
    expect(ciScope(["contracts/room.ts"])).toEqual({
      browser: true,
      workers: true,
    });
    expect(ciScope(["lib/time.ts"])).toEqual({ browser: true, workers: true });
  });

  it("依存とビルド設定の変更は両方を回す", () => {
    expect(ciScope(["package-lock.json"])).toEqual({
      browser: true,
      workers: true,
    });
  });

  it("browser 検査自体の workflow とテストを変えたPRは browser を回す", () => {
    expect(ciScope([".github/workflows/browser.yml"]).browser).toBe(true);
    expect(ciScope(["tests/browser/landing.spec.ts"]).browser).toBe(true);
    expect(ciScope([".github/workflows/deploy.yml"]).browser).toBe(false);
  });

  it("一覧にない場所の変更は安全側に倒して両方を回す", () => {
    expect(ciScope(["unknown/new-area.ts"])).toEqual({
      browser: true,
      workers: true,
    });
  });

  it("変更ファイルが取れないときは安全側に倒して両方を回す", () => {
    expect(ciScope([])).toEqual({ browser: true, workers: true });
  });
});
