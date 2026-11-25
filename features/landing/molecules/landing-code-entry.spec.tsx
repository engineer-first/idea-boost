import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LandingCodeEntry } from "./landing-code-entry";

const push = vi.fn();
beforeEach(() => push.mockReset());
afterEach(cleanup);

function submitCode(code: string) {
  fireEvent.change(
    screen.getByRole("textbox", { name: "招待コードをお持ちの方" }),
    {
      target: { value: code },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "参加する" }));
}

it.each(["ABC234", " abc234 "])(
  "LP で入力した招待コード %s から、正規化した招待の参加確認へ進む",
  async (code) => {
    render(<LandingCodeEntry navigate={push} />);
    submitCode(code);
    await waitFor(() =>
      expect(push).toHaveBeenCalledExactlyOnceWith("/invite/ABC234"),
    );
  },
);

it("6桁そろうまで参加は押せず、形式が違えば入力欄を離れたときに直し方を示す", () => {
  render(<LandingCodeEntry navigate={push} />);
  const input = screen.getByRole("textbox", { name: "招待コードをお持ちの方" });
  fireEvent.change(input, { target: { value: "AB!2" } });
  expect(screen.getByRole("button", { name: "参加する" })).toBeDisabled();
  fireEvent.blur(input);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "英数字6桁で入力してください。",
  );
});

it("英語の LP では英語で案内する", () => {
  render(<LandingCodeEntry locale="en" navigate={push} />);
  expect(
    screen.getByRole("textbox", { name: "Have an invitation code?" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
});

it("戻るでページが復元されたら、もう一度コードを送れる", () => {
  render(<LandingCodeEntry navigate={push} />);
  submitCode("ABC234");
  expect(screen.getByRole("button", { name: "移動中…" })).toBeDisabled();

  const restored = Object.assign(new Event("pageshow"), { persisted: true });
  act(() => {
    window.dispatchEvent(restored);
  });
  expect(screen.getByRole("button", { name: "参加する" })).toBeEnabled();
});

it("空のまま入力欄を離れても、直し方は出さない", () => {
  render(<LandingCodeEntry navigate={push} />);
  fireEvent.blur(
    screen.getByRole("textbox", { name: "招待コードをお持ちの方" }),
  );
  expect(screen.getByRole("button", { name: "参加する" })).toBeDisabled();
  expect(screen.queryByRole("alert")).toBeNull();
});
