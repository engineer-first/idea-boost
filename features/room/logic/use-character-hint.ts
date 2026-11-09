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

// タイマー開始からの経過時間。この時刻にコツを1つずつ出す。
const TIP_TIMES_MS = [30_000, 90_000, 180_000] as const;

const STEP_HINTS: Record<
  number,
  Record<number, readonly [string, string, string, string]>
> = {
  1: {
    1: [
      "最近困ったことを、1枚に1つずつ書こう。",
      "『誰が』『いつ』困るかを入れると伝わりやすいよ。",
      "小さな不便も、思い出して書いてみよう。",
      "家・学校・移動中の場面を思い出そう。",
    ],
    2: [
      "書いた課題を、順番にみんなへ伝えよう。",
      "困った場面を添えて話してみよう。",
      "気になる課題には、背景を聞いてみよう。",
      "同じ経験がある課題を探してみよう。",
    ],
    3: [
      "似ている課題を、近くに集めよう。",
      "共通する困りごとを探してみよう。",
      "まとまりに、伝わる名前を付けよう。",
      "迷う付箋は、いったん外に置いておこう。",
    ],
    4: [
      "取り組みたい課題に、票を入れよう。",
      "誰の困りごとを解決したいか考えよう。",
      "解決したら嬉しい課題を選ぼう。",
      "票の数を見て、最後まで使い切ろう。",
    ],
    5: [
      "投票を見ながら、取り組む課題を決めよう。",
      "その課題を選ぶ理由を話してみよう。",
      "みんなが納得できるか確かめよう。",
      "票が割れたら、それぞれの理由を聞こう。",
    ],
  },
  2: {
    1: [
      "課題を、アイデアが広がる問いに変えよう。",
      "『どうすれば』で問いを始めてみよう。",
      "答えを決めつけず、可能性を広げよう。",
      "問いの相手を『誰が』で具体的にしよう。",
    ],
    2: [
      "考えた問いを、みんなで共有しよう。",
      "どんな答えが出そうか話してみよう。",
      "問いの違いや共通点を見つけよう。",
      "答えたくなる問いはどれか話そう。",
    ],
    3: [
      "アイデアを広げたい問いに、票を入れよう。",
      "課題の解決につながるか考えよう。",
      "いろいろな答えが浮かぶ問いを選ぼう。",
      "票の数を見て、最後まで使い切ろう。",
    ],
    4: [
      "投票を見ながら、取り組む問いを決めよう。",
      "問いが指す相手や場面を確かめよう。",
      "みんなで同じ問いを見て進めよう。",
      "票が割れたら、それぞれの理由を聞こう。",
    ],
  },
  3: {
    1: [
      "問いへのアイデアを、1枚に1つずつ書こう。",
      "実現できるかは後で考えて、広げよう。",
      "身近な工夫を組み合わせてみよう。",
      "質より数、まずはたくさん出そう。",
    ],
    2: [
      "アイデアを共有して、似たものを集めよう。",
      "ほかの人の案に、工夫を足してみよう。",
      "似た案の違いにも目を向けよう。",
      "案の良いところを、ひとこと伝えよう。",
    ],
    3: [
      "価値と実現のしやすさで、案を並べよう。",
      "誰にどんな嬉しさがあるか考えよう。",
      "試すために必要な手間を比べよう。",
      "迷う案は、真ん中に置いて話そう。",
    ],
    4: [
      "試してみたいアイデアに、票を入れよう。",
      "課題への効果を思い浮かべよう。",
      "小さく試せる案にも注目しよう。",
      "票の数を見て、最後まで使い切ろう。",
    ],
    5: [
      "投票を見ながら、取り組む案を決めよう。",
      "選ぶ理由を、みんなで話してみよう。",
      "最初に試す一歩を考えよう。",
      "票が割れたら、それぞれの理由を聞こう。",
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
  // 再表示でも8秒を数え直すよう、表示ごとに新しいオブジェクトにする。
  const [hint, setHint] = useState<{ text: string } | null>(null);
  const lastMessage = useRef<string | null>(null);
  const stepHints =
    phase.kind === "step" ? STEP_HINTS[phase.phase]?.[phase.step] : undefined;
  const seen = useRef(new Set<string>());
  // 出し終えたコツの数。null は工程に入ってからまだ数えていない状態。
  const shownTips = useRef<number | null>(null);
  const startedAt = useRef(Date.now());
  const show = useCallback((text: string) => {
    lastMessage.current = text;
    setHint({ text });
  }, []);

  // 非表示タイマーを表示状態に連動させ、StrictModeの再実行でも登録し直す。
  useEffect(() => {
    if (!hint) return;
    const timeout = setTimeout(() => setHint(null), 8_000);
    return () => clearTimeout(timeout);
  }, [hint]);

  useEffect(() => {
    seen.current.clear();
    shownTips.current = null;
    startedAt.current = Date.now();
    lastMessage.current = null;
    setHint(null);
    if (active) {
      const opening = stepHints?.[0];
      if (opening) show(opening);
    }
    // タイマーや付箋の更新では開始案内を再送しない。
  }, [stepHints, active, show]);

  useEffect(() => {
    if (!active || phase.kind === "lobby") {
      setHint(null);
      return;
    }
    const check = () => {
      const remaining =
        timer.status === "running"
          ? timer.endsAt - (Date.now() + serverOffsetMs)
          : null;
      const elapsed =
        timer.status === "running" && remaining !== null
          ? timer.durationMs - remaining
          : null;
      const dueTips =
        elapsed === null
          ? 0
          : TIP_TIMES_MS.filter((at) => elapsed >= at).length;
      // 途中から見始めた場合、過ぎたコツはまとめて出さない。
      if (timer.status === "running" && shownTips.current === null)
        shownTips.current = dueTips;
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
        // 同じ時刻のコツは、優先の一言で置き換える。
        shownTips.current = dueTips;
        show(HINTS[kind]);
        return;
      }
      if (
        timer.status === "ended" ||
        (remaining !== null && remaining <= 30_000)
      )
        return;
      if (shownTips.current !== null && dueTips > shownTips.current) {
        shownTips.current = dueTips;
        const tip = stepHints?.[dueTips];
        if (tip) show(tip);
      }
    };
    check();
    const interval = setInterval(check, 1_000);
    return () => clearInterval(interval);
  }, [active, phase, timer, serverOffsetMs, noteCount, show, stepHints]);

  const replay = useCallback(() => {
    if (active && lastMessage.current) show(lastMessage.current);
  }, [active, show]);
  return { message: hint?.text ?? null, replay };
}
