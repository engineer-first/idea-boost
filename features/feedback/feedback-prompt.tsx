"use client";
import { Button } from "@/components/ui/button";
import type { FeedbackControls } from "./use-feedback";
export function FeedbackPrompt({ feedback }: { feedback: FeedbackControls }) {
  if (!feedback.promptVisible) return null;
  return (
    <aside
      aria-label="感想の案内"
      className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
    >
      <p role="status" className="mr-auto text-sm">
        使ってみた感想を送りませんか？
      </p>
      <Button variant="outline" onClick={() => feedback.open("app")}>
        感想を送る
      </Button>
      <Button variant="ghost" onClick={feedback.dismissPrompt}>
        案内を閉じる
      </Button>
    </aside>
  );
}
