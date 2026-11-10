import type { DesignToken, DesignTokens } from "./design-tokens";

type DesignTokensViewProps = {
  tokens: DesignTokens;
};

// DESIGN.md のトークンを、値と「コードでの書き方」つきで並べる Storybook 専用の一覧。
// 値は生成済みの design-tokens.css から読むため、DESIGN.md を変えると自動で追従する。

function Usage({ token, prefix }: { token: DesignToken; prefix?: string }) {
  return (
    <ul className="flex flex-wrap gap-1 text-xs">
      {token.tailwind.map((name) => (
        <li key={name}>
          <code className="rounded-md bg-muted px-1.5 py-0.5">
            {prefix === undefined ? name : `${prefix}-${name}`}
          </code>
        </li>
      ))}
      <li>
        <code className="rounded-md bg-muted px-1.5 py-0.5">
          var({token.cssVar})
        </code>
      </li>
    </ul>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function DesignTokensView({ tokens }: DesignTokensViewProps) {
  return (
    <div className="flex flex-col gap-10 bg-background p-6 text-foreground">
      <Section
        title="色"
        description="名前は Tailwind の bg- / text- / border- などに続けて書きます（例: bg-primary、text-state-decided-text）。名前がない色は CSS の var() で使います。"
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
          {tokens.colors.map((token) => (
            <li
              key={token.cssVar}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div
                className="h-14 rounded-md border border-border"
                style={{ background: `var(${token.cssVar})` }}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{token.name}</span>
                <code className="text-xs text-muted-foreground">
                  {token.value}
                </code>
              </div>
              <Usage token={token} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="角丸"
        description="rounded- に続けて書くか、var() で使います。"
      >
        <ul className="flex flex-wrap gap-4">
          {tokens.rounded.map((token) => (
            <li key={token.cssVar} className="flex w-48 flex-col gap-2">
              <div
                className="h-16 border border-primary bg-primary-soft"
                style={{ borderRadius: `var(${token.cssVar})` }}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{token.name}</span>
                <code className="text-xs text-muted-foreground">
                  {token.value}
                </code>
              </div>
              <Usage token={token} prefix="rounded" />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="余白" description="var() で使います。">
        <ul className="flex flex-col gap-2">
          {tokens.spacing.map((token) => (
            <li key={token.cssVar} className="flex items-center gap-3">
              <span className="w-28 font-bold">{token.name}</span>
              <div
                className="h-4 shrink-0 rounded-md bg-primary"
                style={{ width: `var(${token.cssVar})` }}
              />
              <code className="text-xs text-muted-foreground">
                {token.value} · var({token.cssVar})
              </code>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
