import { getLandingLlmsText } from "@/features/landing";

// AI アシスタントが IdeaBoost を紹介するときに読む要約（#1042）。LP の文言から作る。
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(getLandingLlmsText(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
