"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type {
  IdeaSupportContent,
  IdeaSupportType,
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
  contents,
}: IdeaSupportSidebarContentProps) {
  const t = useTranslations("app.ideaSupportPanel");
  const translate = t as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const getPrompts = (method: string, count: number): string[] =>
    Array.from({ length: count }, (_, index) =>
      translate(`methods.${method}.prompts.p${index + 1}`),
    );
  const translatedContents: IdeaSupportContent[] = [
    {
      id: "osborn",
      label: translate("methods.osborn.label"),
      title: translate("methods.osborn.title"),
      content: getPrompts("osborn", 8),
    },
    {
      id: "scamper",
      label: translate("methods.scamper.label"),
      title: translate("methods.scamper.title"),
      content: getPrompts("scamper", 7),
    },
    {
      id: "reverse",
      label: translate("methods.reverse.label"),
      title: translate("methods.reverse.title"),
      content: getPrompts("reverse", 3),
    },
    {
      id: "industry",
      label: translate("methods.industry.label"),
      title: translate("methods.industry.title"),
      content: getPrompts("industry", 4),
    },
  ];
  const displayContents = contents ?? translatedContents;
  const [expanded, setExpanded] = useState<
    Partial<Record<IdeaSupportType, boolean>>
  >({});
  const contentId = useId();
  if (status === "loading") {
    return (
      <p className="p-4 text-base text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (status === "empty") {
    return (
      <p className="p-4 text-base text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="p-4 text-base text-destructive" role="alert">
        {t("error")}
      </p>
    );
  }

  return (
    <div className="px-4 py-2">
      <Tabs defaultValue={defaultContentId} className="w-full gap-0">
        <TabsList
          variant="line"
          className="grid w-full grid-cols-4 gap-0 border-b border-border p-0 group-data-horizontal/tabs:h-7"
          aria-label={t("tabAria")}
        >
          {displayContents.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="h-7 rounded-none px-0 text-xs group-data-horizontal/tabs:after:bottom-0"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <p className="pt-2 text-muted-foreground text-xs">
          {t("description")}
        </p>
        <div className="pt-2">
          {displayContents.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <h3 className="mb-2 font-semibold">{item.title}</h3>

              <p className="rounded-lg bg-muted/50 p-3 text-base leading-relaxed">
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
                    ? t("collapsePerspectives")
                    : t("showPerspectives", { count: item.content.length - 1 })}
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
                  <li key={text} className="text-base leading-relaxed">
                    {text}
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
