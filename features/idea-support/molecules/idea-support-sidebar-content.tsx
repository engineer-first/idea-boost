"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  IDEA_SUPPORT_DESCRIPTION,
  type IdeaSupportContent,
  type IdeaSupportType,
  ideaSupportContents,
} from "../logic/idea-support-content";

export type IdeaSupportContentState = "loading" | "empty" | "ready" | "error";

export type IdeaSupportSidebarContentProps = {
  status?: IdeaSupportContentState;
  defaultContentId?: IdeaSupportType;
  contents?: readonly IdeaSupportContent[];
};

export function IdeaSupportSidebarContent({
  status = "ready",
  defaultContentId = "osborn",
  contents = ideaSupportContents,
}: IdeaSupportSidebarContentProps) {
  const [expanded, setExpanded] = useState<
    Partial<Record<IdeaSupportType, boolean>>
  >({});
  const contentId = useId();
  if (status === "loading") {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        発想支援を読み込んでいます
      </p>
    );
  }

  if (status === "empty") {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        発想支援コンテンツはありません
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        発想支援コンテンツを表示できません
      </p>
    );
  }

  return (
    <div className="px-4 py-2">
      <Tabs defaultValue={defaultContentId} className="w-full gap-0">
        <TabsList
          variant="line"
          className="grid w-full grid-cols-4 gap-0 border-b border-border p-0 group-data-horizontal/tabs:h-7"
          aria-label="発想法"
        >
          {contents.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="h-7 rounded-none px-0 text-xs group-data-horizontal/tabs:after:bottom-0"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="pt-2">
          {contents.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <h3 className="mb-2 font-semibold">{item.title}</h3>

              <p className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                {item.content[0]}
              </p>
              {item.content.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-between"
                  aria-expanded={!!expanded[item.id]}
                  aria-controls={`${contentId}-${item.id}`}
                  onClick={() =>
                    setExpanded((previous) => ({
                      ...previous,
                      [item.id]: !previous[item.id],
                    }))
                  }
                >
                  {expanded[item.id]
                    ? "ほかの問いを閉じる"
                    : `ほかの問いを見る（${item.content.length - 1}）`}
                  {expanded[item.id] ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </Button>
              )}
              <ul
                id={`${contentId}-${item.id}`}
                hidden={!expanded[item.id]}
                className={
                  expanded[item.id]
                    ? "mt-2 list-disc space-y-2 pl-4 marker:text-muted-foreground"
                    : "hidden"
                }
              >
                {item.content.slice(1).map((text) => (
                  <li key={text} className="text-sm leading-relaxed">
                    {text}
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </div>
      </Tabs>
      <p className="mt-3 text-muted-foreground text-xs">
        {IDEA_SUPPORT_DESCRIPTION}
      </p>
    </div>
  );
}
