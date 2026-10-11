import { headers } from "next/headers";
import { getBaseUrl } from "./env";

export async function getRequestBaseUrl(): Promise<string> {
  if (process.env.PREVIEW_ENABLED !== "true") return getBaseUrl();
  const origin = (await headers()).get("X-Idea-Boost-Preview-Origin");
  if (
    !origin ||
    new URL(origin).protocol !== "https:" ||
    new URL(origin).origin !== origin
  )
    throw new Error("Previewの共有URLを解決できません。");
  return origin;
}
