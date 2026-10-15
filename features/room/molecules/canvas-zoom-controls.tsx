"use client";

import {
  ChevronDown,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  MoveHistoryControls,
  type MoveHistoryControlsProps,
} from "./move-history-controls";

export type CanvasZoomControlsProps = {
  moveHistory?: MoveHistoryControlsProps;
  interactionTool?: "select" | "hand";
  onToolChange?: (tool: "select" | "hand") => void;
  toolDisabled?: boolean;
  zoom: number;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onFitToNotes: () => void;
  onZoomChange?: (zoom: number) => void;
  onFitToSelection?: () => void;
};

export function CanvasZoomControls({
  moveHistory,
  interactionTool = "select",
  onToolChange,
  toolDisabled = false,
  zoom,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onFitToNotes,
  onZoomChange,
  onFitToSelection,
}: CanvasZoomControlsProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const [zoomError, setZoomError] = useState(false);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const zoomOpenRef = useRef(zoomOpen);
  zoomOpenRef.current = zoomOpen;
  const restoreZoomFocusRef = useRef(false);
  const zoomInputId = useId();
  const zoomErrorId = useId();
  function applyZoom(action: () => void): void {
    action();
    restoreZoomFocusRef.current = true;
    setZoomOpen(false);
  }
  const helpRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const help = helpRef.current;
    if (!help) return;
    const ownerDocument = help.ownerDocument;
    // 閉じるだけに留め、外側の選択・pan・native controlへ同じ操作を渡す。
    function dismissOutside(event: Event): void {
      if (
        help?.open &&
        event.target instanceof Node &&
        !help.contains(event.target)
      )
        help.open = false;
    }
    const events = ["pointerdown", "click", "focusin", "wheel"] as const;
    for (const name of events)
      ownerDocument.addEventListener(name, dismissOutside, true);
    return () => {
      for (const name of events)
        ownerDocument.removeEventListener(name, dismissOutside, true);
    };
  }, []);
  return (
    <TooltipProvider delayDuration={1000}>
      <fieldset
        className="board-hud pointer-events-auto relative flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-lg shadow-black/5"
        data-testid="canvas-zoom-controls"
        aria-label="キャンバス表示操作"
        aria-description="方向キーで視野を移動、PageUp・PageDownで上下に読む。視野とズームの変更は自分だけの表示です"
      >
        {onToolChange ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={interactionTool === "select" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="選択ツール"
                  aria-pressed={interactionTool === "select"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("select")}
                >
                  <MousePointer2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">選択（背景でV）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={interactionTool === "hand" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="手のひらツール"
                  aria-pressed={interactionTool === "hand"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("hand")}
                >
                  <Hand aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                手のひら（背景でH）。Space＋ドラッグで一時的に画面移動
              </TooltipContent>
            </Tooltip>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          </>
        ) : null}
        {moveHistory ? (
          <>
            <MoveHistoryControls {...moveHistory} />
            <span
              aria-hidden="true"
              className="mx-0.5 h-5 w-px bg-border max-[399px]:hidden"
            />
          </>
        ) : null}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={toolDisabled || zoom <= 0.01}
                aria-label="キャンバスを縮小"
                onClick={onZoomOut}
              >
                <Minus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              キャンバスを縮小（自分だけの表示）
            </TooltipContent>
          </Tooltip>
          <Popover
            open={zoomOpen && !toolDisabled}
            onOpenChange={(open) => {
              setZoomOpen(open);
              if (open) {
                restoreZoomFocusRef.current = false;
                setZoomInput(String(Math.round(zoom * 100)));
                setZoomError(false);
              }
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    ref={zoomTriggerRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-w-16 gap-1 px-2 tabular-nums"
                    disabled={toolDisabled}
                    aria-label="ズーム倍率を変更"
                  >
                    {Math.round(zoom * 100)}%
                    <ChevronDown aria-hidden="true" className="size-3" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">
                ズーム倍率を変更（自分だけの表示）
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              align="start"
              aria-label="キャンバスのズーム"
              data-board-native-control="true"
              onEscapeKeyDown={() => {
                restoreZoomFocusRef.current = true;
              }}
              onInteractOutside={() => {
                restoreZoomFocusRef.current = false;
              }}
              onCloseAutoFocus={(event) => {
                // 閉じるアニメーション中に再度開いても、古いfocus scopeに
                // フォーカスを奪われない。外側クリックのfocusは通常どおり。
                if (zoomOpenRef.current) event.preventDefault();
                else if (restoreZoomFocusRef.current) {
                  event.preventDefault();
                  zoomTriggerRef.current?.focus();
                }
              }}
              className="w-64 max-w-[calc(100vw-1.5rem)] space-y-3"
            >
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = zoomInput
                    .trim()
                    .replace(/[%％]$/, "")
                    .trim();
                  const percentage = /^\d+(?:\.\d+)?$/.test(value)
                    ? Number(value)
                    : Number.NaN;
                  if (
                    !Number.isFinite(percentage) ||
                    percentage < 1 ||
                    percentage > 400
                  ) {
                    setZoomError(true);
                    return;
                  }
                  if (onZoomChange)
                    applyZoom(() => onZoomChange(percentage / 100));
                }}
              >
                <label
                  htmlFor={zoomInputId}
                  className="mb-2 block text-sm font-medium"
                >
                  ズーム倍率（%）
                </label>
                <div className="flex gap-2">
                  <Input
                    id={zoomInputId}
                    inputMode="decimal"
                    value={zoomInput}
                    disabled={!onZoomChange}
                    aria-invalid={zoomError}
                    aria-describedby={zoomError ? zoomErrorId : undefined}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      setZoomInput(event.target.value);
                      setZoomError(false);
                    }}
                  />
                  <Button type="submit" size="sm" disabled={!onZoomChange}>
                    適用
                  </Button>
                </div>
                {zoomError ? (
                  <p
                    id={zoomErrorId}
                    role="alert"
                    className="mt-2 text-sm text-destructive"
                  >
                    1〜400の数値を入力してください。
                  </p>
                ) : null}
              </form>
              <div className="flex gap-2">
                {[50, 100, 200].map((percent) => (
                  <Button
                    key={percent}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 tabular-nums"
                    aria-label={
                      percent === 100 ? "100%に戻す" : `${percent}%で表示`
                    }
                    disabled={percent !== 100 && !onZoomChange}
                    onClick={() =>
                      applyZoom(() =>
                        percent === 100
                          ? onResetZoom()
                          : onZoomChange?.(percent / 100),
                      )
                    }
                  >
                    {percent}%
                  </Button>
                ))}
              </div>
              <div className="border-t border-border pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => applyZoom(onFitToNotes)}
                >
                  付箋全体を表示{" "}
                  <kbd className="text-xs text-muted-foreground">Shift+1</kbd>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  disabled={!onFitToSelection}
                  onClick={() => {
                    if (onFitToSelection) applyZoom(onFitToSelection);
                  }}
                >
                  選択した付箋を表示{" "}
                  <kbd className="text-xs text-muted-foreground">Shift+2</kbd>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                自分だけの表示です
              </p>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={toolDisabled || zoom >= 4}
                aria-label="キャンバスを拡大"
                onClick={onZoomIn}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              キャンバスを拡大（自分だけの表示）
            </TooltipContent>
          </Tooltip>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={toolDisabled}
                aria-label="付箋全体を表示"
                onClick={onFitToNotes}
              >
                <Maximize2 aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              付箋全体を表示（自分だけの表示）
            </TooltipContent>
          </Tooltip>
          <details
            ref={helpRef}
            data-canvas-help="true"
            onKeyDown={(event) => {
              if (
                event.key !== "Escape" ||
                event.nativeEvent.isComposing ||
                !event.currentTarget.open
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }}
          >
            <summary
              aria-label="キャンバス操作のヒント"
              className="flex size-7 cursor-pointer list-none items-center justify-center rounded text-sm font-bold hover:bg-muted focus-visible:outline-2"
            >
              ?
            </summary>
            <section
              aria-label="キャンバス操作のヒント内容"
              data-testid="canvas-operation-help"
              onKeyDown={(event) => {
                if (
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229 &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey &&
                  [
                    "ArrowDown",
                    "ArrowUp",
                    "ArrowLeft",
                    "ArrowRight",
                    "PageDown",
                    "PageUp",
                  ].includes(event.key)
                ) {
                  // 既定の本文スクロールを保ち、祖先HUDのカメラ操作だけへ渡さない。
                  event.stopPropagation();
                }
              }}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: スクロールするヒントをキーボードで読み、Escapeを内側で処理するため。
              tabIndex={0}
              className="absolute bottom-full left-0 z-50 mb-2 max-h-[calc(100dvh-13rem)] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-4 text-sm leading-6 shadow-lg focus-visible:outline-2"
            >
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <h2 className="text-base font-semibold">操作ヒント</h2>
                <span className="shrink-0 text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                    Escape
                  </kbd>
                  で閉じる
                </span>
              </div>
              <dl className="space-y-4">
                <div>
                  <dt className="font-semibold">マイ付箋を追加する</dt>
                  <dd className="mt-1 space-y-1">
                    <p>Macは⌘＋Enter、Windows等はCtrl＋Enter。</p>
                    <p>
                      個人作業（1-1・2-1・3-1）で、背景・マイ付箋・本文入力中に1枚追加します。本文のEnterは改行です。
                    </p>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">付箋を選ぶ</dt>
                  <dd className="mt-1 space-y-1">
                    <p>選択ツールで空白を囲むと、複数選択。</p>
                    <p>
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        Shift
                      </kbd>{" "}
                      ＋ クリックで追加・解除。
                    </p>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">拡大・縮小する</dt>
                  <dd className="mt-1 space-y-1">
                    <p>
                      倍率を押すと数値入力と全体・選択表示。＋/−で拡大・縮小。
                    </p>
                    <p>
                      Ctrl /
                      ⌘＋ホイール、またはピンチ。通常のスクロールは画面移動。
                    </p>
                    <p>
                      背景でShift＋0は100%、Shift＋1は全体、Shift＋2は選択。
                    </p>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">画面を動かす</dt>
                  <dd className="mt-1 space-y-1">
                    <p>
                      背景で{" "}
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        V
                      </kbd>{" "}
                      は選択、
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        H
                      </kbd>{" "}
                      は手のひら。
                    </p>
                    <p>
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        Space
                      </kbd>{" "}
                      を押しながらドラッグで画面移動。
                    </p>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">付箋を編集する</dt>
                  <dd className="mt-1">
                    編集できる付箋を選び、もう一度クリックまたは{" "}
                    <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                      Enter
                    </kbd>{" "}
                    で編集。
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">操作を終了する</dt>
                  <dd className="mt-1">
                    <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                      Escape
                    </kbd>{" "}
                    で編集・操作・選択の順に、1段ずつ終了。
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">マイ付箋を削除する</dt>
                  <dd className="mt-1 space-y-1">
                    <p>
                      個人作業中は、選択した付箋を{" "}
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        Delete
                      </kbd>{" "}
                      または{" "}
                      <kbd className="rounded border border-border bg-muted px-1 font-mono text-sm">
                        Backspace
                      </kbd>{" "}
                      で削除。
                    </p>
                    <p className="text-muted-foreground">
                      編集中は本文の文字を削除します。
                    </p>
                  </dd>
                </div>
              </dl>
            </section>
          </details>
        </div>
      </fieldset>
    </TooltipProvider>
  );
}
