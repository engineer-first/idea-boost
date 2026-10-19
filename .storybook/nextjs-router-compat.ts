import type { Plugin } from "vite";

// Storybook 10.6.2 の App Router mock に Next.js 16.4 の必須値を補う。
// 上流と同じ修正: https://github.com/storybookjs/storybook/pull/36732
// この修正を含む Storybook の安定版へ更新したら、この plugin を削除する。
export function nextjsRouterCompat(): Plugin {
  return {
    name: "storybook-nextjs-router-compat",
    enforce: "pre",
    transform(source, id) {
      if (
        !id.replaceAll("\\", "/").includes("/@storybook/nextjs-vite/dist/") ||
        !source.includes("LayoutRouterContext.Provider")
      ) {
        return;
      }
      if (source.includes("parentRenderTree:")) return;
      const anchor = "parentCacheNode: newLazyCacheNode,";
      if (source.split(anchor).length !== 2) {
        throw new Error(
          "Storybook の App Router mock が変わりました。Next.js 互換 plugin を見直してください。",
        );
      }
      return {
        code: source.replace(
          anchor,
          `${anchor}\nparentRenderTree: { data: { bfcacheId: 0 } },`,
        ),
        map: null,
      };
    },
  };
}
