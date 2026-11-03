"use client";

// Tooltip の薄いラッパー。Radix の機能を保ちつつ shadcn 風のスタイルと
// data-slot を提供する。
// TooltipProvider は通常アプリケーションのルート（layout.tsx）で 1 回だけ
// 配置するのが Radix の推奨パターン。
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipProvider = ({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    data-slot="tooltip-provider"
    delayDuration={delayDuration}
    {...props}
  />
);

const Tooltip = (props: React.ComponentProps<typeof TooltipPrimitive.Root>) => (
  <TooltipPrimitive.Root data-slot="tooltip-root" {...props} />
);

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    ref={ref}
    data-slot="tooltip-trigger"
    className={className}
    {...props}
  />
));
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-tool",
        "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
