import { z } from "zod";
import { CompletedSceneKindSchema } from "./completed-rooms";

export const REFLECTION_ARTIFACT_MAX = 200;
export const REFLECTION_CONTEXT_MAX = 200;
export const REFLECTION_INPUT_MAX = 12000;
export const REFLECTION_PROMPT_LIMIT = 20;
export const REFLECTION_RESEARCH_LIMIT = 20;
export const REFLECTION_STEPS_MAX = 6;
export const ReflectionContextSchema = z.strictObject({
  audience: z.string().trim().max(REFLECTION_CONTEXT_MAX),
  situation: z.string().trim().max(REFLECTION_CONTEXT_MAX),
});
const revision = z.int().nonnegative();
export const ReflectionRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("research"),
    revision,
    context: ReflectionContextSchema.optional(),
  }),
  z.strictObject({ action: z.literal("competition"), revision }),
  z.strictObject({
    action: z.literal("artifact"),
    revision,
    artifact: z.string().trim().min(1).max(REFLECTION_ARTIFACT_MAX),
  }),
]);
export const ReflectionQuestionsSchema = z
  .object({
    kind: z.literal("questions"),
    questions: z
      .array(
        z.object({
          field: z.enum(["audience", "situation"]),
          question: z.string().min(1).max(160),
        }),
      )
      .min(1)
      .max(2),
  })
  .refine(
    (value) =>
      new Set(value.questions.map((question) => question.field)).size ===
      value.questions.length,
    "同じ項目は重複して質問できません。",
  );
export const ReflectionPlanSchema = z.object({
  kind: z.literal("plan"),
  method: z
    .string()
    .min(1)
    .max(80)
    .describe("実施する調査方法を1つだけ選ぶ。複数の方法の列挙はしない。"),
  reason: z.string().min(1).max(300),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(50),
        action: z.string().min(1).max(240),
        task: z
          .string()
          .min(1)
          .max(240)
          .describe(
            "そのまま使える、最近の実体験を聞く中立的な質問、または具体的な状況で試してもらう課題。案への賛否や仮の利用意向を聞かない。",
          ),
        observe: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "ニーズの手がかりになる具体的な行動・困りごと・対処法。『回答を分析する』だけで終わらせない。",
          ),
      }),
    )
    .min(1)
    .max(REFLECTION_STEPS_MAX),
  synthesis: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "観察した事実と解釈をどう分けて整理し、どんな事実なら進め、どんな事実なら対象や案を見直すか。仮説のままと確認済みを区別する。",
    ),
  recommendation: z
    .object({
      name: z.string().min(1).max(REFLECTION_ARTIFACT_MAX),
      reason: z.string().min(1).max(300),
    })
    .nullable(),
  alternatives: z.array(z.string().min(1).max(REFLECTION_ARTIFACT_MAX)).max(4),
});
export const ReflectionResearchSchema = z.union([
  ReflectionQuestionsSchema,
  ReflectionPlanSchema,
]);
export const ReflectionSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  content: z.string(),
  scene: CompletedSceneKindSchema.nullable(),
});
export const ReflectionSharedSchema = z.object({
  revision,
  context: ReflectionContextSchema,
  result: ReflectionResearchSchema.nullable(),
  sources: z.array(ReflectionSourceSchema),
  truncated: z.boolean(),
  generatedAt: z.number().nullable(),
});
export const ReflectionPromptSchema = z.object({
  revision,
  artifact: z.string().min(1).max(REFLECTION_ARTIFACT_MAX),
  content: z.string().min(1).max(16000),
  generatedAt: z.number(),
});
export const ReflectionResponseSchema = z.object({
  expiresAt: z.number(),
  shared: ReflectionSharedSchema,
  selectedArtifact: z.string().max(REFLECTION_ARTIFACT_MAX).nullable(),
  prompt: ReflectionPromptSchema.nullable(),
  competitionPrompt: z.string().max(16000).nullable(),
});
export type ReflectionRequest = z.infer<typeof ReflectionRequestSchema>;
export type ReflectionContext = z.infer<typeof ReflectionContextSchema>;
export type ReflectionResearch = z.infer<typeof ReflectionResearchSchema>;
export type ReflectionPlan = z.infer<typeof ReflectionPlanSchema>;
export type ReflectionShared = z.infer<typeof ReflectionSharedSchema>;
export type ReflectionResponse = z.infer<typeof ReflectionResponseSchema>;
export type ReflectionSource = z.infer<typeof ReflectionSourceSchema>;
