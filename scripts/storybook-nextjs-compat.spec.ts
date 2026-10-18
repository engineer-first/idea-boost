import { expect, it } from "vitest";
import { nextjsRouterCompat } from "../.storybook/nextjs-router-compat";

const providerId =
  "/node_modules/@storybook/nextjs-vite/dist/_browser-chunks/provider.js";
const provider =
  "LayoutRouterContext.Provider, { value: { parentCacheNode: newLazyCacheNode, } }";

function transform(source: string, id: string) {
  const hook = nextjsRouterCompat().transform;
  if (typeof hook !== "function")
    throw new Error("transform hook がありません");
  return Reflect.apply(hook, {}, [source, id]);
}

it("App Router mock に Next.js が参照するキャッシュ識別子を補う", () => {
  expect(transform(provider, providerId)).toMatchObject({
    code: expect.stringContaining(
      "parentRenderTree: { data: { bfcacheId: 0 } }",
    ),
  });
});

it("アプリ本体や上流で修正済みの provider は変更しない", () => {
  expect(transform(provider, "/app/provider.tsx")).toBeUndefined();
  expect(
    transform(`${provider}\nparentRenderTree: existingTree`, providerId),
  ).toBeUndefined();
});

it("上流の mock 構造が変わって修正できないときはビルドを失敗させる", () => {
  expect(() => transform("LayoutRouterContext.Provider", providerId)).toThrow(
    "Next.js 互換 plugin を見直してください",
  );
});
