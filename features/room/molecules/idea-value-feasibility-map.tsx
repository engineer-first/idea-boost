"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, type Ref, useId } from "react";
import {
  getIdeaMapWorldLayout,
  IDEA_MAP_WORLD_X_AXIS_HEIGHT,
  IDEA_MAP_WORLD_Y_AXIS_WIDTH,
} from "../logic/idea-value-feasibility-map";

const MAP_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
  backgroundSize: "10% 10%",
} satisfies CSSProperties;

const AXIS_ARROW_PATH = "M -6 -6 L 0 0 L -6 6";
const AXIS_COLORS = {
  low: "color-mix(in srgb, var(--muted-foreground) 55%, var(--background))",
  middle: "color-mix(in srgb, var(--muted-foreground) 80%, var(--background))",
  high: "color-mix(in srgb, var(--primary) 85%, var(--background))",
};

function AxisStroke({
  axis,
  className,
  style,
}: {
  axis: "x" | "y";
  className: string;
  style?: CSSProperties;
}) {
  const gradientId = useId();
  const vertical = axis === "y";
  const low = {
    x: vertical ? "50%" : "0%",
    y: vertical ? "100%" : "50%",
  };
  const high = {
    x: vertical ? "50%" : "100%",
    y: vertical ? "0%" : "50%",
  };

  return (
    <svg
      aria-hidden="true"
      className={`block overflow-visible ${className}`}
      style={style}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid={`idea-value-feasibility-map-${axis}-scale-bar`}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={low.x}
          y1={low.y}
          x2={high.x}
          y2={high.y}
        >
          <stop offset="0%" stopColor={AXIS_COLORS.low} />
          <stop offset="50%" stopColor={AXIS_COLORS.middle} />
          <stop offset="100%" stopColor={AXIS_COLORS.high} />
        </linearGradient>
      </defs>
      <line
        x1={low.x}
        y1={low.y}
        x2={high.x}
        y2={high.y}
        stroke={`url(#${gradientId})`}
      />
      {/* 線の端点を矢印の先端にも使い、レスポンシブでも線が突き抜けないようにする。 */}
      <svg
        aria-hidden="true"
        x={low.x}
        y={low.y}
        width={1}
        height={1}
        overflow="visible"
      >
        <path
          d={AXIS_ARROW_PATH}
          transform={`rotate(${vertical ? 90 : 180})`}
          stroke={AXIS_COLORS.low}
          data-testid={`idea-value-feasibility-map-${axis}-low-arrow`}
        />
      </svg>
      <svg
        aria-hidden="true"
        x={high.x}
        y={high.y}
        width={1}
        height={1}
        overflow="visible"
      >
        <path
          d={AXIS_ARROW_PATH}
          transform={vertical ? "rotate(-90)" : undefined}
          stroke={AXIS_COLORS.high}
          data-testid={`idea-value-feasibility-map-${axis}-high-arrow`}
        />
      </svg>
    </svg>
  );
}

// 縮小して全体を見ても軸が読めるよう、画面上の最小の文字の大きさを保つ。
const AXIS_NAME_FONT_SIZE = 24;
const AXIS_NAME_MIN_SCREEN_FONT_SIZE = 16;
const AXIS_END_FONT_SIZE = 16;
const AXIS_END_MIN_SCREEN_FONT_SIZE = 12;
const AXIS_LINE_HEIGHT = 1.25;
// 軸の言葉と矢印の間。縮小しても画面上でこの間を保つ。
const AXIS_GAP = 12;
const AXIS_MIN_SCREEN_GAP = 10;
const X_AXIS_ROW_HEIGHT = 32;
const Y_AXIS_TRACK_INSET = 36;

function screenSafeFontSize(
  worldSize: number,
  minScreenSize: number,
  cameraZoom: number,
): number {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  return Math.max(worldSize, minScreenSize / zoom);
}

export type IdeaValueFeasibilityMapProps = {
  children?: ReactNode;
  overlay?: ReactNode;
  planeRef?: Ref<HTMLDivElement>;
  sizeLevel?: number;
  cameraZoom?: number;
};

/**
 * ボード上の決まった位置に置く2軸マップ。ボードのカメラで一緒に拡大・移動する。
 * 付箋は0〜100の評価値で、マップ面の中に置く。
 */
