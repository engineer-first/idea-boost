"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { consumeRoomEntry, RoomAdmissionContext } from "@/features/auth";
import { takePendingRoomEntry } from "@/lib/room-client/entry-tab-storage";
import {
  getRoomEntryTabId,
  matchesRoomEntryTab,
} from "../logic/room-entry-tab";
import { RoomReauthentication } from "./room-reauthentication";

export type RoomAdmissionGateProps = {
  roomId: string;
  stage?: "lobby" | "board";
  entryToken?: string;
  entryTabId?: string;
  children: ReactNode;
  fallback?: ReactNode;
  freshAdmission?: string;
  allowFreshEntry?: boolean;
};

export function RoomAdmissionGate({
  roomId,
  stage = "board",
  entryToken,
  entryTabId,
  children,
  fallback,
  freshAdmission,
  allowFreshEntry = false,
}: RoomAdmissionGateProps) {
  const [result, setResult] = useState<{
    ok: boolean;
    admission?: string;
  } | null>(null);
  const request = useRef<Promise<{ ok: boolean; admission?: string }> | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    let tabId: string;
    try {
      tabId = entryTabId ?? getRoomEntryTabId();
    } catch {
      setResult({ ok: allowFreshEntry, admission: freshAdmission });
      return;
    }
    if (!entryToken || !matchesRoomEntryTab(tabId)) {
      setResult({ ok: allowFreshEntry, admission: freshAdmission });
      return;
    }
    if (!request.current && !takePendingRoomEntry(entryToken)) {
      setResult({ ok: allowFreshEntry, admission: freshAdmission });
      return;
    }
    // StrictModeのeffect再実行も同じ一回消費要求を待つ。
    request.current ??= consumeRoomEntry(
      entryToken,
      roomId,
      tabId,
      stage,
    ).catch(() => ({ ok: false }));
    void request.current.then((value) => {
      if (active)
        setResult(
          value.ok ? value : { ok: allowFreshEntry, admission: freshAdmission },
        );
    });
    return () => {
      active = false;
    };
  }, [entryToken, entryTabId, roomId, stage, allowFreshEntry, freshAdmission]);

  if (!result && entryToken) {
    return (
      <>
        {fallback}
        <p
          role="status"
          className="fixed inset-x-4 top-1/2 mx-auto max-w-md rounded-xl bg-background p-6 text-center shadow-lg"
        >
          ルームを確認しています…
        </p>
      </>
    );
  }
  if (!result?.ok) {
    return (
      <>
        {fallback}
        <RoomReauthentication operation={{ kind: "return", roomId }} />
      </>
    );
  }
  return (
    <RoomAdmissionContext.Provider value={result.admission}>
      {children}
    </RoomAdmissionContext.Provider>
  );
}
