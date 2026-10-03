import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingPresenter } from "./sharing-presenter";

describe("SharingPresenter", () => {
  it.each([
    { startsAt: 2_000, expected: "まもなく発表" },
    { startsAt: null, expected: "発表中" },
  ])("開始予告と発表中は発表者名と全体の順番だけを示す ($startsAt)", ({
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
      `${expected}：${sharing.order[1].name}`,
    );
    expect(trigger).toHaveTextContent("2/3");
  });
});

it("共有順に含まれない途中参加者も選べ、退出者は選べない", () => {
  const sharing = buildSharingState();
  const current = sharing.order[0];
  const late = {
    userId: "44444444-4444-4444-8444-444444444444",
    name: "途中参加",
    color: "blue" as const,
  };
  const onSelectHostTarget = vi.fn();
  render(
    <TooltipProvider>
      <SharingPresenter
        sharing={sharing}
        hostUserId={current.userId}
        currentUserId={current.userId}
        members={[current, late]}
        onSelectHostTarget={onSelectHostTarget}
      />
    </TooltipProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "発表者と全体の順番を確認" }),
  );
  expect(
    screen.queryByRole("button", { name: sharing.order[1].name }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "途中参加" }));
  expect(onSelectHostTarget).toHaveBeenCalledExactlyOnceWith(late.userId);
});
