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
