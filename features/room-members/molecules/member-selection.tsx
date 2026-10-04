import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MemberSelection({
  name,
  children,
  className,
  disabled = false,
  onSelect,
}: {
  name: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  if (!onSelect) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      aria-label={name || "名前未設定"}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.focus();
        onSelect();
      }}
      className={cn(
        "cursor-pointer rounded-md text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
