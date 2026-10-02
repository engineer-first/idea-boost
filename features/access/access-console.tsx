"use client";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import {
  type AccessUserSchema,
  AccessUsersSchema,
  type ManagedReadPermission,
  PERMISSIONS,
} from "@/contracts/access";
import { AccessDeniedView, AccessView } from "./access-view";

type AccessUser = z.infer<typeof AccessUserSchema>;
type FailedOperation = { method: "POST" | "DELETE"; target: string };

export function AccessConsole({
  permission = PERMISSIONS.readSharedOutcomes,
}: {
  permission?: ManagedReadPermission;
}): JSX.Element {
  const path =
    permission === PERMISSIONS.readSharedOutcomes
      ? "/api/admin/access"
      : `/api/admin/access?permission=${encodeURIComponent(permission)}`;
  const label = permission === PERMISSIONS.readFeedback ? "意見" : "成果";
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedOperation, setFailedOperation] =
    useState<FailedOperation | null>(null);
  const [denied, setDenied] = useState<401 | 403 | null>(null);
  const locked = useRef(false);
  const refreshing = useRef(false);
  const deny = useCallback((status: 401 | 403): void => {
    setDenied(status);
    setUsers([]);
    setFailedOperation(null);
    setError(
      status === 401
        ? "ログイン状態を確認できません。もう一度ログインしてください。"
        : "閲覧者の管理権限がありません。権限を確認してから再試行してください。",
    );
  }, []);
  const refresh = useCallback(async (): Promise<
    "success" | "denied" | "failed" | "busy"
  > => {
    if (refreshing.current) return "busy";
    refreshing.current = true;
    setLoading(true);
    setFailedOperation(null);
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        deny(response.status);
        return "denied";
      }
      if (!response.ok) throw new Error("閲覧者を取得できませんでした。");
      setUsers(AccessUsersSchema.parse(await response.json()).users);
      setDenied(null);
      setError(null);
      return "success";
    } catch {
      setError(
        "閲覧者一覧を取得できませんでした。最新の権限を確認するには再試行してください。",
      );
      return "failed";
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [deny, path]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function mutate(
    method: "POST" | "DELETE",
    target: string,
  ): Promise<void> {
    if (locked.current || refreshing.current || denied) return;
    locked.current = true;
    setPending(true);
    setError(null);
    setFailedOperation(null);
    let message = `${target} の${label}閲覧権限を${method === "POST" ? "追加" : "取消"}できませんでした。通信を確認して再試行してください。`;
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      if (response.status === 401 || response.status === 403) {
        deny(response.status);
        return;
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? `${target}：${body.error}`
            : message;
        throw new Error(message);
      }
      if (method === "POST") setEmail("");
      const action = method === "POST" ? "追加" : "取消";
      toast.success(`${target} の${label}閲覧権限を${action}しました。`);
      if ((await refresh()) === "failed") {
        setError(
          `${target} の${label}閲覧権限の${action}は完了しました。一覧を取得できなかったため、再試行して最新の権限を確認してください。`,
        );
      }
    } catch {
      setFailedOperation({ method, target });
      setError(message);
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  if (denied) {
    return (
      <AccessDeniedView
        permission={permission}
        unauthenticated={denied === 401}
        error={error}
        loading={loading}
        onRetry={() => void refresh()}
      />
    );
  }
  return (
    <AccessView
      permission={permission}
      users={users}
      email={email}
      loading={loading}
      pending={pending}
      error={error}
      onEmailChange={(value) => {
        setEmail(value);
        if (failedOperation?.method === "POST") {
          setFailedOperation(null);
          setError(null);
        }
      }}
      onAdd={() => void mutate("POST", email)}
      onRemove={(value) => void mutate("DELETE", value)}
      onRetry={() => {
        if (locked.current || refreshing.current) return;
        if (failedOperation)
          void mutate(failedOperation.method, failedOperation.target);
        else void refresh();
      }}
    />
  );
}
