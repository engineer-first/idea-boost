import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ROOM_PHASE_STEP_LABELS } from "@/contracts/phase";
import appEn from "@/messages/en/app.json";
import appJa from "@/messages/ja/app.json";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { LobbyFlowGuide } from "./lobby-flow-guide";

const language = vi.hoisted(() => ({ value: "ja" as "ja" | "en" }));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => language.value,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: language.value,
        messages: { app: language.value === "en" ? appEn : appJa },
        namespace: namespace as never,
      }),
  };
});

afterEach(() => {
  language.value = "ja";
});

it("全体の流れのステップ名とやることは、進行の定義と同じ文言で示す", () => {
  render(<LobbyFlowGuide />);
  const guide = screen.getByTestId("lobby-flow-guide");
  for (const phase of [1, 2, 3] as const) {
    const labels: Record<number, string> = ROOM_PHASE_STEP_LABELS[phase];
    for (const [step, label] of Object.entries(labels)) {
      const action = getFacilitationGuide({
        kind: "step",
        phase,
        step: Number(step),
      } as Parameters<typeof getFacilitationGuide>[0])?.action;
      expect(guide).toHaveTextContent(label);
      expect(guide).toHaveTextContent(action ?? "");
    }
  }
});

it.each([
  ["ja", "「できた！」", "「次のステップへ」"],
  ["en", "“Done!”", "“Next step”"],
] as const)(
  "押すボタンの名前を、表示言語 %s の引用符で読み上げる",
  (locale, ready, next) => {
    language.value = locale;
    render(<LobbyFlowGuide />);
    const guide = screen.getByTestId("lobby-flow-guide");
    expect(guide).toHaveTextContent(ready);
    expect(guide).toHaveTextContent(next);
    if (locale === "en") expect(guide.textContent).not.toMatch(/[「」]/);
  },
);
