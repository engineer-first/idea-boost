import {
  getNoteHeight,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_HEIGHT,
  NOTE_WIDTH,
} from "@/contracts/board";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import type { RoomOutcome } from "./outcome-text";

const OUTPUT_SCALE = 2;

const PADDING = 32;
const NOTE_GAP = 16;
const NOTE_PADDING = 8;
const CONTENT_WIDTH = NOTE_WIDTH - NOTE_PADDING * 2;

const TITLE_FONT_SIZE = 24;
const TITLE_LINE_HEIGHT = 32;
const TITLE_TO_NOTES_GAP = 20;

const NOTE_LINE_HEIGHT = Math.ceil(NOTE_DEFAULT_FONT_SIZE * 1.5);

// 共有された画像からアプリへたどれるよう、下端に小さく名前とURLを入れる。
// 本文の邪魔をしないよう、DESIGN.md の最小サイズ（12px）と補足色（muted）にする。
const BRAND_TEXT = "Idea Boost ideaboost.dev";
const BRAND_FONT_SIZE = 12;
const BRAND_LINE_HEIGHT = 16;
// 付箋の影（下方向に最大14px程度）と重ならない間隔。
const NOTES_TO_BRAND_GAP = 20;
const BRAND_BOTTOM_PADDING = 16;
const BRAND_FALLBACK_COLOR = "#516079";
const NOTE_VERTICAL_RESERVE = 56;

const MAX_CANVAS_DIMENSION = 16_384;
const MAX_CANVAS_PIXELS = 16_000_000;

const NOTES = [
  { number: "1", label: "決定した課題", key: "issue" },
  { number: "2", label: "決定した問い", key: "hmw" },
  { number: "3", label: "採用したアイデア", key: "idea" },
] as const;

type TextSegmenter = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => {
  segment(text: string): Iterable<{ segment: string }>;
};

/**
 * 絵文字や結合文字を途中で分割しないよう、
 * 可能なら書記素単位で文字列を分割する。
 */
function getTextSegments(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: TextSegmenter })
    .Segmenter;

  if (Segmenter) {
    return Array.from(
      new Segmenter("ja", { granularity: "grapheme" }).segment(text),
      (item) => item.segment,
    );
  }

  // 古いブラウザ向けのフォールバック。
  return Array.from(text);
}

/**
 * 実際の文字幅を計測して折り返す。
 * 明示的な改行も維持する。
 */
