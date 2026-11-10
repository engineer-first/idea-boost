// DESIGN.md から生成した design-tokens.css と、Tailwind へ橋渡しする globals.css を読み、
// 「トークンの値」と「Tailwind で書くときの名前」を対応づける。Storybook の一覧専用。

export type DesignToken = {
  name: string;
  value: string;
  cssVar: string;
  /** `bg-*` `text-*` `rounded-*` などに続けて書ける名前。ないときは var() で使う。 */
  tailwind: string[];
};

export type DesignTokens = {
  colors: DesignToken[];
  rounded: DesignToken[];
  spacing: DesignToken[];
};

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE = /^var\((--[\w-]+)\)$/;

function readDeclarations(css: string): [string, string][] {
  return [...css.matchAll(DECLARATION)].map((match) => [
    match[1],
    match[2].trim(),
  ]);
}

// --color-card → --card → --ib-color-surface のような var() の連鎖をたどる。
function resolveToToken(
  name: string,
  references: Map<string, string>,
): string | undefined {
  let current = name;
  for (let depth = 0; depth < 8; depth += 1) {
    const next = references.get(current);
    if (next === undefined) return undefined;
    if (next.startsWith("--ib-")) return next;
    current = next;
  }
  return undefined;
}

export function readDesignTokens(
  tokensCss: string,
  globalsCss: string,
): DesignTokens {
  const references = new Map<string, string>();
  for (const [name, value] of readDeclarations(globalsCss)) {
    const reference = VAR_REFERENCE.exec(value)?.[1];
    if (reference !== undefined) references.set(name, reference);
  }

  const tailwindNames = new Map<string, string[]>();
  for (const name of references.keys()) {
    const utility = /^--(?:color|radius)-([\w-]+)$/.exec(name)?.[1];
    if (utility === undefined) continue;
    const token = resolveToToken(name, references);
    if (token === undefined) continue;
    tailwindNames.set(token, [...(tailwindNames.get(token) ?? []), utility]);
  }

  const tokens: DesignTokens = { colors: [], rounded: [], spacing: [] };
  for (const [cssVar, value] of readDeclarations(tokensCss)) {
    const match = /^--ib-(color|rounded|spacing)-([\w-]+)$/.exec(cssVar);
    if (match === null) continue;
    const [, group, name] = match;
    const token: DesignToken = {
      name,
      value,
      cssVar,
      tailwind: [...(tailwindNames.get(cssVar) ?? [])].sort(),
    };
    if (group === "color") tokens.colors.push(token);
    else if (group === "rounded") tokens.rounded.push(token);
    else tokens.spacing.push(token);
  }
  return tokens;
}
