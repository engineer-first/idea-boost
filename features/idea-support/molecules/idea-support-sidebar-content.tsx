import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
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

              <ul className="list-disc space-y-2 pl-4 marker:text-muted-foreground">
                {item.content.map((text) => (
                  <li key={text} className="text-sm leading-relaxed">
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
