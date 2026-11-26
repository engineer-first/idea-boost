import { z } from "zod";

export const AppLocaleSchema = z.enum(["ja", "en"]);
export type AppLocale = z.infer<typeof AppLocaleSchema>;
export const DEFAULT_APP_LOCALE: AppLocale = "ja";
