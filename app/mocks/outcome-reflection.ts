import { HttpResponse, http } from "msw";
import { ReflectionRequestSchema } from "@/contracts/outcome-reflection";
import { reflectionResponseFixture } from "@/contracts/outcome-reflection.fixture";
export const outcomeReflectionHandlers = [
  http.post("/api/completed-rooms/:id/reflection", async ({ request }) => {
    const parsed = ReflectionRequestSchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json({ error: "入力が不正です。" }, { status: 400 });
    const artifact = parsed.data.artifact;
    return HttpResponse.json(
      reflectionResponseFixture({
        prompt: artifact
          ? {
              artifact,
              content: `「${artifact}」を作成してください。\n\n目的：空きコマに学び合う仲間と出会える提案を具体化すること。\n\n確定した課題：一緒に勉強する仲間が見つからない。\n問い：どうすれば気軽に学び合う仲間と出会えるだろう？\n採用案：空きコマに学び合う仲間と出会える勉強マッチ。\n\n利用前、募集を見つける場面、参加する場面を表してください。未決定の条件は仮説として分けてください。\n\n確認したいこと：初めての相手に参加する際、どこに不安を感じるか。`,
              generatedAt: Date.now(),
            }
          : null,
      }),
    );
  }),
];
