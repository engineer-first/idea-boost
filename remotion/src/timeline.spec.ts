import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getOperationTimeline,
  OPERATION_DEMO_DURATION_FRAMES,
  OPERATION_DEMO_FPS,
} from "./timeline";

describe("IdeaFlow operation demo timeline", () => {
  it("プレゼンのチャプター位置と尺が更新後の動画に一致する", () => {
    const html = readFileSync("docs/site/presentation/index.html", "utf8");
    const siteIndex = readFileSync("docs/site/index.html", "utf8");
    const seeks = [...html.matchAll(/data-seek="(\d+)"/g)].map((match) =>
      Number(match[1]),
    );
    expect(seeks).toEqual([0, 13, 22, 53, 99, 115]);
    expect(html).toContain("Idea Boost操作デモ。無音・2分14秒。");
    expect(siteIndex).toContain("全16枚・約11分33秒のプレゼン");
    expect(html).toContain(
      'data-time="5:59–8:23" data-start="359" data-end="503"',
    );
    expect(html).toContain(
      '<h2 id="thanks-title" tabindex="-1">アイデア出しには</h2>',
    );
    expect(html).toContain(
      'id="title-netflix" tabindex="-1">あの<span style="color:#e50914">Netflix</span>も、デザインスプリントを活用！？</h2>',
    );
    expect(html).toContain('<p class="tool-name">ChatGPTなどの生成AI</p>');
    expect(html).toContain('<p class="tool-detail">問いを深掘りする</p>');
    expect(html).toContain(
      ".sprint-lead-follow { display:block; margin-top:18px; color:var(--accent-ink); font-size:.72em; line-height:1.5; white-space:nowrap; }",
    );
    expect(html.match(/<section[^>]*\bdata-slide\b/g)).toHaveLength(16);
    expect(html).toContain(
      'id="slide-ai" data-slide data-title="IdeaBoost.×AI"',
    );
    expect(html).toContain(
      'data-time="9:53–10:33" data-start="593" data-end="633"',
    );
    expect(html).toContain(
      'data-time="10:33–11:23" data-start="633" data-end="683"',
    );
    expect(html).toContain(
      'data-time="11:23–11:33" data-start="683" data-end="693"',
    );
    expect(html).toContain(
      '<p class="workflow-phase-example workflow-example-bubble"><span class="workflow-example-label">例：</span>1人は寂しい</p>',
    );
    expect(html).toContain(
      '<p class="workflow-phase-example workflow-example-bubble"><span class="workflow-example-label">例：</span>どのように私たちは友人と時間を共有していると思えるか</p>',
    );
    expect(html).toContain(
      '<p class="workflow-phase-example workflow-example-bubble"><span class="workflow-example-label">例：</span>みんなで共通のデジタルペット（たまごっちなど）をお世話する</p>',
    );
    expect(html).toContain(
      '#slide-workflow .workflow-example-bubble::after { content:""; position:absolute;',
    );
    expect(html).toContain("迷いのないアイデア出しにアップデートをAIで");
    expect(html).toContain("アイデアが生まれた軌跡はAIで");
    expect(html).not.toContain("FUTURE CONCEPT · MVP対象外");
    expect(html).not.toContain("課題 → 問い → アイデア → 決定理由をAIが要約。");
  });
  it("全14ステップを1秒ずつ延ばした134秒・60fpsの動画になる", () => {
    expect(OPERATION_DEMO_FPS).toBe(60);
    expect(OPERATION_DEMO_DURATION_FRAMES).toBe(134 * OPERATION_DEMO_FPS);
  });

  it("shows the lobby, all 14 steps, and the completed state in order", () => {
    const timeline = getOperationTimeline();

    expect(timeline.map((scene) => scene.id)).toEqual([
      "home",
      "lobby",
      "phase-1-step-1",
      "phase-1-step-2",
      "phase-1-step-3",
      "phase-1-step-4",
      "phase-1-step-5",
      "phase-2-step-1",
      "phase-2-step-2",
      "phase-2-step-3",
      "phase-2-step-4",
      "phase-3-step-1",
      "phase-3-step-2",
      "phase-3-step-3",
      "phase-3-step-4",
      "phase-3-step-5",
      "complete",
    ]);
  });

  it("uses the agreed durations and fills the composition without gaps", () => {
    const timeline = getOperationTimeline();

    expect(timeline.map((scene) => scene.durationInSeconds)).toEqual([
      6, 7, 9, 8, 8, 7, 8, 8, 6, 7, 8, 9, 8, 9, 7, 8, 11,
    ]);
    expect(timeline[0]?.from).toBe(0);

    for (const [index, scene] of timeline.entries()) {
      const nextScene = timeline[index + 1];
      if (nextScene) {
        expect(scene.from + scene.durationInFrames).toBe(nextScene.from);
      }
    }

    const lastScene = timeline.at(-1);
    expect(lastScene).toBeDefined();
    if (!lastScene) return;
    expect(lastScene.from + lastScene.durationInFrames).toBe(
      OPERATION_DEMO_DURATION_FRAMES,
    );
  });
});
