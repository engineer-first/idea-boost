"use client";
import {
  participationSwitchKey,
  participationSwitchProps,
} from "../logic/participation-switch-props";
import { useRoomCreation } from "../logic/use-room-creation";
import { CreateRoomSectionView } from "../templates/create-room-section-view";
import { ParticipationSwitch } from "./participation-switch";
import { RoomReauthentication } from "./room-reauthentication";
export type CreateRoomSectionProps = { currentUserId: string };

export function CreateRoomSection({ currentUserId }: CreateRoomSectionProps) {
  const controls = useRoomCreation(currentUserId);
  return (
    <>
      <CreateRoomSectionView key={currentUserId} {...controls} />
      {controls.switching && (
        <ParticipationSwitch
          key={participationSwitchKey(controls.switching)}
          currentUserId={currentUserId}
          {...participationSwitchProps(controls.switching)}
          onCancel={controls.onCancelSwitch}
          onReady={controls.onSwitchReady}
        />
      )}
      {controls.reauthentication && (
        <RoomReauthentication
          operation={controls.reauthentication}
          onBack={controls.onCancelReauthentication}
        />
      )}
    </>
  );
}
