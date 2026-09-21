export type DependencyDiagramState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; svg: string };

type DependencyDiagramViewProps = {
  title: string;
  description: string;
  state: DependencyDiagramState;
};

// mermaid が生成する SVG の黒い文字を読みやすくするため、
// 背景を白に固定する（Schema/SchemaDiagram と同じ扱い）。
export function DependencyDiagramView({
  title,
  description,
  state,
}: DependencyDiagramViewProps) {
  return (
    <div style={{ background: "#fff", padding: "1.5rem", color: "#111" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{title}</h2>
      <p style={{ color: "#555", marginTop: "0.25rem" }}>{description}</p>
      {state.kind === "loading" && (
        <p style={{ marginTop: "1rem", color: "#555" }}>図を読み込み中…</p>
      )}
      {state.kind === "error" && (
        <p role="alert" style={{ marginTop: "1rem", color: "#b91c1c" }}>
          図を表示できませんでした: {state.message}
        </p>
      )}
      {state.kind === "success" && (
        <div
          data-testid="dependency-diagram-svg"
          style={{ marginTop: "1rem", overflowX: "auto" }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid.render が返す SVG 文字列の挿入。入力はリポジトリ内の生成物（.mmd）だけで、ユーザー入力は流れ込まない Storybook 専用部品
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
    </div>
  );
}
