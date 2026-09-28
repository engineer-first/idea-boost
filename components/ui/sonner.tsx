// ライト表示の通知。表示位置だけを呼び出し側で変更できる。
"use client";

import { Toaster as SonnerToaster } from "sonner";

export type ToasterProps = {
  // 位置。既定は右下 (next.js での読みやすさを考慮)
  position?:
    | "top-left"
    | "top-right"
    | "top-center"
    | "bottom-left"
    | "bottom-right"
    | "bottom-center";
};

export function Toaster({ position = "bottom-right" }: ToasterProps = {}) {
  return (
    <SonnerToaster
      theme="light"
      position={position}
      // sonner の既定スタイルは shadcn 風に調整
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      richColors
      closeButton
    />
  );
}
