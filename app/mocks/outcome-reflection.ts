import { HttpResponse, http } from "msw";
import type { ReflectionShared } from "@/contracts/outcome-reflection";
import { ReflectionRequestSchema } from "@/contracts/outcome-reflection";
import {
  reflectionPlanFixture,
  reflectionResponseFixture,
  reflectionSharedFixture,
} from "@/contracts/outcome-reflection.fixture";

export function createOutcomeReflectionHandlers() {
  const rooms = new Map<string, ReflectionShared>();
  const latest = (id: string) =>
    rooms.get(id) ??
    reflectionSharedFixture({
      revision: 0,
      result: null,
      context: { audience: "", situation: "" },
      generatedAt: null,
    });
  return [
    http.get("/api/completed-rooms/:id/reflection", ({ params }) =>
      HttpResponse.json(
        reflectionResponseFixture({ shared: latest(String(params.id)) }),
      ),
    ),
    http.post(
      "/api/completed-rooms/:id/reflection",
      async ({ params, request }) => {
        const parsed = ReflectionRequestSchema.safeParse(await request.json());
        if (!parsed.success)
          return HttpResponse.json(
            { error: "入力が不正です。" },
            { status: 400 },
          );
        const input = parsed.data;
        let shared = latest(String(params.id));
        if (input.revision !== shared.revision)
          return HttpResponse.json(
            {
              error:
                "共通の調査手順が更新されています。最新版を取得してください。",
            },
            { status: 409 },
          );
        if (input.action === "research") {
          const context = input.context ?? shared.context;
          shared = reflectionSharedFixture({
            revision: shared.revision + 1,
            context,
            result: !context.audience
              ? {
                  kind: "questions",
                  questions: [
                    {
                      field: "audience",
                      question: "誰の困りごとを調べたいですか？",
                    },
                  ],
                }
              : reflectionPlanFixture(),
          });
          rooms.set(String(params.id), shared);
        }
        return HttpResponse.json(
          reflectionResponseFixture({
            shared,
            ...(input.action === "competition"
              ? {
                  competitionPrompt: `採用案と補足条件から競合と現在の対処法を調べてください。出典URLと確認日を示してください。\n${JSON.stringify(shared.context)}`,
                }
              : {}),
            ...(input.action === "artifact"
              ? {
                  selectedArtifact: input.artifact,
                  prompt: {
                    revision: shared.revision,
                    artifact: input.artifact,
                    content: `「${input.artifact}」を作成してください。調査で最近の実体験を聞けるよう、具体的な内容と構成を示してください。`,
                    generatedAt: Date.now(),
                  },
                }
              : {}),
          }),
        );
      },
    ),
  ];
}
export const outcomeReflectionHandlers = createOutcomeReflectionHandlers();
