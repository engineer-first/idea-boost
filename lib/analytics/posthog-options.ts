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
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: "identified_only",
    respect_dnt: true,
    before_send: sanitizeBeforeSend,
  };
}

/** 送る直前に、イベントのプロパティの URL から ID と戻り先を落とす。 */
export const sanitizeBeforeSend: BeforeSendFn = (event) => {
  if (!event) return null;
  event.properties = sanitizeAnalyticsProperties(event.properties ?? {});
  return event;
};
