import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

import GuidePage, { generateMetadata } from "./page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

it("公開している解説は本文と、検索に出す metadata を返す", async () => {
  render(await GuidePage(params("hackathon-idea")));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "ハッカソンのアイデアの決め方",
  );
  expect((await generateMetadata(params("hackathon-idea"))).robots).toEqual({
    index: true,
    follow: true,
  });
});

it("知らない slug は 404 にし、検索に出す metadata を付けない", async () => {
  await expect(GuidePage(params("no-such-guide"))).rejects.toThrow("notFound");
  expect(await generateMetadata(params("no-such-guide"))).toEqual({});
});
