"use client";

import { useState } from "react";
import type { DemoCheckpoint, DemoStatus } from "@/contracts/demo";
import { DemoPanelView } from "./demo-panel-view";
import { useDemoCreate } from "./use-demo-create";
import { useDemoPanel } from "./use-demo-panel";

export type DemoPanelProps = { roomId: string; initialStatus: DemoStatus };

export function DemoPanel({ roomId, initialStatus }: DemoPanelProps) {
  const panel = useDemoPanel(roomId, initialStatus);
  const creation = useDemoCreate();
  const [checkpoint, setCheckpoint] = useState<DemoCheckpoint>(
    initialStatus.checkpoint,
  );
  return (
    <DemoPanelView
      expanded={panel.expanded}
      status={panel.status}
      pending={panel.pending || creation.pending}
      error={creation.error ?? panel.error}
      checkpoint={checkpoint}
      onToggle={panel.toggle}
      onAction={panel.action}
      onCheckpointChange={setCheckpoint}
      onCreate={creation.create}
      onRetry={() => {
        creation.clearError();
        void panel.refresh();
      }}
    />
  );
}
