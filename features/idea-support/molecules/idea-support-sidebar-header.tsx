"use client";

import { Lightbulb, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type IdeaSupportSidebarHeaderProps = {
  isOpen: boolean;
  canClose?: boolean;
  onToggle: () => void;
};

export function IdeaSupportSidebarHeader({
  isOpen,
  canClose = true,
  onToggle,
}: IdeaSupportSidebarHeaderProps) {
  const t = useTranslations("app.ideaSupportPanel");
  return (
    <div
      className={cn(
        "flex items-center",
        isOpen ? "justify-between p-3" : "justify-center p-0",
      )}
    >
      {isOpen ? (
        <>
          <div className="flex items-center gap-2">
            <Lightbulb className="size-5" aria-hidden="true" />

            <span className="font-semibold">Inspiration Tools</span>
          </div>

          {canClose ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label={t("close")}
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-lg p-0"
          onClick={onToggle}
          aria-label={t("open")}
        >
          <Lightbulb className="size-5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
