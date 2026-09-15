import { Button } from "@/components/ui/button";
import type { DemoCheckpoint } from "@/contracts/demo";
import {
  DEMO_CHECKPOINTS,
  DEMO_FREEDOM,
  DEMO_INTRO,
  DEMO_PHASE_SECTIONS,
} from "./demo-copy";

export type DemoEntryViewProps = {
  checkpoint: DemoCheckpoint;
  pending: boolean;
  error: string | null;
  onCheckpointChange: (checkpoint: DemoCheckpoint) => void;
  onStart: () => void;
};

export function DemoEntryView({
  checkpoint,
  pending,
  error,
  onCheckpointChange,
  onStart,
}: DemoEntryViewProps) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-7 overflow-y-auto px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">
          Idea Boost · ローカルデモ
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          5人の具体例で、課題からアイデア決定まで
        </h1>
        <p className="leading-relaxed text-muted-foreground">{DEMO_INTRO}</p>
      </header>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3 shadow-sm">
        <Button size="lg" disabled={pending} onClick={onStart}>
          {pending ? "デモを準備中…" : "デモを開始"}
        </Button>
        <p className="text-sm text-muted-foreground">
          選択中：
          {DEMO_CHECKPOINTS.find((item) => item.value === checkpoint)?.label}
        </p>
      </div>
      <fieldset disabled={pending} className="space-y-6">
        <legend className="mb-3 font-semibold">
          どのステップから始めますか
        </legend>
        {DEMO_PHASE_SECTIONS.map((section) => (
          <div key={section.phase} className="space-y-3">
            <h2 className="font-semibold">{section.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {DEMO_CHECKPOINTS.filter(
                (item) => item.phase === section.phase,
              ).map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="checkpoint"
                    value={item.value}
                    checked={checkpoint === item.value}
                    onChange={() => onCheckpointChange(item.value)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {DEMO_FREEDOM}
      </p>
    </main>
  );
}
