import { z } from "zod";
import { CompletedSceneKindSchema } from "./completed-rooms";

export const REFLECTION_ARTIFACT_MAX = 200;
// UTF-8 bytes。system・出力・JSON schema用の余裕をモデルの24k contextに残す。
export const REFLECTION_INPUT_MAX = 12000;
export const REFLECTION_PROMPT_LIMIT = 20;
export const ReflectionRequestSchema = z.strictObject({
  artifact: z.string().trim().min(1).max(REFLECTION_ARTIFACT_MAX).optional(),
});
export const ReflectionChapterKindSchema = z.enum([
  "response",
  "difference",
  "assumptions",
]);
export const ReflectionModelAnalysisSchema = z.object({
  chapters: z
    .array(
      z.object({
        kind: ReflectionChapterKindSchema,
        headline: z.string().min(1).max(50),
        interpretation: z.string().min(1).max(360),
        evidenceIds: z.array(z.string().max(200)).max(8),
      }),
    )
    .length(3)
    .refine(
      (chapters) => new Set(chapters.map((chapter) => chapter.kind)).size === 3,
    ),
  recommendation: z
    .object({
      name: z.string().min(1).max(REFLECTION_ARTIFACT_MAX),
      reason: z.string().min(1).max(300),
      checks: z.string().min(1).max(300),
    })
    .nullable(),
  alternatives: z.array(z.string().min(1).max(REFLECTION_ARTIFACT_MAX)).max(4),
});
export const ReflectionSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  content: z.string(),
  scene: CompletedSceneKindSchema.nullable(),
});
export const ReflectionAnalysisSchema = ReflectionModelAnalysisSchema.extend({
  sources: z.array(ReflectionSourceSchema),
  truncated: z.boolean(),
  generatedAt: z.number(),
});
export const ReflectionPromptSchema = z.object({
  artifact: z.string().min(1).max(REFLECTION_ARTIFACT_MAX),
  content: z.string().min(1).max(16000),
  generatedAt: z.number(),
});
export const ReflectionResponseSchema = z.object({
  expiresAt: z.number(),
  analysis: ReflectionAnalysisSchema.nullable(),
  prompt: ReflectionPromptSchema.nullable(),
});
export type ReflectionAnalysis = z.infer<typeof ReflectionAnalysisSchema>;
export type ReflectionSource = z.infer<typeof ReflectionSourceSchema>;
export type ReflectionResponse = z.infer<typeof ReflectionResponseSchema>;
