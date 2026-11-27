"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/contracts/app-locale";
import { isPersonalWritingStep, type RoomPhase } from "@/contracts/phase";
import type { TimerState } from "@/contracts/room-protocol";
import type { SharingTimeUpRole } from "./sharing-time-up-role";

type CharacterHintOptions = {
  phase: RoomPhase;
  timer: TimerState;
  serverOffsetMs: number;
  noteCount: number;
  active?: boolean;
  tipsEnabled?: boolean;
  // 共有工程の時間切れの一言を、発表者・聞く側・共有の終了で言い分ける。
  sharingRole?: SharingTimeUpRole;
  // 一言を出す言語。参加者ごとの表示言語に合わせる。
  locale?: AppLocale;
};

const HINTS_JA = {
  empty: "思いついたことを、まず1枚書いてみよう。",
  warning: "残り30秒、今の考えをまとめよう。",
  ended: "時間になったよ、次の工程をみんなで確認しよう。",
  sharingEndedPresenter: "時間になったよ、次の人にバトンを渡そう。",
  sharingEndedListener: "時間になったよ、発表を最後まで聞こう。",
  // 最後の人の交代で共有が終わると、タイマーも終了になる。時間切れとは言わない。
  sharingFinished: "みんな発表したよ、次のステップへ進もう。",
} as const;

const HINTS_EN: Record<keyof typeof HINTS_JA, string> = {
  empty: "Start by writing one note about anything that comes to mind.",
  warning: "30 seconds left. Wrap up what you are thinking.",
  ended: "Time is up. Check the next step together.",
  sharingEndedPresenter: "Time is up. Pass the turn to the next person.",
  sharingEndedListener: "Time is up. Listen to the end of the presentation.",
  sharingFinished: "Everyone has presented. Move on to the next step.",
};

// タイマー開始からの経過時間。この時刻にコツを1つずつ出す。
const TIP_TIMES_MS = [30_000, 90_000, 180_000] as const;

type StepHints = Record<
  number,
  Record<number, readonly [string, string, string, string]>
>;

