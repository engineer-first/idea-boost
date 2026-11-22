import { headers } from "next/headers";
import { type AppLocale, resolveLocale } from "./locale";

/** 別の言語の版への案内を出すために、ブラウザが望む言語を読む。 */
export async function getBrowserLocale(): Promise<AppLocale> {
  return resolveLocale((await headers()).get("accept-language"));
}
