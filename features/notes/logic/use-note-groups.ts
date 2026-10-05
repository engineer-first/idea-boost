"use client";

// 永続グループ（付箋のまとまり）の状態とプロトコル化の hook（ボード画面専用）。
// 作成・改名は楽観更新し、確定・他者の変更は group:updated / group:deleted で
// 畳み込む。
import { useCallback, useState } from "react";
import type { PersistentGroup } from "@/contracts/grouping";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

export type UseNoteGroupsResult = {
  groups: PersistentGroup[];
  applyMessage: (message: ServerMessage) => void;
  createGroup: (name: string, noteIds: string[]) => void;
  renameGroup: (groupId: string, name: string) => void;
};

export function useNoteGroups({
  send,
}: {
  send: (message: ClientMessage) => void;
}): UseNoteGroupsResult {
  const [groups, setGroups] = useState<PersistentGroup[]>([]);

  const applyMessage = useCallback((message: ServerMessage) => {
    if (message.type === "notes:moved") {
      setGroups(message.groups);
      return;
    }
    if (message.type === "snapshot") {
      setGroups(message.groups || []);
      return;
    }
    if (message.type === "group:updated") {
      setGroups((current) => {
        const index = current.findIndex((g) => g.id === message.group.id);
        if (index >= 0) {
          const next = [...current];
          next[index] = message.group;
          return next;
        }
        return [...current, message.group];
      });
      return;
    }
    if (message.type === "group:deleted") {
      setGroups((current) => current.filter((g) => g.id !== message.groupId));
    }
  }, []);

  const createGroup = useCallback(
    (name: string, noteIds: string[]) => {
      const newGroup = {
        id: crypto.randomUUID(),
        name,
        noteIds,
      };
      setGroups((current) => [...current, newGroup]);
      send({
        type: "group:create",
        group: {
          ...newGroup,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [send],
  );

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      setGroups((current) =>
        current.map((g) => (g.id === groupId ? { ...g, name } : g)),
      );
      send({ type: "group:update-name", groupId, name });
    },
    [send],
  );

  return { groups, applyMessage, createGroup, renameGroup };
}
