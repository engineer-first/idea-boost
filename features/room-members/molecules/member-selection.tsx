import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MemberSelection({
  name,
  action,
  children,
  className,
  disabled = false,
  onSelect,
}: {
  name: string;
  /** 押すと名前の人に何をするか。読み上げ名に添えて、押す前に分かるようにする。 */
  action?: "remove";
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const t = useTranslations("app.members");
  if (!onSelect) return <div className={className}>{children}</div>;
  const displayName = name || t("unnamed");
  return (
    <button
      type="button"
      aria-label={
        action === "remove"
          ? t("removeFromRoom", { name: displayName })
          : displayName
      }
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.focus();
        onSelect();
      }}
      className={cn(
        "cursor-pointer rounded-lg text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
