import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { RouteStatusView } from "./route-status-view";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title:
      locale === "en"
        ? "Page not found | Idea Boost"
        : "ページが見つかりません | Idea Boost",
  };
}

export default function NotFound() {
  return <RouteStatusView kind="not_found" />;
}
