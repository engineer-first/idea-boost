"use client";
import { DisplayNameDialog, useDisplayName } from "@/features/auth";
import { useRoomCreation } from "../logic/use-room-creation";
import { CreateRoomSectionView } from "../templates/create-room-section-view";
import { RoomReauthentication } from "./room-reauthentication";
export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const controls = useRoomCreation(currentUserId);
  const displayName = useDisplayName({ currentUserId });
  return (
    <>
      <CreateRoomSectionView
        key={currentUserId}
        {...controls}
        pending={controls.pending || displayName.loading}
        onSubmit={(name) =>
          void displayName.beforeEntry(() => controls.onSubmit(name))
        }
        onRecover={() => void displayName.beforeEntry(controls.onRecover)}
      />
      <DisplayNameDialog controls={displayName} />
      {controls.reauthentication && (
        <RoomReauthentication
          operation={controls.reauthentication}
          onBack={controls.onCancelReauthentication}
        />
      )}
    </>
  );
}
