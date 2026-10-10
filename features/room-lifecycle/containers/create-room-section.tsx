"use client";
import { useRoomCreation } from "../logic/use-room-creation";
import { CreateRoomSectionView } from "../templates/create-room-section-view";
import { RoomReauthentication } from "./room-reauthentication";
export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const controls = useRoomCreation(currentUserId);
  if (controls.reauthentication)
    return (
      <RoomReauthentication
        operation={controls.reauthentication}
        onBack={controls.onCancelReauthentication}
      />
    );
  return <CreateRoomSectionView key={currentUserId} {...controls} />;
}
