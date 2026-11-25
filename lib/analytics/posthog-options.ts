import type { BeforeSendFn, PostHogConfig } from "posthog-js";
import { sanitizeAnalyticsProperties } from "./analytics-privacy";

/**
 * PostHog の初期化設定。画面の閲覧・離脱と流入元だけを送る。
 * 付箋本文などの入力を拾わないよう、クリックの自動収集・録画・ヒートマップを止め、
 * 送る直前に URL から招待コード・ルーム ID・戻り先を落とす。
 */
export function getPosthogOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    defaults: "2026-08-30",
    autocapture: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    // 管理画面から有効にされても、入れ子に生の URL を持つイベントを送らない。
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: "identified_only",
    respect_dnt: true,
    // cookie にすると、入口の生の URL が自サイトへのリクエストに毎回付くため。
    persistence: "localStorage",
    before_send: sanitizeBeforeSend,
  };
}

/**
 * 送る直前に、URL から ID と戻り先を、参照元から検索語を落とす。
 * posthog-js は $set / $set_once をイベント直下に置くため、そちらも整える。
 */
export const sanitizeBeforeSend: BeforeSendFn = (event) => {
  if (!event) return null;
  event.properties = sanitizeAnalyticsProperties(event.properties ?? {});
  if (event.$set) event.$set = sanitizeAnalyticsProperties(event.$set);
  if (event.$set_once) {
    event.$set_once = sanitizeAnalyticsProperties(event.$set_once);
  }
  return event;
};
