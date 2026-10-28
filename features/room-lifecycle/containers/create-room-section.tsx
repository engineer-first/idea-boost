"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuestNameForm } from "@/features/auth";
import {
  participationSwitchKey,
  participationSwitchProps,
} from "../logic/participation-switch-props";
import { useRoomCreation } from "../logic/use-room-creation";
import { CreateRoomSectionView } from "../templates/create-room-section-view";
import { ParticipationSwitch } from "./participation-switch";
import { RoomReauthentication } from "./room-reauthentication";
export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const focusRoomName = useRef(!currentUserId);
  return currentUserId ? (
    <PreparedCreateRoomSection
      currentUserId={currentUserId}
      focusRoomName={focusRoomName}
    />
  ) : (
    <GuestCreateRoomSection />
  );
}

function GuestCreateRoomSection() {
  const router = useRouter();
  return (
    <CreateRoomSectionView
      identityStep={
        <GuestNameForm submitLabel="次へ" onPrepared={() => router.refresh()} />
      }
    />
  );
}

function PreparedCreateRoomSection({
  currentUserId,
  focusRoomName,
}: {
  currentUserId: string;
  focusRoomName: React.RefObject<boolean>;
}) {
  const controls = useRoomCreation(currentUserId);
  const roomNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (
      focusRoomName.current &&
      !controls.pending &&
      !controls.recovering &&
      !controls.storageError
    ) {
      roomNameRef.current?.focus();
      if (document.activeElement === roomNameRef.current)
        focusRoomName.current = false;
    }
  }, [
    focusRoomName,
    controls.pending,
    controls.recovering,
    controls.storageError,
  ]);
  return (
    <>
      <CreateRoomSectionView
        key={currentUserId}
        {...controls}
        roomNameRef={roomNameRef}
      />
      {controls.switching && currentUserId && (
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
