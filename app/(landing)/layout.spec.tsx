import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const zen = vi.hoisted(() =>
  vi.fn((_options: Record<string, unknown>) => ({ variable: "zen-display" })),
);
vi.mock("next/font/google", () => ({ Zen_Maru_Gothic: zen }));

it("LPの子にだけswapのZen Maru Gothic 700を提供する", async () => {
  vi.resetModules();
  const { default: LandingLayout } = await import("./layout");
  render(
    <LandingLayout>
      <main>LP</main>
    </LandingLayout>,
  );
  expect(screen.getByRole("main").parentElement).toHaveClass("zen-display");
  expect(zen).toHaveBeenCalledWith({
    weight: "700",
    display: "swap",
    preload: false,
    variable: "--font-zen-maru-gothic",
  });
});
