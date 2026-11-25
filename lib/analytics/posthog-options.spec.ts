// @vitest-environment node
// 付箋本文など利用者の入力を送らないよう、自動収集と録画を止める。
import { expect, it } from "vitest";
import { getPosthogOptions, sanitizeBeforeSend } from "./posthog-options";

it("画面の閲覧と離脱だけを送り、クリックの自動収集・録画・アンケートを止める", () => {
  const options = getPosthogOptions("https://us.i.posthog.com");
  expect(options).toMatchObject({
    api_host: "https://us.i.posthog.com",
    autocapture: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    persistence: "localStorage",
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: "identified_only",
    respect_dnt: true,
  });
});

it("送る前に URL から ID と戻り先を落とす", () => {
  expect(getPosthogOptions("https://us.i.posthog.com").before_send).toBe(
    sanitizeBeforeSend,
  );
  const event = sanitizeBeforeSend({
    event: "$pageview",
    properties: { $current_url: "https://ideaboost.dev/rooms/r-1" },
  } as never);
  expect(event).toMatchObject({
    properties: { $current_url: "https://ideaboost.dev/rooms/:id" },
  });
});

it("イベント直下の $set / $set_once の URL も整え、参照元の検索語を落とす", () => {
  const event = sanitizeBeforeSend({
    event: "$pageview",
    properties: {
      $current_url: "https://ideaboost.dev/",
      ph_keyword: "アイデア出し",
      $session_entry_ph_keyword: "アイデア出し",
    },
    $set: { $current_url: "https://ideaboost.dev/invite/ABC123" },
    $set_once: {
      $initial_current_url: "https://ideaboost.dev/login?next=/invite/ABC123",
      $initial_ph_keyword: "アイデア出し",
    },
  } as never);
  expect(event?.properties).toEqual({ $current_url: "https://ideaboost.dev/" });
  expect(event?.$set).toEqual({
    $current_url: "https://ideaboost.dev/invite/:code",
  });
  expect(event?.$set_once).toEqual({
    $initial_current_url: "https://ideaboost.dev/login",
  });
});
