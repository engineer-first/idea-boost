import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  type IdeaSupportContentState,
  IdeaSupportSidebarContent,
} from "../molecules/idea-support-sidebar-content";
import { IdeaSupportSidebarHeader } from "../molecules/idea-support-sidebar-header";

export type IdeaSupportSidebarViewProps = {
  isOpen: boolean;
  isRequired: boolean;
  contentState: IdeaSupportContentState;
  onToggle: () => void;
};

export function IdeaSupportSidebarView({
  isOpen,
  isRequired,
  contentState,
  onToggle,
}: IdeaSupportSidebarViewProps) {
  return (
    <Card
      className={cn(
        "pointer-events-auto flex h-full flex-col overflow-hidden",
        isOpen ? "w-80" : "size-10",
      )}
      data-testid="idea-support-sidebar"
    >
      <IdeaSupportSidebarHeader
        isOpen={isOpen}
        canClose={!isRequired}
        onToggle={onToggle}
      />

      {isOpen ? <IdeaSupportSidebarContent status={contentState} /> : null}
    </Card>
  );
}
