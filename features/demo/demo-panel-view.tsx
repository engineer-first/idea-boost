import { Button } from "@/components/ui/button";
import type { DemoAction, DemoCheckpoint, DemoStatus } from "@/contracts/demo";
import { getRoomPhaseLabel } from "@/contracts/phase";
import { DEMO_CHECKPOINTS, DEMO_FREEDOM, getDemoScript } from "./demo-copy";

export type DemoPanelViewProps = {
  expanded: boolean;
  status: DemoStatus | null;
  pending: boolean;
  error: string | null;
  checkpoint: DemoCheckpoint;
  onToggle: () => void;
  onAction: (action: DemoAction) => void;
  onCheckpointChange: (checkpoint: DemoCheckpoint) => void;
  onCreate: (checkpoint: DemoCheckpoint) => void;
  onRetry: () => void;
};

export function DemoPanelView({
  expanded,
  status,
  pending,
  error,
  checkpoint,
  onToggle,
  onAction,
  onCheckpointChange,
  onCreate,
  onRetry,
}: DemoPanelViewProps) {
  return (
    <aside
      className="fixed bottom-28 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-lg"
      aria-label="説明者用デモ操作"
    >
      <Button
        variant="outline"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="demo-controls"
        className="w-full"
      >
        デモ操作
      </Button>
      {expanded && (
        <div
          id="demo-controls"
          className="max-h-[70vh] w-96 max-w-full space-y-4 overflow-y-auto p-4"
        >
          {status ? (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                {getRoomPhaseLabel(status.phase)}
              </p>
              <p className="text-sm leading-relaxed">
                {getDemoScript(status.phase)}
              </p>
              <p role="status" className="text-sm">
                共有 {status.sharedCount}/4人・投票 {status.votedCount}/4人
              </p>
              <div className="flex flex-wrap gap-2">
                {status.availableActions.map((action) => (
                  <Button
                    key={action}
                    disabled={pending || Boolean(error)}
                    onClick={() => onAction(action)}
                  >
                    {action === "share" ? "他4人が共有する" : "他4人が投票する"}
                  </Button>
                ))}
              </div>
              {status.availableActions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  この場面では通常のボード操作で進めてください。
                </p>
              )}
            </>
          ) : (
            !error && <p role="status">状況を読み込み中…</p>
          )}
          {pending && (
            <p className="text-sm" role="status">
              操作を実行中…
            </p>
          )}
          {error && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button variant="outline" disabled={pending} onClick={onRetry}>
                状況を再取得
              </Button>
            </div>
          )}
          <div className="space-y-2 border-t pt-3">
            <label htmlFor="demo-checkpoint" className="text-sm font-medium">
              見せ場
            </label>
            <select
              id="demo-checkpoint"
              value={checkpoint}
              disabled={pending}
              onChange={(event) =>
                onCheckpointChange(event.target.value as DemoCheckpoint)
              }
              className="w-full rounded-md border bg-background p-2 text-sm"
            >
              {DEMO_CHECKPOINTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => onCreate(checkpoint)}
              >
                見せ場へ移動
              </Button>
              <Button
                variant="outline"
                disabled={pending || !status}
                onClick={() => status && onCreate(status.checkpoint)}
              >
                やり直す
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              移動・やり直しでは新しいデモルームを作ります。
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {DEMO_FREEDOM}
          </p>
        </div>
      )}
    </aside>
  );
}
