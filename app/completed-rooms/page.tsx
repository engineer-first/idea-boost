import { redirect } from "next/navigation";
import { CompletedRooms } from "@/features/completed-rooms";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function CompletedRoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcompleted-rooms");
  return <CompletedRooms key={user.sub} />;
}
