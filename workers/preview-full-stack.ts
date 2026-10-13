import { type PreviewGatewayEnv, previewGateway } from "./preview-gateway";
import previewApi, { type PreviewWorkerEnv } from "./preview-worker";

export type PreviewAppEnv = Omit<PreviewGatewayEnv, "API_WORKER"> &
  PreviewWorkerEnv;
export type PreviewNextHandler = {
  fetch: (
    request: Request,
    env: PreviewGatewayEnv & PreviewWorkerEnv,
    ctx: ExecutionContext,
  ) => Promise<Response>;
};

// 同じPRのAPIを呼ぶ。Service Bindingや外部URLへのfallbackを持たない。
export function createFullStackPreview(nextHandler: PreviewNextHandler) {
  return {
    async fetch(
      request: Request,
      env: PreviewAppEnv,
      ctx: ExecutionContext,
    ): Promise<Response> {
      const internalEnv = {
        ...env,
        API_WORKER: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            previewApi.fetch(new Request(input, init), env),
        },
      };
      return previewGateway(request, internalEnv, async (authenticated) => {
        if (new URL(authenticated.url).pathname.startsWith("/api/"))
          return internalEnv.API_WORKER.fetch(authenticated);
        return nextHandler.fetch(authenticated, internalEnv, ctx);
      });
    },
  };
}
