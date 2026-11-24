// @vitest-environment node
import { describe, expect, it } from "vitest";
import { riskOf } from "./risk.mts";

describe("riskOf: 変更ファイルからリスク段階を決める（自己申告に頼らない）", () => {
  it("文書・テスト・stories・文言だけなら R0", () => {
    expect(
      riskOf([
        "docs/prd.md",
        "README.md",
        "features/room/ui/board.spec.tsx",
        "features/room/ui/board.stories.tsx",
        "tests/browser/room.spec.ts",
        "messages/ja.json",
      ]),
    ).toBe("R0");
  });

  it("画面・ロジックのコードは R1", () => {
    expect(riskOf(["features/room/ui/board.tsx"])).toBe("R1");
    expect(riskOf(["components/ui/button.tsx", "docs/prd.md"])).toBe("R1");
  });

  it("境界（worker・contracts・セッション・Server Action・Route Handler・認証）は R2", () => {
    for (const f of [
      "workers/room/room-do.ts",
      "workers/migrations/0042_x.sql",
      "contracts/room-protocol.ts",
      "lib/session/cookie.ts",
      "lib/room-client/socket.ts",
      "features/room/logic/actions.ts",
      "features/auth/ui/login.tsx",
      "app/api/rooms/[id]/route.ts",
      "app/auth/callback/route.ts",
      "app/admin/access/page.tsx",
      "features/feedback/actions.ts",
    ]) {
      expect(riskOf([f]), f).toBe("R2");
    }
  });

  it("ループ自身と検査・設定を縛るファイルは R2（ループが自分の規則を緩めてマージしない）", () => {
    for (const f of [
      "docs/loop/prompts/land.md",
      "docs/loop/completion.json",
      "scripts/loop/precheck.mts",
      "scripts/ci-scope.mts",
      "AGENTS.md",
      ".claude/settings.json",
      ".agents/skills/write-pr/SKILL.md",
      ".github/workflows/ci.yml",
      "rules/ast-grep/x.yml",
      "biome.json",
      "tsconfig.json",
      "package.json",
      "renovate.json",
      ".coderabbit.yaml",
    ]) {
      expect(riskOf([f]), f).toBe("R2");
    }
  });

  it("一覧に無い場所は R1 に倒す。変更が無ければ R0", () => {
    expect(riskOf(["something-new/file.ts"])).toBe("R1");
    expect(riskOf([])).toBe("R0");
  });
});
