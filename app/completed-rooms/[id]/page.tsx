import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/contracts/ids";
import { CompletedRoomDetail } from "@/features/completed-rooms";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function CompletedRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/completed-rooms/${id}`)}`);
  return <CompletedRoomDetail key={`${user.sub}:${id}`} roomId={id} />;
}
