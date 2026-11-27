// `npm run dev`（Next.js 開発サーバー）の起動ポートと NEXT_PUBLIC_SITE_URL をそろえる。
// Google ログインの戻り先は NEXT_PUBLIC_SITE_URL から作るため、.env.local の値（既定 3000）のままだと
// 3001 で動く worktree から Google ログインしても 3000 の別 worktree へ戻ってしまう。
// PORT も渡し、使用中のときに Next.js が別のポートへ黙って移らないようにする（自動配分はしない）。
const defaultPort = 3000;

function isNextDev(args: string[]): boolean {
  return (
    /(^|\/)next\/dist\/bin\/next$/.test(args[0] ?? "") && args[1] === "dev"
  );
}

function portArgument(args: string[]): string | undefined {
  let port: string | undefined;
  for (let index = 2; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--port" || arg === "-p") port = args[++index];
    else if (arg.startsWith("--port=")) port = arg.slice("--port=".length);
    else if (/^-p\d/.test(arg)) port = arg.slice(2);
  }
  return port;
}

export function nextDevEnv(
  args: string[],
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  if (!isNextDev(args)) return {};
  const value = portArgument(args) ?? env.PORT ?? String(defaultPort);
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65_535)
    throw new Error(`ポート ${value} は 1〜65535 の整数にしてください。`);
  return {
    PORT: String(port),
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  };
}
