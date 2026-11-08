"use client";
import { useEffect, useRef, useState } from "react";
import {
  type ReflectionChapterKind,
  type ReflectionResponse,
  ReflectionResponseSchema,
} from "@/contracts/outcome-reflection";
import { OutcomeReflectionView } from "../molecules/outcome-reflection-view";

export function OutcomeReflection({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState<ReflectionChapterKind>("change");
  const [data, setData] = useState<ReflectionResponse | null>(null);
  const [artifact, setArtifact] = useState("");
  const [busy, setBusy] = useState<"analysis" | "prompt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "success" | "failed">("idle");
  const request = useRef<AbortController | null>(null);
  const copyGeneration = useRef(0);
  useEffect(
    () => () => {
      request.current?.abort();
      copyGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    if (!data) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = data.expiresAt - Date.now();
      if (remaining <= 0) {
        request.current?.abort();
        copyGeneration.current++;
        setData(null);
        setBusy(null);
        setCopy("idle");
        setError("閲覧期限が終了しました。成果を開き直してください。");
      } else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    return () => clearTimeout(timer);
  }, [data]);

  async function generate(selected?: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOpen(true);
    setBusy(selected ? "prompt" : "analysis");
    setError(null);
    setCopy("idle");
    copyGeneration.current++;
    try {
      const response = await fetch(
        `/api/completed-rooms/${encodeURIComponent(roomId)}/reflection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selected ? { artifact: selected } : {}),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          setData(null);
          throw new Error(
            "閲覧権限または閲覧期限を確認できません。成果を開き直してください。",
          );
        }
        if (response.status === 429 || response.status === 409) {
          const problem = await response.json();
          throw new Error(
            typeof problem.error === "string"
              ? problem.error
              : "時間をおいて再試行してください。",
          );
        }
        throw new Error("AIの生成に失敗しました。時間をおいて再試行できます。");
      }
      const result = ReflectionResponseSchema.parse(await response.json());
      if (!controller.signal.aborted) {
        setData(result);
        if (!selected)
          setArtifact(
            result.prompt?.artifact ??
              result.analysis?.recommendation?.name ??
              "",
          );
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "生成できませんでした。",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function copyPrompt() {
    if (!data?.prompt) return;
    const generation = ++copyGeneration.current;
    try {
      await navigator.clipboard.writeText(data.prompt.content);
      if (generation === copyGeneration.current) setCopy("success");
    } catch {
      if (generation === copyGeneration.current) setCopy("failed");
    }
  }
  return (
    <OutcomeReflectionView
      recordsHref={`/completed-rooms/${encodeURIComponent(roomId)}`}
      chapter={chapter}
      onChapter={setChapter}
      open={open}
      data={data}
      busy={busy}
      error={error}
      artifact={artifact}
      copy={copy}
      onStart={() => void generate()}
      onArtifact={(value) => {
        copyGeneration.current++;
        request.current?.abort();
        setBusy(null);
        setArtifact(value);
        setCopy("idle");
        setData((previous) =>
          previous ? { ...previous, prompt: null } : null,
        );
      }}
      onGenerate={() => void generate(artifact.trim())}
      onCopy={() => void copyPrompt()}
    />
  );
}
