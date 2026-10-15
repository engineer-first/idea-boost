// Previewの全入口で常に認証。PREVIEW_ENABLEDが欠けても本番処理へfallbackしない。
// @ts-expect-error -- OpenNextのビルド時生成物
import nextHandler from "../.open-next/worker.js";
import { createFullStackPreview } from "./preview-full-stack";

export { PreviewAccountDO, PreviewRoomDO } from "./preview-worker";
export default createFullStackPreview(nextHandler);