function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";

    for (const segment of getTextSegments(paragraph)) {
      const candidate = line + segment;

      if (line.length > 0 && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = segment;
      } else {
        line = candidate;
      }
    }

    if (line.length > 0) {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Canvasに角丸の矩形を描く。
 */
function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

/**
 * HTML側で使用しているフォントの読み込みを待つ。
 */
async function prepareFont(): Promise<string> {
  const fontFamily = getComputedStyle(document.body).fontFamily;

  try {
    // ページ側で読み込まれているフォントの準備を待つ。
    // ここでは新たなフォントのネットワーク読み込みを要求しない。
    await document.fonts.ready;
  } catch (error) {
    console.warn(
      "[PNG生成] フォント準備に失敗。代替フォントを使用します。",
      error,
    );
    return "sans-serif";
  }

  return fontFamily?.trim() || "sans-serif";
}

type RenderedNote = {
  title: string;
  titleLines: string[];
  bodyLines: string[];
  height: number;
};

/**
 * 1枚分の付箋の文字折り返しと高さを計算する。
 */
function prepareNote(
  context: CanvasRenderingContext2D,
  fontFamily: string,
  number: string,
  label: string,
  content: string,
): RenderedNote {
  const title = `${number}. ${label}`;

  context.font = `700 ${NOTE_DEFAULT_FONT_SIZE}px ${fontFamily}`;
  const titleLines = wrapText(context, title, CONTENT_WIDTH);

  context.font = `400 ${NOTE_DEFAULT_FONT_SIZE}px ${fontFamily}`;
  const bodyLines = wrapText(context, content, CONTENT_WIDTH);

  // 既存StickyNoteの高さ計算を下限として利用する。
  // 実測幅による折り返しのほうが多い場合は、そちらを優先する。
  const existingHeight = getNoteHeight(
    `${title}\n${content}`,
    NOTE_DEFAULT_FONT_SIZE,
  );

  const measuredHeight =
    NOTE_VERTICAL_RESERVE +
    (titleLines.length + bodyLines.length) * NOTE_LINE_HEIGHT;

  return {
    title,
    titleLines,
    bodyLines,
    height: Math.max(NOTE_HEIGHT, existingHeight, measuredHeight),
  };
}

/**
 * 1枚の付箋をCanvasに描画する。
 */
function drawNote(
  context: CanvasRenderingContext2D,
  note: RenderedNote,
  fontFamily: string,
  x: number,
  y: number,
): void {
  const colors = NOTE_COLOR_STYLES.yellow;

  context.save();

  // 既存付箋を参考に、下方向へ落ちる紙の影を付ける。
  context.shadowColor = "rgba(15, 23, 31, 0.30)";
  context.shadowBlur = 8;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 6;

  context.fillStyle = colors.backgroundColor;
  drawRoundedRect(context, x, y, NOTE_WIDTH, note.height, 2);
  context.fill();

  context.restore();

  context.fillStyle = colors.foregroundColor;
  context.textAlign = "left";
  context.textBaseline = "top";

  // 付箋の見出し。
  context.font = `700 ${NOTE_DEFAULT_FONT_SIZE}px ${fontFamily}`;

  note.titleLines.forEach((line, index) => {
    context.fillText(
      line,
      x + NOTE_PADDING,
      y + NOTE_PADDING + index * NOTE_LINE_HEIGHT,
    );
  });

  // 付箋の本文。
  context.font = `400 ${NOTE_DEFAULT_FONT_SIZE}px ${fontFamily}`;

  const bodyTop = y + NOTE_PADDING + note.titleLines.length * NOTE_LINE_HEIGHT;

  note.bodyLines.forEach((line, index) => {
    context.fillText(
      line,
      x + NOTE_PADDING,
      bodyTop + index * NOTE_LINE_HEIGHT,
    );
  });
}

/**
 * CanvasをPNG Blobに変換する。
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG画像を生成できませんでした。"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

/**
 * 成果3件を横並びの付箋画像に変換する。
 *
 * 参加者情報や未共有メモは受け取らず、
 * RoomOutcomeの3項目だけを画像化する。
 */
export async function createOutcomePng(outcome: RoomOutcome): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("ブラウザでのみPNGを生成できます。");
  }

  const fontFamily = await prepareFont();

  // Canvasを作成し、文字幅を計測する。
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");

  if (!measureContext) {
    throw new Error("Canvasを利用できません。");
  }

  const renderedNotes = NOTES.map(({ number, label, key }) =>
    prepareNote(measureContext, fontFamily, number, label, outcome[key]),
  );

  const canvasWidth =
    PADDING * 2 + NOTE_WIDTH * NOTES.length + NOTE_GAP * (NOTES.length - 1);

  const notesTop = PADDING + TITLE_LINE_HEIGHT + TITLE_TO_NOTES_GAP;
  const notesHeight = Math.max(...renderedNotes.map((note) => note.height));
  const brandTop = notesTop + notesHeight + NOTES_TO_BRAND_GAP;
  const canvasHeight = brandTop + BRAND_LINE_HEIGHT + BRAND_BOTTOM_PADDING;

  const pixelWidth = Math.ceil(canvasWidth * OUTPUT_SCALE);
  const pixelHeight = Math.ceil(canvasHeight * OUTPUT_SCALE);
  const totalPixels = pixelWidth * pixelHeight;

  // ブラウザのCanvas容量を超える画像は生成しない。
  if (
    pixelWidth > MAX_CANVAS_DIMENSION ||
    pixelHeight > MAX_CANVAS_DIMENSION ||
    totalPixels > MAX_CANVAS_PIXELS
  ) {
    throw new Error(
      "画像が大きすぎてPNGを生成できません。テキスト保存をご利用ください。",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  try {
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Canvasを利用できません。");
    }

    context.scale(OUTPUT_SCALE, OUTPUT_SCALE);

    const bodyStyle = getComputedStyle(document.body);
    const backgroundColor =
      bodyStyle.backgroundColor === "rgba(0, 0, 0, 0)"
        ? "#F8F7F2"
        : bodyStyle.backgroundColor;
    const foregroundColor = bodyStyle.color || "#0F172A";
    const brandColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ib-color-muted")
        .trim() || BRAND_FALLBACK_COLOR;

    // 不透明な背景。
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    // タイトル。
    context.fillStyle = foregroundColor;
    context.font = `700 ${TITLE_FONT_SIZE}px ${fontFamily}`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText("チームで決めた成果", PADDING, PADDING);

    // 3枚の付箋を横並びに描画する。
    renderedNotes.forEach((note, index) => {
      const x = PADDING + index * (NOTE_WIDTH + NOTE_GAP);
      drawNote(context, note, fontFamily, x, notesTop);
    });

    // 下端右寄せにアプリ名とURL。
    context.fillStyle = brandColor;
    context.font = `400 ${BRAND_FONT_SIZE}px ${fontFamily}`;
    context.textAlign = "right";
    context.textBaseline = "top";
    context.fillText(
      BRAND_TEXT,
      canvasWidth - PADDING,
      brandTop + (BRAND_LINE_HEIGHT - BRAND_FONT_SIZE) / 2,
    );

    const blob = await canvasToBlob(canvas);

    return blob;
  } finally {
    // 大きなCanvasのメモリを解放する。
    canvas.width = 0;
    canvas.height = 0;
  }
}
