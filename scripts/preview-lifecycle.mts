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
  probe: (
    url: string,
    number: number,
  ) => Promise<{ ok: true; apiCommit: string }>;
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
    const health = await runtime.probe(deployment.url, input.number);
    const fixedHealth = await runtime.probe(
      deployment.deploymentUrl,
      input.number,
    );
    if (health.apiCommit !== input.sha || fixedHealth.apiCommit !== input.sha)
      throw new Error("PR版AppとAPIの版が一致しません。");
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
          `[このPRの最新公開版を開く](${report.url}/preview)`,
          "",
          "許可されたGoogleアカウントでログインし、確認したいステップを選ぶと、サンプル入りの新しいルームが開きます。",
        ]
      : []),
    "Previewは、PRの新しいコードがCIと公開後の接続確認に成功すると更新されます。PRをマージまたは閉じると、環境と保存データは削除されます。",
    "",
    "<details>",
    "<summary>公開情報・確認範囲</summary>",
    "",
    `App commit：\`${report.appCommit}\``,
    `PR版API commit：\`${report.apiCommit ?? "未確認"}\``,
    `更新日時：${report.updatedAt}`,
    ...(report.logUrl ? [`[公開・終了処理のログ](${report.logUrl})`] : []),
    "",
    "ログイン：許可一覧のGoogleアカウント（Cloudflare Access）。作成者がホストです。ボードの招待URLから同じPRのルームへ参加できます。",
    "確認範囲：PR版App・API・RoomDO・D1 migration・通信契約。全14ステップの新しいサンプル入りルームで操作できます。参加者のマイ付箋は空から始まります。",
    ...(report.state === "ready" && report.url
      ? [`[現在のPR版APIを確認](${report.url}/api/health)`]
      : []),
    "保存先：D1とRoomDOはPRごとに分離します。旧共通Previewのルームは引き継がないため、ステップ選択から新しいルームを作ってください。",
    "戻る操作など進行履歴を使う機能は、ステップを直接開いた後に実際に進めてから確認してください。",
    "healthが成功しても、認証やGoogleの設定が正しいことや、別のメンバーが正常に操作できることまでは確認できません。設定方法、データの保存期間、失敗したときの対応手順は docs/operations/preview.md を参照してください。",
    "",
    "</details>",
  ].join("\n");
}
