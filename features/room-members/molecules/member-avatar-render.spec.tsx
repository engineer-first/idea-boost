import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "../logic/note-color";
import { MemberAvatar } from "./member-avatar";

describe("MemberAvatar", () => {
  it.each(NOTE_COLOR_PALETTE)("%s は付箋と同じ背景色を適用する", (color) => {
    render(
      <TooltipProvider>
        <MemberAvatar name={color} color={color} />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText(color)).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
      color: NOTE_COLOR_STYLES[color].foregroundColor,
    });
    expect(screen.getByLabelText(color)).toHaveClass("border-transparent");
  });

  it("投票完了時は名前とチェックを同時に示す", () => {
    render(
      <TooltipProvider>
        <MemberAvatar name="Yuki Tanaka" color="yellow" isVotingComplete />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText("Yuki Tanaka（投票完了）")).toBeVisible();
    expect(screen.getByTestId("member-voting-complete")).toBeVisible();
  });

  it("投票未完了時はチェックを表示しない", () => {
    render(
      <TooltipProvider>
        <MemberAvatar name="Yuki Tanaka" color="yellow" />
      </TooltipProvider>,
    );

    expect(
      screen.queryByTestId("member-voting-complete"),
    ).not.toBeInTheDocument();
  });
});
