import { describe, expect, it, vi } from "vitest";
import {
  completedRoomFixture,
  completedSceneBoardFixture,
} from "../contracts/completed-rooms.fixture";
import {
  REFLECTION_INPUT_MAX,
  type ReflectionRequest,
} from "../contracts/outcome-reflection";
import { reflectionPlanFixture } from "../contracts/outcome-reflection.fixture";
import {
  buildReflectionInput,
  generateReflection,
  OutcomeReflectionStorage,
  REFLECTION_BUSY_ERROR,
  REFLECTION_CONFLICT_ERROR,
  REFLECTION_LIMIT_ERROR,
} from "./room/outcome-reflection";
import { createRoomAs, runInRoomDO } from "./test-helpers";

const user = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.invalid",
};
const other = "22222222-2222-4222-8222-222222222222";
const output = reflectionPlanFixture();
const completed = () => ({
  get: async () => completedRoomFixture({ expiresAt: Date.now() + 60000 }),
  board: async () => null,
});
const research = (revision = 0): ReflectionRequest => ({
  action: "research",
  revision,
});
const prompt = (artifact = "質問リスト", revision = 0): ReflectionRequest => ({
  action: "artifact",
  artifact,
  revision,
});
const generator = () =>
  vi.fn(async (mode: string, input: string) =>
    mode === "research"
      ? output
      : {
          artifact: JSON.parse(input).artifact,
          content: "選んだ制作物の構成と具体的な内容を作成してください。",
        },
  );

