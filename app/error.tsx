"use client";

import { useTranslations } from "next-intl";
import { RouteStatusView } from "./route-status-view";

// error.tsx は Client Component で metadata を書き出せないため、<title> で付ける。
export default function RouteError() {
  const t = useTranslations("app.routeStatus");
  return (
    <>
      <title>{t("errorTitle")}</title>
      <RouteStatusView kind="error" />
    </>
  );
}
