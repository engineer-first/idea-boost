import {
  CompletedRooms,
  CompletedRoomsUnavailableView,
} from "@/features/completed-rooms";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function CompletedRoomsPage() {
  const user = await getCurrentUser();
  if (!user)
    return <CompletedRoomsUnavailableView returnPath="/completed-rooms" />;
  return <CompletedRooms key={user.sub} />;
}
