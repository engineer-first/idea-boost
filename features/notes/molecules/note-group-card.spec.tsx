import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RenderGroup } from "@/contracts/grouping";
import { NoteGroupCard } from "./note-group-card";

const baseGroup: RenderGroup = {
  id: "group-1",
  name: "課題グループ",
  x: 84,
  y: 84,
  width: 448,
  height: 298,
  hue: 210,
};

function setup(overrides: Partial<Parameters<typeof NoteGroupCard>[0]> = {}) {
  const props = {
    group: baseGroup,
    name: baseGroup.name,
    canGroupNote: true,
    onUpdateName: vi.fn(),
    ...overrides,
  };

  const view = render(<NoteGroupCard {...props} />);

  return { props, view };
}

describe("NoteGroupCard", () => {
  it("グループ枠の破線を濃くし、背景色を強める", () => {
    setup();

    expect(screen.getByTestId("note-group-card")).toHaveClass(
      "border-2",
      "border-dashed",
      "border-[hsl(var(--group-hue),65%,42%)]",
      "bg-[hsla(var(--group-hue),65%,55%,0.07)]",
    );
  });

  it.each([
    {
      label: "仮グループ",
      group: { ...baseGroup, id: "temp-note-1,note-2", isTemp: true },
      name: "グループ",
    },
    {
      label: "保存済みグループ",
      group: { ...baseGroup, persistentGroupId: "persistent-1" },
      name: "重要な課題",
    },
  ])("$labelの見出しを18px・800・濃色で表示する", ({ group, name }) => {
    setup({ group, name });

    expect(screen.getByTestId("group-name-display")).toHaveClass(
      "text-lg",
      "font-extrabold",
      "text-[hsl(var(--group-hue),75%,25%)]",
    );
  });

  it("編集欄も表示見出しと同じ文字装飾にし、幅と最大文字数を保つ", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: baseGroup.name }));

    expect(screen.getByTestId("group-name-input")).toHaveClass(
      "w-48",
      "text-lg",
      "font-extrabold",
      "text-[hsl(var(--group-hue),75%,25%)]",
    );
    expect(screen.getByTestId("group-name-input")).toHaveAttribute(
      "maxlength",
      "50",
    );
  });

  it("編集可能な見出しだけに、hoverとfocusで現れる装飾用Pencilを表示する", () => {
    const { view } = setup();

    expect(screen.getByTestId("group-name-pencil")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByTestId("group-name-pencil")).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-visible:opacity-100",
    );

    view.rerender(
      <NoteGroupCard
        group={baseGroup}
        name={baseGroup.name}
        canGroupNote={false}
        onUpdateName={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("group-name-pencil")).not.toBeInTheDocument();
  });

  it("閲覧専用では編集可能に見える意味付けを付けない", () => {
    setup({ canGroupNote: false });

    const heading = screen.getByTestId("group-name-display");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(heading.closest("[tabindex]")).toBeNull();
    expect(heading.closest(".cursor-pointer")).toBeNull();
  });

  it("50文字の名前を2行で省略し、枠の上側で全文を確認できる", async () => {
    const user = userEvent.setup();
    const longName = "あ".repeat(50);
    setup({ name: longName, group: { ...baseGroup, name: longName } });

    const heading = screen.getByRole("button", { name: longName });
    const display = screen.getByTestId("group-name-display");
    expect(display).toHaveTextContent(longName);
    expect(display).toHaveClass("line-clamp-2", "break-words");
    expect(heading).toHaveClass("w-full");
    expect(screen.getByTestId("group-name-container")).toHaveClass(
      "bottom-full",
      "w-48",
      "max-w-[calc(100%-1.5rem)]",
    );

    await user.hover(heading);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName);
  });

  it.each([
    "click",
    "Enter",
    " ",
  ] as const)("%sで編集を開始できる", (action) => {
    setup();
    const heading = screen.getByRole("button", { name: baseGroup.name });

    if (action === "click") {
      fireEvent.click(heading);
    } else {
      fireEvent.keyDown(heading, { key: action });
    }

    expect(screen.getByTestId("group-name-input")).toBeInTheDocument();
  });

  it.each([
    "Enter",
    "blur",
  ] as const)("%sで前後空白を除いて確定する", (action) => {
    const onUpdateName = vi.fn();
    setup({ onUpdateName });
    fireEvent.click(screen.getByRole("button", { name: baseGroup.name }));
    const input = screen.getByTestId("group-name-input");
    fireEvent.change(input, { target: { value: "  更新した名前  " } });

    if (action === "Enter") {
      fireEvent.keyDown(input, { key: "Enter" });
    } else {
      fireEvent.blur(input);
    }

    expect(onUpdateName).toHaveBeenCalledOnce();
    expect(onUpdateName).toHaveBeenCalledWith("更新した名前");
  });

  it("Escapeで編集を取り消す", () => {
    const onUpdateName = vi.fn();
    setup({ onUpdateName });
    fireEvent.click(screen.getByRole("button", { name: baseGroup.name }));
    const input = screen.getByTestId("group-name-input");
    fireEvent.change(input, { target: { value: "破棄する名前" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onUpdateName).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: baseGroup.name }),
    ).toBeInTheDocument();
  });
});
