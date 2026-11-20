import { headers } from "next/headers";
import { type AppLocale, resolveLocale } from "./locale";

export async function getDisplayLocale(): Promise<AppLocale> {
  return resolveLocale((await headers()).get("accept-language"));
}
