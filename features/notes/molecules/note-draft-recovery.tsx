"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { RecoveryItem, RecoveryReason } from "../logic/use-note-autosave";

export function NoteDraftRecovery({
  items,
}: {
  items: readonly RecoveryItem[];
}) {
  const t = useTranslations("app.boardDraftRecovery");
  const reasonLabel = (reason: RecoveryReason): string => {
    switch (reason) {
      case "conflict":
        return t("reasons.conflict");
      case "not-editable":
        return t("reasons.notEditable");
      case "missing":
        return t("reasons.missing");
      case "interrupted-composition":
        return t("reasons.interruptedComposition");
      case "send-failed":
        return t("reasons.sendFailed");
      case "result-unknown":
        return t("reasons.resultUnknown");
      case "storage-unreadable":
        return t("reasons.storageUnreadable");
      case "storage-failure":
        return t("reasons.storageFailure");
      default:
        return t("reasons.storageFailure");
    }
  };
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedItem, setCopiedItem] = useState<RecoveryItem | null>(null);
  const contentId = useId();
  if (items.length === 0) return null;
  return (
    <aside
      aria-label={t("ariaLabel")}
      className={`pointer-events-auto fixed z-[60] rounded-xl border border-warning/40 bg-background text-foreground shadow-tool ${expanded ? "right-3 bottom-20 w-[min(20rem,calc(100vw-1.5rem))] p-3" : "left-3 bottom-36 w-fit p-2"}`}
    >
      <p
        role="status"
        className={
          expanded ? "text-base font-semibold" : "text-xs font-semibold"
        }
      >
        {expanded ? t("expandedTitle") : t("collapsedTitle")}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? contentId : undefined}
        className="mt-2 min-h-11 rounded-lg bg-foreground px-3 py-1.5 text-base text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? t("close") : t("reviewAndCopy")}
      </button>
      {expanded ? (
        <div
          id={contentId}
          className="mt-3 max-h-[min(55vh,24rem)] space-y-3 overflow-auto"
        >
          <p className="text-xs text-muted-foreground">{t("description")}</p>
          {items.map((item, index) => (
            <div key={item.noteId}>
              <p className="text-xs text-muted-foreground">
                {t("itemHeading", {
                  index: index + 1,
                  reason: reasonLabel(item.reason),
                })}
              </p>
              <textarea
                aria-label={t("textareaLabel", { index: index + 1 })}
                readOnly
                value={item.text}
                className="mt-1 h-24 w-full resize-y rounded-md border p-2 text-base"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="min-h-11 rounded-lg border px-3 py-1 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                onClick={async () => {
                  setCopiedItem(null);
                  setCopyFailed(false);
                  try {
                    await navigator.clipboard.writeText(item.text);
                    setCopyFailed(false);
                    setCopiedItem(item);
                  } catch {
                    setCopyFailed(true);
                  }
                }}
              >
                {t("copy")}
              </button>
              {copiedItem?.noteId === item.noteId &&
              copiedItem.text === item.text ? (
                <p
                  role="status"
                  aria-label={t("copyResult")}
                  className="mt-1 text-xs"
                >
                  {t("copied")}
                </p>
              ) : null}
            </div>
          ))}
          {copyFailed ? (
            <p role="alert" className="text-xs">
              {t("copyFailed")}
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
