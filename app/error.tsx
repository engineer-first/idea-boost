"use client";

import { routeStatusCopy } from "./route-status-copy";
import { RouteStatusView } from "./route-status-view";

// error.tsx は Client Component で metadata を書き出せないため、<title> で付ける。
export default function RouteError() {
  return (
    <>
      <title>{routeStatusCopy.error.title}</title>
      <RouteStatusView kind="error" />
    </>
  );
}
