// features/ の import 依存を mermaid flowchart テキストへ変換する純関数群。
// ファイルシステムの走査と .mmd の書き出しは build-dependency-diagrams.mts
// （呼び出し側）が担い、ここは「ソース文字列 → 図テキスト」だけを持つ。
// 生成図を安定して確認できるよう、出力はすべてソート済みの決定的テキストにする。
// 同じ依存関係からは常に同じテキストを生成する。

export type SourceFile = {
  path: string;
  source: string;
};

export type FeatureInput = {
  name: string;
  files: SourceFile[];
};

// import / export 文のソースパスを出現順に返す。
// 行頭から始まる文だけを対象にするため、コメントや文字列リテラル内の
// "from" は拾わない（features のソースは biome が 1 行 1 文へ整形する前提）。
export function extractImportPaths(source: string): string[] {
  const re =
    /^(?:import\s*["']([^"']+)["']|(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/gms;
  const paths: string[] = [];
  for (const match of source.matchAll(re)) {
    const path = match[1] ?? match[2];
    if (path !== undefined) {
      paths.push(path);
    }
  }
  return paths;
}

// 図に載せるのは実装ファイルだけ。spec / stories / fixture は「実装の依存」
// ではなくテスト・カタログ用の同居ファイルなので、載せると図が倍に膨れて
// データフローが読めなくなる。
export function isImplementationFile(path: string): boolean {
  return !/\.(spec|stories|fixture)\.[jt]sx?$/.test(path);
}

function stripExtension(path: string): string {
  return path.replace(/\.[jt]sx?$/, "");
}

function pathToNodeId(path: string): string {
  return stripExtension(path).replace(/[^A-Za-z0-9]/g, "_");
}

function nodeLabel(path: string): string {
  const base = path.split("/").at(-1) ?? path;
  return base === "index.ts" ? base : stripExtension(base);
}

function featureNodeId(featureName: string): string {
  return featureName.replace(/[^A-Za-z0-9]/g, "_");
}

// "ui/note-card.tsx" + "../logic/notes-reducer" → "logic/notes-reducer.ts" の
// ように、拡張子なしの相対 import を feature 内の実ファイルへ解決する。
// 解決できないパスは undefined（エッジを作らない。実在しない import は
// tsc が別途エラーにする）。
function resolveRelativeImport(
  fromPath: string,
  importPath: string,
  stemToPath: ReadonlyMap<string, string>,
): string | undefined {
  const segments = [...fromPath.split("/").slice(0, -1)];
  for (const part of importPath.split("/")) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return stemToPath.get(segments.join("/"));
}

const FEATURE_IMPORT_RE = /^@\/features\/([^/"']+)/;

// 1 feature 内のファイルレベル依存図。ui/ logic/ は subgraph で層として描き、
// 他 feature への依存は集約ノード（六角形）で描く。contracts / lib /
// components への依存は載せない: ほぼ全ノードから伸びる背景的な依存で、
// 載せると本質（feature 内のデータフローと feature 間エッジ）が埋もれる。
export function buildFeatureDiagram(feature: FeatureInput): string {
  const files = feature.files.filter((file) => isImplementationFile(file.path));
  const stemToPath = new Map(
    files.map((file) => [stripExtension(file.path), file.path]),
  );

  const rootPaths: string[] = [];
  const layerPaths = new Map<string, string[]>();
  for (const file of files) {
    const [head, ...rest] = file.path.split("/");
    if (rest.length === 0 || head === undefined) {
      rootPaths.push(file.path);
    } else {
      layerPaths.set(head, [...(layerPaths.get(head) ?? []), file.path]);
    }
  }

  const externalFeatures = new Set<string>();
  const edges = new Set<string>();
  for (const file of files) {
    for (const importPath of extractImportPaths(file.source)) {
      if (importPath.startsWith(".")) {
        const target = resolveRelativeImport(file.path, importPath, stemToPath);
        if (target !== undefined && target !== file.path) {
          edges.add(`${pathToNodeId(file.path)} --> ${pathToNodeId(target)}`);
        }
        continue;
      }
      const featureMatch = FEATURE_IMPORT_RE.exec(importPath);
      if (featureMatch?.[1] !== undefined) {
        externalFeatures.add(featureMatch[1]);
        edges.add(
          `${pathToNodeId(file.path)} --> feat_${featureNodeId(featureMatch[1])}`,
        );
      }
    }
  }

  const lines = ["flowchart LR"];
  for (const path of [...rootPaths].sort()) {
    lines.push(`  ${pathToNodeId(path)}["${nodeLabel(path)}"]`);
  }
  // 層は依存権の帯順（containers → templates → organisms → molecules →
  // logic。上の帯ほど先）に並べる。規約外の層が現れた場合は名前順で
  // 後ろに続ける（配置自体は check:feature-layout が別途 fail させる）。
  const BAND_ORDER = [
    "containers",
    "templates",
    "organisms",
    "molecules",
    "logic",
  ];
  const layerOrder = [...layerPaths.keys()].sort((a, b) => {
    const rank = (layer: string): number => {
      const index = BAND_ORDER.indexOf(layer);
      return index === -1 ? BAND_ORDER.length : index;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const layer of layerOrder) {
    lines.push(`  subgraph ${layer}["${layer}/"]`);
    for (const path of [...(layerPaths.get(layer) ?? [])].sort()) {
      lines.push(`    ${pathToNodeId(path)}["${nodeLabel(path)}"]`);
    }
    lines.push("  end");
  }
  for (const name of [...externalFeatures].sort()) {
    lines.push(`  feat_${featureNodeId(name)}{{"${name}"}}`);
  }
  for (const edge of [...edges].sort()) {
    lines.push(`  ${edge}`);
  }
  return `${lines.join("\n")}\n`;
}

// features 全体の俯瞰図。ノードは app と各 feature、エッジは
// 「@/features/<name> を import している」の集約。ast-grep が強制する
// 一方通行ルール（AGENTS.md）の実測版にあたる。
export function buildOverviewDiagram(
  features: FeatureInput[],
  appFiles: SourceFile[],
): string {
  const edges = new Set<string>();
  for (const feature of features) {
    for (const file of feature.files) {
      if (!isImplementationFile(file.path)) {
        continue;
      }
      for (const importPath of extractImportPaths(file.source)) {
        const featureMatch = FEATURE_IMPORT_RE.exec(importPath);
        if (
          featureMatch?.[1] !== undefined &&
          featureMatch[1] !== feature.name
        ) {
          edges.add(
            `${featureNodeId(feature.name)} --> ${featureNodeId(featureMatch[1])}`,
          );
        }
      }
    }
  }
  for (const file of appFiles) {
    if (!isImplementationFile(file.path)) {
      continue;
    }
    for (const importPath of extractImportPaths(file.source)) {
      const featureMatch = FEATURE_IMPORT_RE.exec(importPath);
      if (featureMatch?.[1] !== undefined) {
        edges.add(`app --> ${featureNodeId(featureMatch[1])}`);
      }
    }
  }

  const lines = ["flowchart LR", '  app["app/"]'];
  for (const feature of [...features].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    lines.push(`  ${featureNodeId(feature.name)}["${feature.name}"]`);
  }
  for (const edge of [...edges].sort()) {
    lines.push(`  ${edge}`);
  }
  return `${lines.join("\n")}\n`;
}
