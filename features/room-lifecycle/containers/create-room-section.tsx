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
  return (
    <>
      <CreateRoomSectionView key={currentUserId} {...controls} />
      {controls.reauthentication && (
        <RoomReauthentication
          operation={controls.reauthentication}
          onBack={controls.onCancelReauthentication}
        />
      )}
    </>
  );
}
