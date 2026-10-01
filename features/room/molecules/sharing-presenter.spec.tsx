import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingPresenter } from "./sharing-presenter";

describe("SharingPresenter", () => {
  it.each([
    { startsAt: 2_000, expected: "まもなく発表" },
    { startsAt: null, expected: "発表中" },
  ])("開始予告と発表中を読み分け、現在と次の人を入口で確認できる ($startsAt)", ({
    startsAt,
    expected,
  }) => {
    const sharing = buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
      startsAt,
    });
    render(
      <TooltipProvider>
        <SharingPresenter
          sharing={sharing}
          hostUserId={sharing.order[0].userId}
        />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", {
      name: "発表者と全体の順番を確認",
    });
    expect(trigger).toHaveAccessibleDescription(
      expect.stringContaining(`${expected}：${sharing.order[1].name}`),
    );
    expect(trigger).toHaveAccessibleDescription(
      expect.stringContaining(`次 ${sharing.order[2].name}`),
    );
  });
});
