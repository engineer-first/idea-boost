import { Separator } from "@/components/ui/separator";
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
    <div className="flex-1 overflow-auto">
      <Tabs defaultValue={defaultContentId} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {contents.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="
                flex-1
                rounded-none
                border-0
                border-b-2
                border-transparent
                bg-transparent
                shadow-none
                focus-visible:ring-0
                data-[state=active]:border-primary
                data-[state=active]:bg-transparent
                data-[state=active]:shadow-none
              "
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Separator />

        <div className="p-4">
          {contents.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <h3 className="mb-3 font-semibold">{item.title}</h3>

              <ul className="space-y-2">
                {item.content.map((text) => (
                  <li key={text} className="text-sm">
                    ・{text}
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
