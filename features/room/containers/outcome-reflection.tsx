"use client";
import { useEffect, useRef, useState } from "react";
import {
  type ReflectionContext,
  type ReflectionRequest,
  type ReflectionResponse,
  ReflectionResponseSchema,
} from "@/contracts/outcome-reflection";
import {
  OutcomeReflectionView,
  type ReflectionSection,
} from "../molecules/outcome-reflection-view";

export function OutcomeReflection({ roomId }: { roomId: string }) {
  const [section, setSection] = useState<ReflectionSection | null>(null);
  const [data, setData] = useState<ReflectionResponse | null>(null);
  const [context, setContext] = useState<ReflectionContext>({
    audience: "",
    situation: "",
  });
  const [artifact, setArtifact] = useState("");
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<ReflectionSection | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "success" | "failed">("idle");
  const request = useRef<AbortController | null>(null);
  const copyGeneration = useRef(0);
  const inFlight = useRef(false);
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

  async function send(
    input: ReflectionRequest | null,
  ): Promise<ReflectionResponse | undefined> {
    if (inFlight.current) return;
    inFlight.current = true;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(input?.action ?? "load");
    setError(null);
    setCopy("idle");
    copyGeneration.current++;
    try {
      const response = await fetch(
        `/api/completed-rooms/${encodeURIComponent(roomId)}/reflection`,
        {
          method: input ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          ...(input ? { body: JSON.stringify(input) } : {}),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          setData(null);
          throw new Error(
            "閲覧権限または閲覧期限を確認できません。成果を開き直してください。",
          );
        }
        if (response.status === 409 || response.status === 429) {
          const problem = await response.json();
          throw new Error(
            typeof problem.error === "string"
              ? problem.error
              : "最新版を取得して再試行してください。",
          );
        }
        throw new Error(
          input
            ? "生成できませんでした。保存済みの手順は残っています。もう一度お試しください。"
            : "保存された内容を読み込めませんでした。最新版を取得してください。",
        );
      }
      const result = ReflectionResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setData((previous) => ({
        ...result,
        prompt:
          result.prompt &&
          result.prompt.revision === result.shared.revision &&
          (!artifact.trim() || result.prompt.artifact === artifact.trim())
            ? result.prompt
            : null,
        competitionPrompt:
          result.competitionPrompt ??
          (previous?.shared.revision === result.shared.revision
            ? previous.competitionPrompt
            : null),
      }));
      setContext(result.shared.context);
      if (data?.shared.revision !== result.shared.revision) setStep(0);
      setArtifact(
        (previous) =>
          previous ||
          result.selectedArtifact ||
          result.prompt?.artifact ||
          (result.shared.result?.kind === "plan"
            ? result.shared.result.recommendation?.name
            : "") ||
          "",
      );
      return result;
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "読み込めませんでした。",
        );
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function open(next: ReflectionSection) {
    setSection(next);
    setCopy("idle");
    copyGeneration.current++;
    if (!data) await send(null);
  }
  async function updateResearch() {
    setConfirming(false);
    const result = await send({
      action: "research",
      revision: data?.shared.revision ?? 0,
      context,
    });
    if (result) {
      setEditing(false);
      setConfirming(false);
      setStep(0);
    }
  }
  async function copyPrompt() {
    const text =
      section === "competition"
        ? data?.competitionPrompt
        : data?.prompt?.content;
    if (!text) return;
    const generation = ++copyGeneration.current;
    try {
      await navigator.clipboard.writeText(text);
      if (generation === copyGeneration.current) setCopy("success");
    } catch {
      if (generation === copyGeneration.current) setCopy("failed");
    }
  }
  return (
    <OutcomeReflectionView
      section={section}
      data={data}
      context={context}
      artifact={artifact}
      step={step}
      editing={editing}
      confirming={confirming}
      busy={busy}
      error={error}
      copy={copy}
      onOpen={(next) => void open(next)}
      onClose={() => {
        setSection(null);
        setEditing(false);
        setCopy("idle");
        copyGeneration.current++;
      }}
      onRefresh={() => void send(null)}
      onStep={setStep}
      onContext={(field, value) =>
        setContext((previous) => ({ ...previous, [field]: value }))
      }
      onEdit={() => {
        setContext(data?.shared.context ?? { audience: "", situation: "" });
        setEditing(true);
      }}
      onCancelEdit={() => setEditing(false)}
      onResearch={() => {
        if (data?.shared.revision) setConfirming(true);
        else void updateResearch();
      }}
      onConfirm={() => void updateResearch()}
      onConfirming={setConfirming}
      onArtifact={(value) => {
        copyGeneration.current++;
        setArtifact(value);
        setCopy("idle");
        setData((previous) =>
          previous ? { ...previous, prompt: null } : null,
        );
      }}
      onGenerate={() => {
        if (data)
          void send({
            action: "artifact",
            revision: data.shared.revision,
            artifact: artifact.trim(),
          });
      }}
      onCompetition={() => {
        if (data)
          void send({ action: "competition", revision: data.shared.revision });
      }}
      onCopy={() => void copyPrompt()}
    />
  );
}
