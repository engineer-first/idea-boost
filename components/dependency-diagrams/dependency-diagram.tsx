import { useEffect, useId, useState } from "react";
import {
  type DependencyDiagramState,
  DependencyDiagramView,
} from "./dependency-diagram-view";

type DependencyDiagramProps = {
  title: string;
  description: string;
  src: string;
};

// deps:diagrams（storybook 起動時に自動実行）が生成した mermaid テキストを
// 静的アセットから取得し、ブラウザ側で SVG にレンダリングして表示する
// コンテナ。mermaid はバンドルが大きいので動的 import で遅延させる。
export function DependencyDiagram({
  title,
  description,
  src,
}: DependencyDiagramProps) {
  const [state, setState] = useState<DependencyDiagramState>({
    kind: "loading",
  });
  const reactId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const definition = await response.text();
        const mermaid = (await import("mermaid")).default;
        // Mermaid 12 の新しい既定値による図の再配置・見た目の変更を避ける。
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          layout: "dagre",
          look: "classic",
        });
        // mermaid.render は描画用の一時 DOM 要素を id で作るため、
        // useId の区切り文字（:）を除いた安全な id を渡す
        const domId = `dependency-diagram-${reactId.replaceAll(":", "")}`;
        const { svg } = await mermaid.render(domId, definition);
        if (!cancelled) {
          setState({ kind: "success", svg });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, reactId]);

  return (
    <DependencyDiagramView
      title={title}
      description={description}
      state={state}
    />
  );
}
