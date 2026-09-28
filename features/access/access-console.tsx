"use client";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { type AccessUserSchema, AccessUsersSchema } from "@/contracts/access";
import { AccessView } from "./access-view";

type AccessUser = z.infer<typeof AccessUserSchema>;

export function AccessConsole() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/access", { cache: "no-store" });
      if (!response.ok) throw new Error("閲覧者を取得できませんでした。");
      setUsers(AccessUsersSchema.parse(await response.json()).users);
      setError(null);
    } catch {
      setError("閲覧者を取得できませんでした。再試行してください。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function mutate(method: "POST" | "DELETE", target: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "操作に失敗しました。";
        throw new Error(message);
      }
      if (method === "POST") setEmail("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作に失敗しました。");
    } finally {
      setPending(false);
    }
  }
  return (
    <AccessView
      users={users}
      email={email}
      loading={loading}
      pending={pending}
      error={error}
      onEmailChange={setEmail}
      onAdd={() => void mutate("POST", email)}
      onRemove={(value) => void mutate("DELETE", value)}
      onRetry={() => void refresh()}
    />
  );
}
