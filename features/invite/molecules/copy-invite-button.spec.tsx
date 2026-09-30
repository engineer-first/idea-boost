import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyInviteButton } from "./copy-invite-button";

function stubClipboard(impl: () => Promise<void>) {
  const writeText = vi.fn(impl);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopyInviteButton", () => {
  it("value 自体を表示する", () => {
    render(
      <CopyInviteButton value="https://idea-flow.example/invite/ABC234" />,
    );
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toHaveTextContent("https://idea-flow.example/invite/ABC234");
  });

  it("クリックで value をクリップボードへ書き込む", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(
      <CopyInviteButton value="https://idea-flow.example/invite/ABC234" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" }));

    expect(writeText).toHaveBeenCalledWith(
      "https://idea-flow.example/invite/ABC234",
    );
  });

  it("招待コードも同じ UI でコピーできる", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<CopyInviteButton value="ABC234" itemLabel="招待コード" />);

    fireEvent.click(screen.getByRole("button", { name: "招待コードをコピー" }));

    expect(writeText).toHaveBeenCalledWith("ABC234");
    expect(
      screen.getByRole("button", { name: "招待コードをコピー" }),
    ).toHaveTextContent("ABC234");
  });

  it("コピー成功後は「コピーしました」に変わる", async () => {
    stubClipboard(() => Promise.resolve());
    render(
      <CopyInviteButton value="https://idea-flow.example/invite/ABC234" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /コピーしました/ }),
      ).toBeInTheDocument(),
    );
  });

  it("コピー拒否時は理由を知らせ、全文を選択して手動コピーでき、再試行できる", async () => {
    const writeText = stubClipboard(() => Promise.reject(new Error("denied")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const value = "https://idea-flow.example/invite/ABC234";
    render(<CopyInviteButton value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "コピーできませんでした",
    );
    const manual = screen.getByRole("textbox", {
      name: "招待URL（手動コピー）",
    });
    expect(manual).toHaveValue(value);
    expect(manual).toHaveFocus();
    expect((manual as HTMLInputElement).selectionStart).toBe(0);
    expect((manual as HTMLInputElement).selectionEnd).toBe(value.length);
    expect(
      screen.queryByRole("button", { name: "コピーしました" }),
    ).not.toBeInTheDocument();

    writeText.mockResolvedValueOnce();
    fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" }));
    await screen.findByRole("button", { name: "コピーしました" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("コピー失敗時はラベルを変えない（成功表示を出さない）", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(
      <CopyInviteButton value="https://idea-flow.example/invite/ABC234" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /コピーしました/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toHaveTextContent("https://idea-flow.example/invite/ABC234");
  });
});
