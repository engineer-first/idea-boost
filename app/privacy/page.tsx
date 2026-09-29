import type { Metadata } from "next";
import { PrivacyView } from "./privacy-view";
export const metadata: Metadata = { title: "保存とプライバシー | Idea Boost" };
export default function PrivacyPage() {
  return <PrivacyView />;
}
