import type { Metadata } from "next";
import { GuideIndexView, getGuideIndexMetadata } from "@/features/landing";

export const metadata: Metadata = getGuideIndexMetadata();

export default function GuidesPage() {
  return <GuideIndexView />;
}
