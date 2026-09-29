import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VerificationConsole } from "./verification-console";

afterEach(() => vi.unstubAllGlobals());

it("Ownerは成果一覧を通常のURLで開き、秘密値を取得しない", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ active: null }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<VerificationConsole initialActive={null} isOwner />);
  expect(screen.getByRole("link", { name: "成果一覧を開く" })).toHaveAttribute(
    "href",
    "/shared-outcomes",
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(
    fetcher.mock.calls.some(([path]) => String(path).includes("outcomes-link")),
  ).toBe(false);
});

it("Owner以外は一覧導線を表示しない", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ active: null })),
  );
  render(<VerificationConsole initialActive={null} isOwner={false} />);
  expect(
    screen.queryByRole("link", { name: "成果一覧を開く" }),
  ).not.toBeInTheDocument();
});
