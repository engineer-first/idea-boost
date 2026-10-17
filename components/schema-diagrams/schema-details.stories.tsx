import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SchemaDetails } from "./schema-details";
import type { TblsTable } from "./tbls-schema";
import { TblsSchemaJson } from "./tbls-schema";

// SchemaDiagram（ER図）がテーブル間の関係を、こちらが ER 図に現れない
// インデックス・制約・デフォルト値を公開Storybookで確認できる。
// schema.json は npm run db:schema:diagrams（storybook 起動時に自動実行）が
// tblsで生成し、staticDirs経由でそのコミットのデータを配信する。
async function loadTables(db: "d1" | "room-do") {
  const res = await fetch(`/schema-diagrams/${db}/schema.json`);
  if (!res.ok) {
    throw new Error(`schema.json の取得に失敗しました: ${db} (${res.status})`);
  }
  return { tables: TblsSchemaJson.parse(await res.json()).tables };
}

const meta: Meta<typeof SchemaDetails> = {
  title: "Schema/SchemaDetails",
  component: SchemaDetails,
  parameters: {
    layout: "fullscreen",
  },
  render: (args, { loaded }) => (
    <SchemaDetails {...args} tables={loaded.tables as TblsTable[]} />
  ),
};

export default meta;
type Story = StoryObj<typeof SchemaDetails>;

export const D1: Story = {
  args: {
    title: "D1 (lobby)",
    description:
      "招待コード → ルーム解決ディレクトリのカラム・インデックス・制約の一覧。",
    tables: [],
  },
  loaders: [() => loadTables("d1")],
};

export const RoomDO: Story = {
  args: {
    title: "RoomDO (room内部)",
    description:
      "ルームごとの SQLite-backed Durable Object 内部のカラム・インデックス・制約の一覧。",
    tables: [],
  },
  loaders: [() => loadTables("room-do")],
};
