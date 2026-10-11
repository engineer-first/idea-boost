export type PreviewSource = {
  open: boolean;
  sameRepository: boolean;
  sha: string;
};
export type PreviewReport = {
  state: "pending" | "ready" | "failed" | "closed";
  appCommit: string;
  updatedAt: string;
  url?: string;
  deploymentUrl?: string;
  apiCommit?: string;
  logUrl?: string;
};
export type PreviewRuntime = {
  current: (number: number) => Promise<PreviewSource>;
  deploy: (
    number: number,
    sha: string,
  ) => Promise<{ url: string; deploymentUrl?: string }>;
  remove: (number: number) => Promise<void>;
  probe: (url: string) => Promise<{ ok: true; apiCommit: string }>;
  comment: (number: number, report: PreviewReport) => Promise<void>;
  now: () => string;
};
export async function reconcilePreview(
  input: {
    number: number;
    sha: string;
    state: "pending" | "success" | "failed" | "closed";
  },
  runtime: PreviewRuntime,
): Promise<void> {
  const current = await runtime.current(input.number);
  if (!current.sameRepository) return;
  if (!current.open) {
    await runtime.remove(input.number);
    await runtime.comment(input.number, {
      state: "closed",
      appCommit: current.sha,
      updatedAt: runtime.now(),
    });
    return;
  }
  if (current.sha !== input.sha || input.state === "closed") return;
  const base = { appCommit: input.sha, updatedAt: runtime.now() };
  if (input.state !== "success") {
    await runtime.comment(input.number, { ...base, state: input.state });
    return;
  }
  await runtime.comment(input.number, { ...base, state: "pending" });
  try {
    const deployment = await runtime.deploy(input.number, input.sha);
    if (!deployment.deploymentUrl)
      throw new Error("固定版URLを確認できません。");
    const health = await runtime.probe(deployment.url);
    await runtime.probe(deployment.deploymentUrl);
    const latest = await runtime.current(input.number);
    if (!latest.open) {
      await runtime.remove(input.number);
      await runtime.comment(input.number, {
        state: "closed",
        appCommit: latest.sha,
        updatedAt: runtime.now(),
      });
      return;
    }
    if (!latest.sameRepository || latest.sha !== input.sha) return;
    await runtime.comment(input.number, {
      ...base,
      ...deployment,
      state: "ready",
      apiCommit: health.apiCommit,
      updatedAt: runtime.now(),
    });
  } catch {
    const latest = await runtime.current(input.number);
    if (latest.open && latest.sha === input.sha)
      await runtime.comment(input.number, {
        ...base,
        state: "failed",
        updatedAt: runtime.now(),
      });
    // SecretやCookieを含み得る生エラーをPR/Actionsの出力へ出さない。
    throw new Error(
      "Previewの公開または疎通確認に失敗しました。Actionsの対象ステップを確認してください。",
    );
  }
}
export function previewComment(report: PreviewReport): string {
  const status = {
    pending: "品質確認・更新中（利用可能未確認）",
    ready: "疎通確認済み",
    failed: "更新失敗（以前のURLを最新成功版として使わないでください）",
    closed: "公開終了",
  }[report.state];
  return [
    "<!-- idea-boost-workers-preview -->",
    "### PR Preview",
    `状態：${status}`,
    "",
    ...(report.state === "ready" && report.url
      ? [
          `[ステップを選んで開く](${report.url}/preview)`,
          ...(report.deploymentUrl
            ? [`[固定されたデプロイ版](${report.deploymentUrl}/preview)`]
            : []),
          "",
        ]
      : []),
    `App commit：\`${report.appCommit}\``,
    `疎通確認時の共通API commit：\`${report.apiCommit ?? "未確認"}\``,
    `更新日時：${report.updatedAt}`,
    ...(report.logUrl ? [`[公開・終了処理のログ](${report.logUrl})`] : []),
    "",
    "ログイン：許可一覧のGoogleアカウント（Cloudflare Access）。作成者がホストです。ボードの招待URLから同じPRのルームへ参加できます。",
    "確認範囲：PR版App、全14ステップの新しいサンプル入りルーム、付箋・投票・通常進行。参加者のマイ付箋は空から始まります。",
    ...(report.state === "ready" && report.url
      ? [`[現在の共通API版を確認](${report.url}/api/health)`]
      : []),
    "確認できない範囲：PR版API・RoomDO・D1 migration・通信契約。共通APIはCI確認済みdevelopです。",
    "認証やGoogle設定、別メンバーでの操作確認はhealth成功だけでは保証しません。設定・保持・失敗時手順は docs/operations/preview.md を参照してください。",
  ].join("\n");
}
