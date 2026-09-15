"use client";

import { useEffect, useState } from "react";

import type { IdeaSupportContentState } from "../molecules/idea-support-sidebar-content";
import { IdeaSupportSidebarView } from "../organisms/idea-support-sidebar-view";

export type IdeaSupportSidebarMode = "required" | "optional";

export type IdeaSupportSidebarProps = {
  mode?: IdeaSupportSidebarMode;
  contentState?: IdeaSupportContentState;
};

export function IdeaSupportSidebar({
  mode = "optional",
  contentState = "ready",
}: IdeaSupportSidebarProps) {
  const isRequired = mode === "required";
  const [isOpen, setIsOpen] = useState(isRequired);

  useEffect(() => {
    if (isRequired) {
      setIsOpen(true);
    }
  }, [isRequired]);

  return (
    <IdeaSupportSidebarView
      isOpen={isOpen}
      isRequired={isRequired}
      contentState={contentState}
      onToggle={() => setIsOpen((previous) => !previous)}
    />
  );
}