const STEP_HINTS_JA: StepHints = {
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
      "アイデアを話しながら、2軸マップへ置こう。",
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

const STEP_HINTS_EN: StepHints = {
  1: {
    1: [
      "Write down recent frustrations, one per note.",
      "Adding who is affected and when makes it easier to understand.",
      "Small inconveniences count too. Try to recall them.",
      "Think of moments at home, at school, or on the move.",
    ],
    2: [
      "Take turns telling everyone the challenges you wrote.",
      "Describe the situation where it was a problem.",
      "Ask about the background of a challenge that interests you.",
      "Look for challenges you have experienced too.",
    ],
    3: [
      "Gather similar challenges close together.",
      "Look for the frustration they have in common.",
      "Give each group a name that explains it.",
      "Set aside notes you are unsure about for now.",
    ],
    4: [
      "Vote for the challenges you want to work on.",
      "Think about whose problem you want to solve.",
      "Choose challenges that would feel great to solve.",
      "Check your remaining votes and use them all.",
    ],
    5: [
      "Look at the votes and decide which challenge to work on.",
      "Talk about why you would choose that challenge.",
      "Check that everyone is comfortable with the choice.",
      "If the votes are split, hear the reasons on each side.",
    ],
  },
  2: {
    1: [
      "Turn the challenge into a question that opens up ideas.",
      "Try starting your question with “How might we”.",
      "Keep possibilities open instead of fixing the answer.",
      "Make it specific by saying who the question is for.",
    ],
    2: [
      "Share the questions you came up with.",
      "Talk about what kinds of answers each might lead to.",
      "Find the differences and common points between questions.",
      "Discuss which question makes you want to answer it.",
    ],
    3: [
      "Vote for the questions you want to explore with ideas.",
      "Consider whether it leads to solving the challenge.",
      "Choose questions that bring many answers to mind.",
      "Check your remaining votes and use them all.",
    ],
    4: [
      "Look at the votes and decide which question to work on.",
      "Confirm who and what situation the question points to.",
      "Move forward with everyone looking at the same question.",
      "If the votes are split, hear the reasons on each side.",
    ],
  },
  3: {
    1: [
      "Write ideas for the question, one per note.",
      "Think about feasibility later. Go wide for now.",
      "Try combining everyday tricks you already know.",
      "Quantity over quality. Get lots of ideas out first.",
    ],
    2: [
      "Talk through your ideas as you place them on the map.",
      "Build on other people’s ideas with your own twist.",
      "Notice the differences between similar ideas.",
      "Say one thing you like about an idea.",
    ],
    3: [
      "Arrange the ideas by value and feasibility.",
      "Think about who benefits and how.",
      "Compare the effort needed to try each one.",
      "Put ideas you are unsure about in the middle and discuss.",
    ],
    4: [
      "Vote for the ideas you want to try.",
      "Picture the effect each would have on the challenge.",
      "Pay attention to ideas you can try in a small way.",
      "Check your remaining votes and use them all.",
    ],
    5: [
      "Look at the votes and decide which idea to pursue.",
      "Talk together about why you would choose it.",
      "Think about the first step to try.",
      "If the votes are split, hear the reasons on each side.",
    ],
  },
};

export function useCharacterHint({
  phase,
  timer,
  serverOffsetMs,
  noteCount,
  active = true,
  tipsEnabled = true,
  sharingRole = "presenter",
  locale = "ja",
}: CharacterHintOptions): { message: string | null } {
  // 同じ文言の案内でも15秒を数え直すよう、表示ごとに新しいオブジェクトにする。
  // timed は残り時間・時間切れの案内。次のタイマーでは古くなるので印を付ける。
  const [hint, setHint] = useState<{ text: string; timed: boolean } | null>(
    null,
  );
  const stepHints =
    tipsEnabled && phase.kind === "step"
      ? (locale === "en" ? STEP_HINTS_EN : STEP_HINTS_JA)[phase.phase]?.[
          phase.step
        ]
      : undefined;
  const hints = locale === "en" ? HINTS_EN : HINTS_JA;
  const seen = useRef(new Set<string>());
  // 出し終えたコツの数。null は工程に入ってからまだ数えていない状態。
  const shownTips = useRef<number | null>(null);
  const startedAt = useRef(Date.now());
  const previousTimer = useRef<{
    status: TimerState["status"];
    elapsed: number | null;
  } | null>(null);
  const show = useCallback((text: string, timed = false) => {
    setHint({ text, timed });
  }, []);

  // 非表示タイマーを表示状態に連動させ、StrictModeの再実行でも登録し直す。
  useEffect(() => {
    if (!hint) return;
    const timeout = setTimeout(() => setHint(null), 15_000);
    return () => clearTimeout(timeout);
  }, [hint]);

  useEffect(() => {
    previousTimer.current = null;
    seen.current.clear();
    shownTips.current = null;
    startedAt.current = Date.now();
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
      const previous = previousTimer.current;
      const isNewTimer =
        timer.status === "running" &&
        previous !== null &&
        (previous.status === "idle" ||
          previous.status === "ended" ||
          (previous.status === "running" &&
            previous.elapsed !== null &&
            elapsed !== null &&
            previous.elapsed - elapsed >= 2_000));
      previousTimer.current = { status: timer.status, elapsed };
      if (isNewTimer) {
        // 0枚の案内は工程に1回。時間に関する案内とコツだけを数え直す。
        seen.current.delete("warning");
        seen.current.delete("ended");
        seen.current.delete("sharingFinished");
        shownTips.current = null;
        // 前の番の残り時間・時間切れの案内を、次の番に持ち越さない。
        setHint((current) => (current?.timed ? null : current));
      }
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
            : tipsEnabled &&
                timer.status === "running" &&
                isPersonalWritingStep(phase) &&
                noteCount === 0 &&
                Date.now() - startedAt.current >= 30_000
              ? "empty"
              : null;
      const isSharingStep = phase.kind === "step" && phase.step === 2;
      // 時間切れの一言を出した後に最後の人が終えても、共有の完了は別に知らせる。
      const seenKey =
        kind === "ended" && isSharingStep && sharingRole === "finished"
          ? "sharingFinished"
          : kind;
      if (kind && seenKey && !seen.current.has(seenKey)) {
        seen.current.add(seenKey);
        // 完了の後に途中参加で共有が戻っても、同じタイマーの時間切れは言わない。
        if (seenKey === "sharingFinished") seen.current.add("ended");
        // 同じ時刻のコツは、優先の一言で置き換える。
        shownTips.current = dueTips;
        show(
          seenKey === "sharingFinished"
            ? hints.sharingFinished
            : kind === "ended" && isSharingStep
              ? sharingRole === "presenter"
                ? hints.sharingEndedPresenter
                : hints.sharingEndedListener
              : hints[kind],
          kind !== "empty",
        );
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
  }, [
    active,
    phase,
    timer,
    serverOffsetMs,
    noteCount,
    show,
    stepHints,
    hints,
    tipsEnabled,
    sharingRole,
  ]);

  return { message: hint?.text ?? null };
}