describe("ユーザーニーズ調査の準備", () => {
  it("古い参照版で共通の手順を更新せず、推論前に拒否する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      await expect(
        storage.readOrGenerate(user.sub, research(99)),
      ).rejects.toThrow(REFLECTION_CONFLICT_ERROR);
      expect(generate).not.toHaveBeenCalled();
    });
  });
  it("非閲覧者には生成・競合調査・保存済み結果を返さず、推論も保存もしない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        { get: async () => null, board: async () => null },
        generate,
      );
      for (const request of [
        null,
        research(),
        prompt(),
        { action: "competition", revision: 0 } as const,
      ])
        expect(await storage.readOrGenerate(other, request)).toBeNull();
      expect(generate).not.toHaveBeenCalled();
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toEqual([]);
    });
  });
  it("閲覧だけでは推論せず、共通の手順と補足をほかの閲覧者が再取得できる", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      state.storage.sql.exec(
        "INSERT INTO outcome_reflections(cache_key,value_json) VALUES('v4:analysis','{}')",
      );
      expect(
        (await storage.readOrGenerate(user.sub, null))?.shared,
      ).toMatchObject({ revision: 0, result: null });
      expect(generate).not.toHaveBeenCalled();
      const context = { audience: "学生", situation: "空きコマ" };
      const first = await storage.readOrGenerate(user.sub, {
        ...research(),
        context,
      } as ReflectionRequest);
      expect(first?.shared).toMatchObject({
        revision: 1,
        context,
        result: output,
      });
      const reopened = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      expect((await reopened.readOrGenerate(other, null))?.shared).toEqual(
        first?.shared,
      );
      await reopened.readOrGenerate(other, research(1));
      expect(generate).toHaveBeenCalledTimes(1);
      for (const request of [
        research(),
        prompt(),
        { action: "competition", revision: 0 } as const,
      ])
        await expect(reopened.readOrGenerate(other, request)).rejects.toThrow(
          REFLECTION_CONFLICT_ERROR,
        );
    });
  });
  it("不足項目だけ追加確認し、分からないという補足でも調査手順を保存できる", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const questions = {
        kind: "questions",
        questions: [
          { field: "audience", question: "誰の困りごとを調べたいですか？" },
        ],
      };
      const generate = vi
        .fn()
        .mockResolvedValueOnce(questions)
        .mockResolvedValueOnce(output);
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      expect(
        (await storage.readOrGenerate(user.sub, research()))?.shared.result,
      ).toEqual(questions);
      expect(
        (
          await storage.readOrGenerate(other, {
            action: "research",
            revision: 1,
            context: { audience: "分からない", situation: "" },
          })
        )?.shared,
      ).toMatchObject({ revision: 2, result: output });
      expect(JSON.parse(generate.mock.calls[1][1]).context.audience).toBe(
        "分からない",
      );
    });
  });
  it("未保存の場面は読まず、不正な手順や回答済み項目への再質問を保存しない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const board = vi.fn();
      const generate = vi
        .fn()
        .mockResolvedValueOnce({
          ...output,
          steps: [{ ...output.steps[0], observe: "" }],
        })
        .mockResolvedValueOnce({
          kind: "questions",
          questions: [{ field: "audience", question: "誰ですか？" }],
        });
      const storage = new OutcomeReflectionStorage(
        state,
        {
          get: async () => {
            const record = completedRoomFixture({
              expiresAt: Date.now() + 60000,
            });
            return {
              ...record,
              scenes: record.scenes.map((scene) => ({
                ...scene,
                status: "pending" as const,
              })),
            };
          },
          board,
        },
        generate,
      );
      await expect(
        storage.readOrGenerate(user.sub, research()),
      ).rejects.toThrow();
      await expect(
        storage.readOrGenerate(user.sub, {
          action: "research",
          revision: 0,
          context: { audience: "学生", situation: "" },
        }),
      ).rejects.toThrow("回答済み");
      expect(board).not.toHaveBeenCalled();
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toEqual([]);
      expect(JSON.parse(generate.mock.calls[0][1]).sources).toHaveLength(3);
    });
  });
  it("更新失敗でも前の共通手順と版を残し、同じ操作を再試行できる", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = vi
        .fn()
        .mockResolvedValueOnce(output)
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(output);
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      const first = await storage.readOrGenerate(user.sub, research());
      const request: ReflectionRequest = {
        action: "research",
        revision: 1,
        context: { audience: "社会人", situation: "通勤" },
      };
      await expect(storage.readOrGenerate(other, request)).rejects.toThrow(
        "unavailable",
      );
      expect((await storage.readOrGenerate(user.sub, null))?.shared).toEqual(
        first?.shared,
      );
      expect(
        (await storage.readOrGenerate(other, request))?.shared.revision,
      ).toBe(2);
    });
  });
  it("ルーム内で同時に2つの推論を実行しない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      let finish!: (value: unknown) => void;
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const generate = vi.fn(() => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      const pending = storage.readOrGenerate(user.sub, research());
      await ready;
      await expect(storage.readOrGenerate(other, prompt())).rejects.toThrow(
        REFLECTION_BUSY_ERROR,
      );
      finish(output);
      expect((await pending)?.shared.revision).toBe(1);
      expect(generate).toHaveBeenCalledTimes(1);
    });
  });
  it("推論中の権限喪失や期限切れでは結果を保存・返却しない", async () => {
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
      expect(await storage.readOrGenerate(user.sub, research())).toBeNull();
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toEqual([]);
    });
  });
  it("推論中に参照版が変わったら結果を上書きしない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const shared = {
        revision: 2,
        context: { audience: "別の対象", situation: "" },
        result: output,
        sources: [],
        truncated: false,
        generatedAt: Date.now(),
      };
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        async () => {
          state.storage.sql.exec(
            "INSERT INTO outcome_reflections(cache_key,value_json) VALUES('v5:shared',?)",
            JSON.stringify(shared),
          );
          return output;
        },
      );
      await expect(
        storage.readOrGenerate(user.sub, research()),
      ).rejects.toThrow(REFLECTION_CONFLICT_ERROR);
      expect((await storage.readOrGenerate(user.sub, null))?.shared).toEqual(
        shared,
      );
    });
  });
  it("確定成果と保存済み共有本文だけを送り、重複・候補外・空欄・進行情報を除く", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const store = {
        get: completed().get,
        board: vi.fn(async (_userId, kind) => {
          const board = completedSceneBoardFixture(kind);
          const note = board.notes[1];
          return {
            scene: { kind, recordedAt: 123, status: "saved" as const },
            board: {
              ...board,
              notes: [
                ...board.notes,
                {
                  ...note,
                  id: "excluded",
                  content: "EXCLUDED",
                  excluded: true,
                },
                { ...note, id: "empty", content: " " },
              ],
            },
          };
        }),
      };
      const storage = new OutcomeReflectionStorage(state, store, generate);
      await storage.readOrGenerate(user.sub, research());
      const input = JSON.parse(generate.mock.calls[0][1]);
      expect(input.sources.map((source: { id: string }) => source.id)).toEqual([
        "decision-1",
        "decision-2",
        "decision-3",
        "problem-grouping:other",
        "question-decision:other",
        "idea-mapping:other",
      ]);
      expect(JSON.stringify(input)).not.toMatch(
        /recordedAt|status|EXCLUDED|votes|stackOrder/,
      );
    });
  });
  it("調査前でも競合調査の依頼文を作れ、Web検索やAI推論を行わない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      const result = await storage.readOrGenerate(user.sub, {
        action: "competition",
        revision: 0,
      });
      expect(result?.competitionPrompt).toMatch(/出典URLと確認日/);
      expect(result?.competitionPrompt).toContain("対処法・代替手段");
      expect(result?.competitionPrompt).toContain("decision-3");
      expect(generate).not.toHaveBeenCalled();
    });
  });
  it("制作依頼文に選んだ制作物・補足・調査手順・観察・整理を引き継ぐ", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      await storage.readOrGenerate(user.sub, {
        action: "research",
        revision: 0,
        context: { audience: "学生", situation: "空きコマ" },
      });
      const result = await storage.readOrGenerate(
        user.sub,
        prompt("質問リスト", 1),
      );
      const input = JSON.parse(generate.mock.calls[1][1]);
      expect(input).toMatchObject({
        artifact: "質問リスト",
        context: { audience: "学生", situation: "空きコマ" },
        research: {
          method: output.method,
          reason: output.reason,
          steps: output.steps,
          synthesis: expect.any(String),
        },
      });
      expect(result?.prompt?.content).toContain("作成するもの：質問リスト");
      expect(result?.prompt?.revision).toBe(1);
    });
  });
  it("制作物の選択は本人ごとに保存し、共通手順の更新後に古い依頼文を混ぜない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      await storage.readOrGenerate(user.sub, prompt("質問リスト"));
      await storage.readOrGenerate(other, prompt("スライド"));
      expect(
        (await storage.readOrGenerate(user.sub, null))?.prompt?.artifact,
      ).toBe("質問リスト");
      expect(
        (await storage.readOrGenerate(other, null))?.prompt?.artifact,
      ).toBe("スライド");
      await storage.readOrGenerate(other, research());
      const refreshed = await storage.readOrGenerate(user.sub, null);
      expect(refreshed?.selectedArtifact).toBe("質問リスト");
      expect(refreshed?.prompt).toBeNull();
      await expect(storage.readOrGenerate(user.sub, prompt())).rejects.toThrow(
        REFLECTION_CONFLICT_ERROR,
      );
    });
  });
  it("選んだ制作物とモデルの出力が異なれば保存しない", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        async () => ({
          artifact: "モック",
          content: "画面を作成してください。",
        }),
      );
      await expect(storage.readOrGenerate(user.sub, prompt())).rejects.toThrow(
        "一致しません",
      );
      expect(
        state.storage.sql.exec("SELECT * FROM outcome_reflections").toArray(),
      ).toEqual([]);
    });
  });
  it("制作物別の生成を20件までとし、保存済みの依頼文は上限後も再利用する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      for (let i = 0; i < 20; i++)
        await storage.readOrGenerate(user.sub, prompt(`制作物${i}`));
      await expect(
        storage.readOrGenerate(user.sub, prompt("新しい制作物")),
      ).rejects.toThrow(REFLECTION_LIMIT_ERROR);
      expect(
        (await storage.readOrGenerate(user.sub, prompt("制作物0")))?.prompt
          ?.artifact,
      ).toBe("制作物0");
      expect(generate).toHaveBeenCalledTimes(20);
    });
  });
  it("長い日本語とJSON記号の記録でも入力全体をbyte上限へ収める", () => {
    const sources = Array.from({ length: 30 }, (_, index) => ({
      id: `source-${index}`,
      label: "共有記録",
      content: '日本語\\"'.repeat(3000),
      scene: null,
    }));
    const result = buildReflectionInput(sources, { artifact: "説明スライド" });
    expect(new TextEncoder().encode(result.input).length).toBeLessThanOrEqual(
      REFLECTION_INPUT_MAX,
    );
    expect(result.truncated).toBe(true);
    expect(result.sources).toHaveLength(3);
  });
  it("調査の新しい条件も20件までに制限し、上限後は以前の条件を推論せず再利用する", async () => {
    const room = await createRoomAs(user);
    await runInRoomDO(room.roomId, async (_instance, state) => {
      const generate = generator();
      const storage = new OutcomeReflectionStorage(
        state,
        completed(),
        generate,
      );
      for (let index = 0; index < 20; index++)
        await storage.readOrGenerate(user.sub, {
          action: "research",
          revision: index,
          context: { audience: `対象${index}`, situation: "" },
        });
      await expect(
        storage.readOrGenerate(user.sub, {
          action: "research",
          revision: 20,
          context: { audience: "新しい対象", situation: "" },
        }),
      ).rejects.toThrow("調査手順生成数の上限");
      expect(
        (await storage.readOrGenerate(user.sub, null))?.shared.revision,
      ).toBe(20);
      const reused = await storage.readOrGenerate(other, {
        action: "research",
        revision: 20,
        context: { audience: "対象0", situation: "" },
      });
      expect(reused?.shared).toMatchObject({
        revision: 21,
        context: { audience: "対象0" },
        result: output,
      });
      expect(generate).toHaveBeenCalledTimes(20);
    });
  });
  it("Workers AIの文字列・構造化応答を読み、補足条件をsystem命令へ混ぜない", async () => {
    for (const response of [
      { response: JSON.stringify(output) },
      { response: output },
      JSON.stringify(output),
      { choices: [{ message: { content: JSON.stringify(output) } }] },
    ]) {
      const run = vi.fn().mockResolvedValue(response);
      expect(
        await generateReflection(
          { run } as unknown as Ai,
          "research",
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
});
