import type { Metadata } from "next";
import { routeStatusCopy } from "./route-status-copy";
import { RouteStatusView } from "./route-status-view";

export const metadata: Metadata = { title: routeStatusCopy.not_found.title };

export default function NotFound() {
  return <RouteStatusView kind="not_found" />;
}
