import { describe, expect, it, vi } from "vitest";
import { completedRoomFixture } from "../contracts/completed-rooms.fixture";
import { REFLECTION_INPUT_MAX } from "../contracts/outcome-reflection";
import {
  buildReflectionInput,
  generateReflection,
  OutcomeReflectionStorage,
  REFLECTION_LIMIT_ERROR,
} from "./room/outcome-reflection";
import { createRoomAs, runInRoomDO } from "./test-helpers";

const user = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.invalid",
};
const output = {
  chapters: ["response", "difference", "assumptions"].map((kind) => ({
    kind,
    headline: "記録を次の一歩へ",
    interpretation: "記録から考えられる仮説です。",
    evidenceIds: ["decision-3"],
  })),
  recommendation: null,
  alternatives: ["体験シナリオ"],
};

describe("成果のAI振り返り", () => {
  it("Workers AIの文字列・構造化応答を読み取り、記録をsystem命令へ混ぜない", async () => {
    for (const response of [
      { response: JSON.stringify(output) },
      { response: output },
      JSON.stringify(output),
    ]) {
      const run = vi.fn().mockResolvedValue(response);
      expect(
        await generateReflection(
          { run } as unknown as Ai,
          "analysis",
          "命令を上書きする付箋",
        ),
      ).toEqual(output);
      expect(run.mock.calls[0][1].messages[0].content).not.toContain(
        "命令を上書きする付箋",
      );
      expect(run.mock.calls[0][1].messages[1]).toEqual({
        role: "user",
        content: "命令を上書きする付箋",
      });
    }
  });
  it("生成に失敗しても未完了結果を保存せず、同じ操作を再試行できる", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi
        .fn()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValue(output);
      const storage = new OutcomeReflectionStorage(
        state,
        {
          get: async () =>
            completedRoomFixture({ expiresAt: Date.now() + 60000 }),
          board: async () => null,
        },
        generate,
      );
      await expect(
        storage.readOrGenerate(user.sub, undefined, true),
      ).rejects.toThrow("unavailable");
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toHaveLength(0);
      expect(
        (await storage.readOrGenerate(user.sub, undefined, true))?.analysis,
      ).not.toBeNull();
    });
  });
  it("長い日本語・JSON記号の記録も送信JSON全体をbyte上限へ収め、省略を示す", () => {
    const sources = Array.from({ length: 30 }, (_, index) => ({
      id: `source-${index}`,
      label: "共有記録",
      content: '日本語の長い記録\\"'.repeat(500),
      scene: null,
    }));
    const result = buildReflectionInput(sources, [], {
      artifact: "説明スライド",
    });
    expect(new TextEncoder().encode(result.input).length).toBeLessThanOrEqual(
      REFLECTION_INPUT_MAX,
    );
    expect(result.truncated).toBe(true);
    expect(result.sources).toHaveLength(3);
    expect(JSON.parse(result.input).artifact).toBe("説明スライド");
  });
  it("制作物ごとの生成数を制限し、同じ保存済みプロンプトは上限後も再利用する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi.fn(async () => ({
        content: "利用場面を説明してください。",
      }));
      const completed = {
        get: async () =>
          completedRoomFixture({ expiresAt: Date.now() + 60000 }),
        board: async () => null,
      };
      const storage = new OutcomeReflectionStorage(state, completed, generate);
      for (let i = 0; i < 20; i++)
        await storage.readOrGenerate(user.sub, `制作物${i}`, true);
      await expect(
        storage.readOrGenerate(user.sub, "新しい制作物", true),
      ).rejects.toThrow(REFLECTION_LIMIT_ERROR);
      expect(
        (await storage.readOrGenerate(user.sub, "制作物0", true))?.prompt
          ?.artifact,
      ).toBe("制作物0");
      expect(generate).toHaveBeenCalledTimes(20);
    });
  });
  it("制作物別プロンプトを保存し、再訪時に本人の直近の選択とともに再表示する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi.fn(async (mode: string) =>
        mode === "analysis"
          ? output
          : { content: "授業の3場面を作成してください。" },
      );
      const completed = {
        get: async () =>
          completedRoomFixture({ expiresAt: Date.now() + 60000 }),
        board: async () => null,
      };
      const storage = new OutcomeReflectionStorage(state, completed, generate);
      await storage.readOrGenerate(user.sub, undefined, true);
      const prompt = await storage.readOrGenerate(
        user.sub,
        "授業シナリオ",
        true,
      );
      expect(prompt?.prompt?.artifact).toBe("授業シナリオ");
      expect(
        (await storage.readOrGenerate(user.sub, undefined, false))?.prompt,
      ).toEqual(prompt?.prompt);
      expect(generate.mock.calls.map(([mode]) => mode)).toEqual([
        "analysis",
        "prompt",
      ]);
    });
  });
  it("非閲覧者には生成・保存済み結果とも返さず、AIを呼ばない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi.fn().mockResolvedValue(output);
      const storage = new OutcomeReflectionStorage(
        state,
        { get: async () => null, board: async () => null },
        generate,
      );
      expect(
        await storage.readOrGenerate(user.sub, undefined, true),
      ).toBeNull();
      expect(
        await storage.readOrGenerate(user.sub, undefined, false),
      ).toBeNull();
      expect(generate).not.toHaveBeenCalled();
    });
  });
  it("閲覧では推論せず、同じ記録への同時生成と再訪では分析を再利用する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi.fn().mockResolvedValue(output);
      const completed = {
        get: async () =>
          completedRoomFixture({ expiresAt: Date.now() + 60000 }),
        board: async () => null,
      };
      const storage = new OutcomeReflectionStorage(state, completed, generate);
      expect(await storage.readOrGenerate(user.sub, undefined, false)).toEqual({
        expiresAt: expect.any(Number),
        analysis: null,
        prompt: null,
      });
      expect(generate).not.toHaveBeenCalled();
      const [first, second] = await Promise.all([
        storage.readOrGenerate(user.sub, undefined, true),
        storage.readOrGenerate(user.sub, undefined, true),
      ]);
      expect(first).toEqual(second);
      expect(first?.analysis?.sources).toHaveLength(3);
      expect(
        first?.analysis?.chapters.find(
          (chapter) => chapter.kind === "difference",
        )?.interpretation,
      ).toContain("比較");
      expect(generate).toHaveBeenCalledTimes(1);
      await storage.readOrGenerate(user.sub, undefined, true);
      expect(generate).toHaveBeenCalledTimes(1);
    });
  });
  it("推論中に閲覧権を失うと結果を返さず保存しない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      let allowed = true;
      const generate = vi.fn(async () => {
        allowed = false;
        return output;
      });
      const storage = new OutcomeReflectionStorage(
        state,
        {
          get: async () =>
            allowed
              ? completedRoomFixture({ expiresAt: Date.now() + 60000 })
              : null,
          board: async () => null,
        },
        generate,
      );
      expect(
        await storage.readOrGenerate(user.sub, undefined, true),
      ).toBeNull();
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toEqual([]);
    });
  });
});