export function IdeaValueFeasibilityMap({
  children,
  overlay,
  planeRef,
  sizeLevel = 0,
  cameraZoom = 1,
}: IdeaValueFeasibilityMapProps) {
  const t = useTranslations("app.boardMap");
  const { plane } = getIdeaMapWorldLayout(sizeLevel);
  const axisNameStyle = {
    fontSize: screenSafeFontSize(
      AXIS_NAME_FONT_SIZE,
      AXIS_NAME_MIN_SCREEN_FONT_SIZE,
      cameraZoom,
    ),
    lineHeight: AXIS_LINE_HEIGHT,
  } satisfies CSSProperties;
  const axisEndStyle = {
    fontSize: screenSafeFontSize(
      AXIS_END_FONT_SIZE,
      AXIS_END_MIN_SCREEN_FONT_SIZE,
      cameraZoom,
    ),
    lineHeight: AXIS_LINE_HEIGHT,
  } satisfies CSSProperties;
  const gap = screenSafeFontSize(AXIS_GAP, AXIS_MIN_SCREEN_GAP, cameraZoom);
  const xAxisRowHeight = Math.max(
    X_AXIS_ROW_HEIGHT,
    axisNameStyle.fontSize * AXIS_LINE_HEIGHT,
  );
  // 縦軸の線は「高」「低」の下と上から始め、縮小して文字が大きくなっても重ねない。
  const yAxisTrackInset = Math.max(
    Y_AXIS_TRACK_INSET,
    axisEndStyle.fontSize * AXIS_LINE_HEIGHT + gap,
  );

  return (
    <section
      aria-label={t("ariaLabel")}
      className="pointer-events-none absolute z-10 grid select-none"
      data-testid="idea-value-feasibility-map"
      style={{
        left: plane.x - IDEA_MAP_WORLD_Y_AXIS_WIDTH,
        top: plane.y,
        width: plane.width + IDEA_MAP_WORLD_Y_AXIS_WIDTH,
        height: plane.height + IDEA_MAP_WORLD_X_AXIS_HEIGHT,
        gridTemplateColumns: `${IDEA_MAP_WORLD_Y_AXIS_WIDTH}px ${plane.width}px`,
        gridTemplateRows: `${plane.height}px ${IDEA_MAP_WORLD_X_AXIS_HEIGHT}px`,
      }}
    >
      <span className="sr-only">{t("title")}</span>
      <fieldset
        aria-label={t("valueScaleAriaLabel")}
        className="relative col-start-1 row-start-1 m-0 min-h-0 border-0 p-0 pr-3 text-muted-foreground"
      >
        <span
          className="absolute top-0 left-[calc(50%-6px)] -translate-x-1/2 font-medium"
          style={axisEndStyle}
        >
          {t("high")}
        </span>
        <AxisStroke
          axis="y"
          className="absolute left-[calc(50%-6px)] w-4 -translate-x-1/2"
          style={{
            top: yAxisTrackInset,
            height: `calc(100% - ${2 * yAxisTrackInset}px)`,
          }}
        />
        <span
          className="absolute top-1/2 left-[calc(50%-6px)] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-2 py-2 font-bold tracking-wide text-foreground"
          data-testid="idea-value-feasibility-map-y-axis-label"
          style={{ ...axisNameStyle, writingMode: "vertical-rl" }}
        >
          {t("value")}
        </span>
        <span
          className="absolute bottom-0 left-[calc(50%-6px)] -translate-x-1/2 font-medium"
          style={axisEndStyle}
        >
          {t("low")}
        </span>
      </fieldset>

      <div
        ref={planeRef}
        className="pointer-events-auto relative col-start-2 row-start-1 rounded-lg bg-primary-soft [--idea-map-note-scale:1]"
        data-canvas-background="true"
        data-coordinate-range="0-100"
        data-testid="idea-value-feasibility-map-plane"
        style={{ width: plane.width, height: plane.height }}
      >
        {/* 枠線は飾りとして重ね、付箋が端まで動ける範囲とマップ面の大きさをそろえる。 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] border border-border"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          data-testid="idea-value-feasibility-map-plane-grid"
          style={MAP_GRID_STYLE}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-line-strong"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-line-strong"
        />
        {children}
        {overlay ? (
          <div className="pointer-events-none absolute inset-0 z-[2147483647]">
            {overlay}
          </div>
        ) : null}
      </div>

      <fieldset
        aria-label={t("feasibilityScaleAriaLabel")}
        className="relative col-start-2 row-start-2 m-0 min-w-0 border-0 p-0 text-muted-foreground"
      >
        <div
          className="absolute inset-x-0 top-3 flex items-center whitespace-nowrap font-medium"
          data-testid="idea-value-feasibility-map-x-axis-row"
          style={{ ...axisEndStyle, gap, height: xAxisRowHeight }}
        >
          <span
            className="shrink-0"
            data-testid="idea-value-feasibility-map-x-low-label"
          >
            {t("feasibilityLow")}
          </span>
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-2 font-bold tracking-wide text-foreground"
            data-testid="idea-value-feasibility-map-x-axis-label"
            style={axisNameStyle}
          >
            {t("feasibility")}
          </span>
          <AxisStroke axis="x" className="h-4 min-w-0 flex-1" />
          <span
            className="shrink-0"
            data-testid="idea-value-feasibility-map-x-high-label"
          >
            {t("feasibilityHigh")}
          </span>
        </div>
      </fieldset>
    </section>
  );
}
