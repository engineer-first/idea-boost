import type { Metadata } from "next";
import { RoomOperationResume } from "@/features/room-lifecycle";
export const metadata: Metadata = { title: "ルームへ戻る | Idea Boost" };

export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
      <RoomOperationResume initialError={error} />
    </main>
  );
}
