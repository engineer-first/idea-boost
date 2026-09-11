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
      className="pointer-events-none flex min-h-0 w-80 max-w-full flex-1 items-start"
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
          className="h-9 w-full shrink-0 justify-between rounded-none bg-background px-4 hover:bg-background aria-expanded:bg-background dark:hover:bg-background"
          data-help-toggle
          aria-label={`考えるヒントを${isOpen ? "閉じる" : "開く"}`}
          aria-expanded={isOpen}
          aria-controls="board-help-content"
          onClick={() => onOpenChange(!isOpen)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            考えるヒント
          </span>
          {isOpen ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </Button>
        {isOpen ? (
          kind === "idea" ? (
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
                  <IdeaGuidePanel
                    className="w-full rounded-none border-0 shadow-none"
                    disabled={disabled}
                    onHintSelect={onIdeaHintSelect}
                  />
                </TabsContent>
                <TabsContent value="expand">
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
                <HmwTemplatePanel
                  className="w-full rounded-none border-0 shadow-none"
                  disabled={disabled}
                  onTemplateSelect={onHmwTemplateSelect}
                />
              ) : (
                <IdeaSupportSidebarContent />
              )}
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
