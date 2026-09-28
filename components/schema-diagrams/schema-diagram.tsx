type SchemaDiagramProps = {
  title: string;
  description: string;
  src: string;
};

// tbls が生成する graphviz SVG の黒い文字を読みやすくするため、
// 背景を白に固定する。
export function SchemaDiagram({ title, description, src }: SchemaDiagramProps) {
  return (
    <div style={{ background: "#fff", padding: "1.5rem", color: "#111" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{title}</h2>
      <p style={{ color: "#555", marginTop: "0.25rem" }}>{description}</p>
      {/* biome-ignore lint/performance/noImgElement: Storybook専用でnext/image対象外 */}
      <img
        src={src}
        alt={`${title} のER図`}
        style={{ marginTop: "1rem", maxWidth: "100%" }}
      />
    </div>
  );
}
