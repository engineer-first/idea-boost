import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  GuideArticleView,
  getGuide,
  getGuideMetadata,
} from "@/features/landing";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  return guide ? getGuideMetadata(guide) : {};
}

export default async function GuidePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  return <GuideArticleView guide={guide} />;
}
