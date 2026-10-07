"use client";
import { useRoomCreation } from "../logic/use-room-creation";
import { CreateRoomSectionView } from "../templates/create-room-section-view";
export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const controls = useRoomCreation(currentUserId);
  return <CreateRoomSectionView key={currentUserId} {...controls} />;
}
