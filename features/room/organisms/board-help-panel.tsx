import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HmwTemplatePanel } from "@/features/hmw";
import {
  IdeaGuidePanel,
  IdeaSupportSidebarContent,
} from "@/features/idea-support";
import type { BoardHelpControls } from "../logic/use-board-help";

export type BoardHelpPanelProps = BoardHelpControls & {
  disabled: boolean;
  onHmwTemplateSelect: (content: string) => void;
  onIdeaHintSelect: (content: string) => void;
};

export function BoardHelpPanel({
  kind,
  isOpen,
  tab,
  disabled,
  onOpenChange,
  onTabChange,
  onHmwTemplateSelect,
  onIdeaHintSelect,
}: BoardHelpPanelProps) {
  if (kind === null) return null;
  return (
    <aside
      aria-label="考えるヒント"
      data-testid="board-help-panel"
      data-open={isOpen}
      className={`pointer-events-none flex min-h-0 w-80 max-w-full flex-1 items-start max-[639px]:w-full ${isOpen ? "max-[639px]:absolute max-[639px]:left-0 max-[639px]:top-[calc(var(--board-location-height,80px)+3.5rem)] max-[639px]:z-40 max-[639px]:h-[140px]" : ""}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        onOpenChange(false);
        event.currentTarget
          .querySelector<HTMLButtonElement>("[data-help-toggle]")
          ?.focus();
      }}
    >
      <div
        className={`board-hud pointer-events-auto flex max-h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm ${isOpen ? "h-full" : ""}`}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full shrink-0 justify-between max-[639px]:h-[42px] max-[639px]:px-2 rounded-none bg-background px-4 hover:bg-background aria-expanded:bg-background"
          data-help-toggle
          aria-label={`考えるヒントを${isOpen ? "閉じる" : "開く"}`}
          aria-expanded={isOpen}
          aria-controls="board-help-content"
          onClick={() => onOpenChange(!isOpen)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold max-[639px]:gap-1 max-[639px]:text-xs">
            <Lightbulb
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span className="max-[639px]:hidden">考えるヒント</span>
            <span className="hidden max-[639px]:inline">ヒント</span>
          </span>
          {isOpen ? (
            <ChevronUp aria-hidden="true" className="max-[639px]:hidden" />
          ) : (
            <ChevronDown aria-hidden="true" className="max-[639px]:hidden" />
          )}
        </Button>
        <div
          hidden={!isOpen}
          className={isOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {kind === "idea" ? (
            <Tabs
              value={tab}
              className="min-h-0 flex-1 gap-0"
              onValueChange={(value) => {
                if (value === "write" || value === "expand") onTabChange(value);
              }}
            >
              <TabsList
                variant="line"
                className="mx-4 grid w-auto shrink-0 grid-cols-2 border-b border-border p-0 group-data-horizontal/tabs:h-8"
                aria-label="考えるヒントの種類"
              >
                <TabsTrigger
                  value="write"
                  className="h-8 rounded-none group-data-horizontal/tabs:after:bottom-0"
                >
                  書き出し
                </TabsTrigger>
                <TabsTrigger
                  value="expand"
                  className="h-8 rounded-none group-data-horizontal/tabs:after:bottom-0"
                >
                  発想を広げる
                </TabsTrigger>
              </TabsList>
              <div
                id="board-help-content"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <TabsContent value="write">
                  {isOpen ? (
                    <IdeaGuidePanel
                      className="w-full rounded-none border-0 shadow-none"
                      disabled={disabled}
                      onHintSelect={onIdeaHintSelect}
                    />
                  ) : null}
                </TabsContent>
                <TabsContent
                  value="expand"
                  forceMount
                  hidden={tab !== "expand"}
                  className={tab !== "expand" ? "hidden" : undefined}
                >
                  <IdeaSupportSidebarContent />
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div
              id="board-help-content"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {kind === "hmw" ? (
                isOpen ? (
                  <HmwTemplatePanel
                    className="w-full rounded-none border-0 shadow-none"
                    disabled={disabled}
                    onTemplateSelect={onHmwTemplateSelect}
                  />
                ) : null
              ) : (
                <IdeaSupportSidebarContent />
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
