import type { TblsTable } from "./tbls-schema";

type SchemaDetailsProps = {
  title: string;
  description: string;
  tables: TblsTable[];
};

// ER 図（SchemaDiagram）が関係の全体像を見せるのに対し、こちらは ER 図に
// 現れないインデックス・制約・デフォルト値を公開Storybookで確認するための一覧。
// 生成データをそのまま並べ、加工は最小限にする。
// 背景を白に固定する理由はschema-diagram.tsxと同じ（図の文字の可読性）。

const cellStyle = {
  border: "1px solid #ddd",
  padding: "0.25rem 0.5rem",
  fontFamily: "monospace",
  textAlign: "left",
} as const;

const headStyle = {
  ...cellStyle,
  fontFamily: "inherit",
  background: "#f5f5f5",
  fontWeight: 600,
} as const;

function DetailTable({
  label,
  head,
  rows,
}: {
  label: string;
  head: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return <p style={{ marginTop: "0.75rem", color: "#555" }}>{label}なし</p>;
  }
  return (
    <table
      style={{
        marginTop: "0.75rem",
        borderCollapse: "collapse",
        fontSize: "0.85rem",
      }}
    >
      <caption
        style={{ textAlign: "left", fontWeight: 600, marginBottom: "0.25rem" }}
      >
        {label}
      </caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" style={headStyle}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells) => (
          <tr key={cells.join("|")}>
            {cells.map((cell, i) => (
              <td key={head[i]} style={cellStyle}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SchemaDetails({
  title,
  description,
  tables,
}: SchemaDetailsProps) {
  return (
    <div style={{ background: "#fff", padding: "1.5rem", color: "#111" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{title}</h2>
      <p style={{ color: "#555", marginTop: "0.25rem" }}>{description}</p>
      {tables.map((table) => (
        <section
          key={table.name}
          aria-label={table.name}
          style={{ marginTop: "2rem" }}
        >
          <h3
            style={{
              fontSize: "1.05rem",
              fontWeight: 600,
              fontFamily: "monospace",
              borderBottom: "2px solid #111",
              paddingBottom: "0.25rem",
            }}
          >
            {table.name}
          </h3>
          <DetailTable
            label="カラム"
            head={["名前", "型", "デフォルト", "制約"]}
            rows={table.columns.map((col) => [
              col.name,
              col.type,
              col.default ?? "",
              col.nullable ? "" : "NOT NULL",
            ])}
          />
          <DetailTable
            label="インデックス"
            head={["名前", "定義"]}
            rows={table.indexes.map((index) => [index.name, index.def])}
          />
          <DetailTable
            label="制約"
            head={["名前", "種類", "定義"]}
            rows={table.constraints.map((constraint) => [
              constraint.name,
              constraint.type,
              constraint.def,
            ])}
          />
        </section>
      ))}
    </div>
  );
}
