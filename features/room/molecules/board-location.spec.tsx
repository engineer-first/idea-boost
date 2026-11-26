import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardLocation } from "./board-location";

type Listener = (event: { matches: boolean }) => void;

function stubWideQuery(initial: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initial,
    media: "(width >= 900px)",
    addEventListener: (_: string, listener: Listener) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) =>
      listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return {
    widen(): void {
      query.matches = true;
      for (const listener of listeners) listener({ matches: true });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("現在地カード", () => {
  it("狭い画面で開いたまま広い画面へ変わると、隠れたカードを閉じて Escape を他の操作へ渡す", () => {
    const media = stubWideQuery(false);
    render(<BoardLocation phase={buildPhaseStep(1, 2)} narrowOnly />);
    const trigger = screen.getByTestId("board-location-trigger");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    act(() => media.widen());

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const escapeKey = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    document.dispatchEvent(escapeKey);
    expect(escapeKey.defaultPrevented).toBe(false);
  });

  it("広い画面でも出すカードは、幅が変わっても開いたまま保つ", () => {
    const media = stubWideQuery(false);
    render(<BoardLocation phase={buildPhaseStep(1, 2)} />);
    const trigger = screen.getByTestId("board-location-trigger");
    fireEvent.click(trigger);

    act(() => media.widen());

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
