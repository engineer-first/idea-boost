// @vitest-environment node
import { expect, it } from "vitest";
import {
  assertPreviewConfig,
  previewApiConfig,
  previewAppConfig,
} from "./preview-config.mts";

it("本番のWorker・D1・DOへの接続や別公開入口を拒否する", () => {
  const api = previewApiConfig(
    "11111111-1111-4111-8111-111111111111",
    "a".repeat(40),
  );
  assertPreviewConfig(api, "api");
  for (const bad of [
    { ...api, name: "idea-flow-api" },
    { ...api, workers_dev: true },
    {
      ...api,
      d1_databases: [
        {
          ...api.d1_databases[0],
          database_id: "8e57430c-fd84-4b6d-b9b3-62b4c74ee6dd",
        },
      ],
    },
    {
      ...api,
      durable_objects: {
        bindings: [{ name: "ROOM_DO", class_name: "RoomDO" }],
      },
    },
  ])
    expect(() => assertPreviewConfig(bad, "api")).toThrow();
  const app = previewAppConfig();
  expect(app.preview_urls).toBe(true);
  assertPreviewConfig(app, "app");
  expect(() =>
    assertPreviewConfig({ ...app, preview_urls: false }, "app"),
  ).toThrow();
  expect(() =>
    assertPreviewConfig(
      {
        ...app,
        previews: {
          ...app.previews,
          services: [{ binding: "API_WORKER", service: "idea-flow-api" }],
        },
      },
      "app",
    ),
  ).toThrow();
  expect(() =>
    assertPreviewConfig(
      { ...app, assets: { ...app.assets, run_worker_first: false } },
      "app",
    ),
  ).toThrow();
});
