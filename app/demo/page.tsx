import { notFound } from "next/navigation";
import { DemoEntry, isDemoEnabled } from "@/features/demo";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (!isDemoEnabled()) notFound();
  return <DemoEntry />;
}
