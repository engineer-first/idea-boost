"use client";

import { useState } from "react";
import type { RecoveryItem } from "../logic/use-note-autosave";

export function NoteDraftRecovery({
  items,
}: {
  items: readonly RecoveryItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  if (items.length === 0) return null;
  return (
    <aside
      aria-label="未反映の文章"
      className="pointer-events-auto fixed right-3 bottom-20 z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-amber-300 bg-white p-3 text-slate-900 shadow-xl"
    >
      <p role="status" className="text-sm font-semibold">
        反映できなかった文章があります
      </p>
      <button
        type="button"
        className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "閉じる" : "確認・コピー"}
      </button>
      {expanded ? (
        <div className="mt-3 max-h-[min(55vh,24rem)] space-y-3 overflow-auto">
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
                className="rounded border px-2 py-1 text-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.text);
                    setCopyFailed(false);
                  } catch {
                    setCopyFailed(true);
                  }
                }}
              >
                コピー
              </button>
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
