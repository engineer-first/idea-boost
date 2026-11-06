"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPersonalWritingStep, type RoomPhase } from "@/contracts/phase";
import type { TimerState } from "@/contracts/room-protocol";

type CharacterHintOptions = {
  phase: RoomPhase;
  timer: TimerState;
  serverOffsetMs: number;
  noteCount: number;
  active?: boolean;
};

const HINTS = {
  empty: "思いついたことを、まず1枚書いてみよう。",
  warning: "残り30秒、今の考えをまとめよう。",
  ended: "時間になったよ、次の工程をみんなで確認しよう。",
} as const;

const STEP_HINTS: Record<
  number,
  Record<number, readonly [string, string, string]>
> = {
  1: {
    1: [
      "最近困ったことを、1枚に1つずつ書こう。",
      "『誰が』『いつ』困るかを入れると伝わりやすいよ。",
      "小さな不便も、思い出して書いてみよう。",
    ],
    2: [
      "書いた課題を、順番にみんなへ伝えよう。",
      "困った場面を添えて話してみよう。",
      "気になる課題には、背景を聞いてみよう。",
    ],
    3: [
      "似ている課題を、近くに集めよう。",
      "共通する困りごとを探してみよう。",
      "まとまりに、伝わる名前を付けよう。",
    ],
    4: [
      "取り組みたい課題に、票を入れよう。",
      "誰の困りごとを解決したいか考えよう。",
      "解決したら嬉しい課題を選ぼう。",
    ],
    5: [
      "投票を見ながら、取り組む課題を決めよう。",
      "その課題を選ぶ理由を話してみよう。",
      "みんなが納得できるか確かめよう。",
    ],
  },
  2: {
    1: [
      "課題を、アイデアが広がる問いに変えよう。",
      "『どうすれば』で問いを始めてみよう。",
      "答えを決めつけず、可能性を広げよう。",
    ],
    2: [
      "考えた問いを、みんなで共有しよう。",
      "どんな答えが出そうか話してみよう。",
      "問いの違いや共通点を見つけよう。",
    ],
    3: [
      "アイデアを広げたい問いに、票を入れよう。",
      "課題の解決につながるか考えよう。",
      "いろいろな答えが浮かぶ問いを選ぼう。",
    ],
    4: [
      "投票を見ながら、取り組む問いを決めよう。",
      "問いが指す相手や場面を確かめよう。",
      "みんなで同じ問いを見て進めよう。",
    ],
  },
  3: {
    1: [
      "問いへのアイデアを、1枚に1つずつ書こう。",
      "実現できるかは後で考えて、広げよう。",
      "身近な工夫を組み合わせてみよう。",
    ],
    2: [
      "アイデアを共有して、似たものを集めよう。",
      "ほかの人の案に、工夫を足してみよう。",
      "似た案の違いにも目を向けよう。",
    ],
    3: [
      "価値と実現のしやすさで、案を並べよう。",
      "誰にどんな嬉しさがあるか考えよう。",
      "試すために必要な手間を比べよう。",
    ],
    4: [
      "試してみたいアイデアに、票を入れよう。",
      "課題への効果を思い浮かべよう。",
      "小さく試せる案にも注目しよう。",
    ],
    5: [
      "投票を見ながら、取り組む案を決めよう。",
      "選ぶ理由を、みんなで話してみよう。",
      "最初に試す一歩を考えよう。",
    ],
  },
};

export function useCharacterHint({
  phase,
  timer,
  serverOffsetMs,
  noteCount,
  active = true,
}: CharacterHintOptions): { message: string | null; replay: () => void } {
  const [message, setMessage] = useState<string | null>(null);
  const lastMessage = useRef<string | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const stepHints =
    phase.kind === "step" ? STEP_HINTS[phase.phase]?.[phase.step] : undefined;
  const seen = useRef(new Set<string>());
  const tipIndex = useRef(1);
  const nextTipAt = useRef(0);
  const startedAt = useRef(Date.now());
  const show = useCallback((text: string) => {
    clearTimeout(hideTimeout.current);
    lastMessage.current = text;
    setMessage(text);
    hideTimeout.current = setTimeout(() => setMessage(null), 8_000);
  }, []);

  useEffect(() => {
    seen.current.clear();
    tipIndex.current = 1;
    nextTipAt.current = Date.now() + 60_000;
    startedAt.current = Date.now();
    lastMessage.current = null;
    clearTimeout(hideTimeout.current);
    setMessage(null);
    if (active) {
      const opening = stepHints?.[0];
      if (opening) show(opening);
    }
    // タイマーや付箋の更新では開始案内を再送しない。
  }, [stepHints, active, show]);

  useEffect(() => {
    if (timer.status === "running") nextTipAt.current = Date.now() + 60_000;
  }, [timer.status]);

  useEffect(() => {
    if (!active || phase.kind === "lobby") {
      clearTimeout(hideTimeout.current);
      setMessage(null);
      return;
    }
    const check = () => {
      const remaining =
        timer.status === "running"
          ? timer.endsAt - (Date.now() + serverOffsetMs)
          : null;
      const kind =
        timer.status === "ended" || (remaining !== null && remaining <= 0)
          ? "ended"
          : remaining !== null && remaining <= 30_000
            ? "warning"
            : timer.status === "running" &&
                isPersonalWritingStep(phase) &&
                noteCount === 0 &&
                Date.now() - startedAt.current >= 30_000
              ? "empty"
              : null;
      if (kind && !seen.current.has(kind)) {
        seen.current.add(kind);
        nextTipAt.current = Math.max(nextTipAt.current, Date.now() + 8_000);
        show(HINTS[kind]);
        return;
      }
      if (
        timer.status === "ended" ||
        (remaining !== null && remaining <= 30_000)
      )
        return;
      if (timer.status === "running" && Date.now() >= nextTipAt.current) {
        const tip = STEP_HINTS[phase.phase]?.[phase.step]?.[tipIndex.current];
        if (tip) {
          tipIndex.current += 1;
          nextTipAt.current = Date.now() + 60_000;
          show(tip);
        }
      }
    };
    check();
    const interval = setInterval(check, 1_000);
    return () => clearInterval(interval);
  }, [active, phase, timer, serverOffsetMs, noteCount, show]);

  useEffect(() => () => clearTimeout(hideTimeout.current), []);
  const replay = useCallback(() => {
    if (active && lastMessage.current) show(lastMessage.current);
  }, [active, show]);
  return { message, replay };
}
