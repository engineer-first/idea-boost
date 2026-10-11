// Previewの全入口で常に認証。PREVIEW_ENABLEDが欠けても本番処理へfallbackしない。
// @ts-expect-error -- OpenNextのビルド時生成物
import nextHandler from "../.open-next/worker.js";
import { type PreviewGatewayEnv, previewGateway } from "./preview-gateway";

export default {
  async fetch(
    request: Request,
    env: PreviewGatewayEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return previewGateway(request, env, async (authenticated) => {
      if (new URL(authenticated.url).pathname.startsWith("/api/"))
        return env.API_WORKER.fetch(authenticated);
      return nextHandler.fetch(authenticated, env, ctx);
    });
  },
};
