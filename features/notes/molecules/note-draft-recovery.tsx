"use client";

import { useId, useState } from "react";
import type { RecoveryItem } from "../logic/use-note-autosave";

export function NoteDraftRecovery({
  items,
}: {
  items: readonly RecoveryItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedItem, setCopiedItem] = useState<RecoveryItem | null>(null);
  const contentId = useId();
  if (items.length === 0) return null;
  return (
    <aside
      aria-label="未反映の文章"
      className={`pointer-events-auto fixed z-[60] rounded-lg border border-amber-300 bg-white text-slate-900 shadow-xl ${expanded ? "right-3 bottom-20 w-[min(20rem,calc(100vw-1.5rem))] p-3" : "left-3 bottom-36 w-fit p-2"}`}
    >
      <p
        role="status"
        className={expanded ? "text-sm font-semibold" : "text-xs font-semibold"}
      >
        {expanded ? "反映できなかった文章があります" : "未反映の文章"}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? contentId : undefined}
        className="mt-2 min-h-11 rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "閉じる" : "確認・コピー"}
      </button>
      {expanded ? (
        <div
          id={contentId}
          className="mt-3 max-h-[min(55vh,24rem)] space-y-3 overflow-auto"
        >
          <p className="text-xs text-slate-600">
            閉じても文章はこの画面に残ります。現在の付箋と見比べて、必要な部分をコピーして使ってください。
          </p>
          {items.map((item, index) => (
            <div key={item.noteId}>
              <p className="text-xs text-slate-600">
                文章 {index + 1}: {item.reason}
              </p>
              <textarea
                aria-label={`未反映の文章 ${index + 1}`}
                readOnly
                value={item.text}
                className="mt-1 h-24 w-full resize-y rounded border p-2 text-sm"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="min-h-11 rounded border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
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
                コピー
              </button>
              {copiedItem?.noteId === item.noteId &&
              copiedItem.text === item.text ? (
                <p
                  role="status"
                  aria-label="コピー結果"
                  className="mt-1 text-xs"
                >
                  コピーしました
                </p>
              ) : null}
            </div>
          ))}
          {copyFailed ? (
            <p role="alert" className="text-xs">
              コピーできませんでした。文章を選択して手動でコピーしてください。
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
