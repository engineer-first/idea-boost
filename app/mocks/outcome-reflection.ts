import { HttpResponse, http } from "msw";
import { ReflectionRequestSchema } from "@/contracts/outcome-reflection";
import {
  reflectionAnalysisFixture,
  reflectionResponseFixture,
} from "@/contracts/outcome-reflection.fixture";
export const outcomeReflectionHandlers = [
  http.post("/api/completed-rooms/:id/reflection", async ({ request }) => {
    const parsed = ReflectionRequestSchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json({ error: "入力が不正です。" }, { status: 400 });
    const artifact = parsed.data.artifact;
    const analysis = reflectionAnalysisFixture();
    return HttpResponse.json(
      reflectionResponseFixture({
        prompt: artifact
          ? {
              artifact,
              content: `「${artifact}」を作成してください。\n\n目的：一緒に勉強したいのに相手を探せない学生がいるかを確かめること。\n\nチームが決めた課題：一緒に勉強する仲間が見つからない。\n問い：どうすれば気軽に学び合う仲間と出会えるだろう？\n採用案：空きコマに学び合う仲間と出会える勉強マッチ。需要はまだ確認できていません。\n\n試す相手：${analysis.experiment.who}\n手順：\n${analysis.experiment.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n観察すること：${analysis.experiment.observe}\n\n次の判断：${analysis.experiment.ifSupported}\n${analysis.experiment.ifNotSupported}\n\n最近の実体験を聞く中立的な質問を使い、アプリへの賛否を誘導しないでください。選択した制作物に合う形式にし、未決定の条件は仮の案として分けてください。`,
              generatedAt: Date.now(),
            }
          : null,
      }),
    );
  }),
];
